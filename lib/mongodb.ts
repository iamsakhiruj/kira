/**
 * MongoDB connection with a client cached across hot reloads.
 *
 * In development Next.js re-evaluates modules on every change; without caching
 * that opens a new connection pool each time and exhausts the server. We stash
 * the connect() promise on globalThis so the pool survives reloads. In
 * production a single module instance is fine.
 *
 * The URI is read lazily (on first use) so that `next build` and unit tests,
 * which never touch the database, don't require it to be set. It is validated
 * for shape before connecting, and low-level connection errors are translated
 * into a safe, actionable DbUnavailableError — never the raw error, which can
 * contain the connection string (and password).
 */

import { MongoClient, type Db } from "mongodb";
import { assertValidMongoUri } from "./mongoUri";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * The database can't be reached or is misconfigured. A distinct type so
 * callers (e.g. the login action) can tell infrastructure failure apart from
 * ordinary errors. The message is always safe to show; the original error is
 * kept on `cause` for server-side logging.
 */
export class DbUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DbUnavailableError";
  }
}

let clientPromise: Promise<MongoClient> | null = null;

function translateConnectionError(err: unknown): DbUnavailableError {
  const e = err as { name?: string; code?: string; cause?: { code?: string } };
  const code = e?.code ?? e?.cause?.code;
  const message = String((err as { message?: string })?.message ?? "");
  const dns =
    /querySrv|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message) ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN";
  if (dns) {
    return new DbUnavailableError(
      "Could not resolve the Atlas hostname. Check the host portion of MONGODB_URI, " +
        "or your network may block DNS SRV lookups — try the non-SRV mongodb:// string from Atlas Connect.",
      { cause: err },
    );
  }
  return new DbUnavailableError(
    `Could not connect to MongoDB (${e?.name ?? "error"}${code ? ", " + code : ""}).`,
    { cause: err },
  );
}

function getClientPromise(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new DbUnavailableError(
      "MONGODB_URI is not set. Copy .env.local.example to .env.local and fill it in.",
    );
  }
  // Fail fast with a clear message if the string is malformed.
  try {
    assertValidMongoUri(uri);
  } catch (err) {
    throw new DbUnavailableError((err as Error).message, { cause: err });
  }

  const promise = new MongoClient(uri).connect().catch((err) => {
    // Don't cache a rejected connection — let a later call retry once fixed.
    clientPromise = null;
    if (process.env.NODE_ENV !== "production") {
      globalThis._mongoClientPromise = undefined;
    }
    throw translateConnectionError(err);
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis._mongoClientPromise = promise;
  }
  clientPromise = promise;
  return clientPromise;
}

/**
 * Get the application database. Falls back to MONGODB_DB, then to the database
 * named in the connection string.
 */
export async function getDb(name?: string): Promise<Db> {
  const client = await getClientPromise();
  return client.db(name ?? process.env.MONGODB_DB);
}
