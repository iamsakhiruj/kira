/**
 * MongoDB connection with a client cached across hot reloads.
 *
 * In development Next.js re-evaluates modules on every change; without caching
 * that opens a new connection pool each time and exhausts the server. We stash
 * the connect() promise on globalThis so the pool survives reloads. In
 * production a single module instance is fine.
 *
 * The URI is read lazily (on first use) so that `next build` and unit tests,
 * which never touch the database, don't require it to be set.
 */

import { MongoClient, type Db } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | null = null;

function getClientPromise(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.local.example to .env.local and fill it in.",
    );
  }

  if (process.env.NODE_ENV === "production") {
    clientPromise = new MongoClient(uri).connect();
  } else {
    if (!globalThis._mongoClientPromise) {
      globalThis._mongoClientPromise = new MongoClient(uri).connect();
    }
    clientPromise = globalThis._mongoClientPromise;
  }

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
