/**
 * Diagnose the MongoDB connection. Run: npm run check-db
 *
 * Prints the non-secret parts of MONGODB_URI (never the password), validates
 * its shape, resolves DNS, and attempts a 10-second connection — classifying
 * any failure as DNS, auth, IP allowlist, or timeout.
 */

import { MongoClient } from "mongodb";
import { resolveSrv, lookup } from "node:dns/promises";
import { validateMongoUri } from "../lib/mongoUri";
import { resolveMongoDns, dnsHostOf } from "../lib/mongoDns";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fall back to whatever is already in the environment.
}

interface UriParts {
  scheme: string;
  username: string;
  host: string;
  database: string;
  query: string;
}

/** Extract the printable parts. The password is deliberately never returned. */
function parseParts(uri: string): UriParts {
  const schemeMatch = /^(mongodb\+srv|mongodb):\/\//.exec(uri);
  const scheme = schemeMatch ? `${schemeMatch[1]}://` : "(unknown)";
  const rest = schemeMatch ? uri.slice(schemeMatch[0].length) : uri;

  // Authority is everything before the first "/" or "?".
  const slash = rest.indexOf("/");
  const question = rest.indexOf("?");
  let authEnd = rest.length;
  if (slash !== -1) authEnd = Math.min(authEnd, slash);
  if (question !== -1) authEnd = Math.min(authEnd, question);
  const authority = rest.slice(0, authEnd);
  const tail = rest.slice(authEnd);

  let database = "";
  let query = "";
  if (tail.startsWith("/")) {
    const q = tail.indexOf("?");
    database = q === -1 ? tail.slice(1) : tail.slice(1, q);
    query = q === -1 ? "" : tail.slice(q + 1);
  } else if (tail.startsWith("?")) {
    query = tail.slice(1);
  }

  // Host is after the LAST "@" (per MongoDB rules); userinfo is before it. We
  // read only the username from userinfo and drop the password entirely.
  const at = authority.lastIndexOf("@");
  let username = "";
  let host = authority;
  if (at !== -1) {
    const userinfo = authority.slice(0, at);
    host = authority.slice(at + 1);
    const colon = userinfo.indexOf(":");
    username = colon === -1 ? userinfo : userinfo.slice(0, colon);
  }

  return { scheme, username, host, database, query };
}

function reportConnectionError(err: unknown): void {
  const e = err as {
    name?: string;
    code?: number | string;
    codeName?: string;
    message?: string;
  };
  const msg = String(e?.message ?? "");
  const isAuth =
    e?.code === 18 ||
    e?.codeName === "AuthenticationFailed" ||
    /authentication failed|bad auth|auth failed|not authorized/i.test(msg);
  const isTimeout =
    e?.name === "MongoServerSelectionError" ||
    /server selection timed out|timed out|timeout/i.test(msg);

  if (isAuth) {
    console.error(
      "\n✗ Authentication failed. Check the username and password in MONGODB_URI, " +
        "and that the user has access to the database.",
    );
  } else if (isTimeout) {
    console.error(
      "\n✗ Timed out after 10s (could not select a server). DNS resolved, so this is " +
        "most likely an IP allowlist block — add your current IP in Atlas: Network Access — " +
        "or a firewall blocking outbound port 27017.",
    );
  } else {
    console.error(
      `\n✗ Connection failed (${e?.name ?? "error"}${e?.code ? ", " + e.code : ""}).`,
    );
  }
}

function reportDnsError(err: unknown, host: string, isSrv: boolean): void {
  const e = err as { code?: string; message?: string };
  const code = e?.code ?? "";
  const notFound = /ENOTFOUND|ENODATA|NXDOMAIN|NOTFOUND/i.test(
    `${code} ${String(e?.message ?? "")}`,
  );
  if (notFound) {
    console.error(
      `\n✗ DNS: no ${isSrv ? "SRV record" : "address"} found (${code || "not found"}). ` +
        `The host ${host} did not resolve. Atlas hosts look like clustername.xxxxx.mongodb.net — ` +
        "copy the string from Atlas: Connect > Drivers > Node.js.",
    );
  } else {
    // ECONNREFUSED / ETIMEOUT / ESERVFAIL / EREFUSED — the resolver itself
    // couldn't be reached. nslookup can still succeed because Node uses a
    // different resolver (c-ares).
    console.error(
      `\n✗ DNS query failed (${code || "error"}). Node's resolver couldn't complete the ` +
        `${isSrv ? "SRV" : "host"} lookup. nslookup may still work — it uses a different resolver. ` +
        "Use the non-SRV mongodb:// string from Atlas Connect, or configure a working DNS server. " +
        "The MongoDB driver uses this same resolver, so it will hit the same error.",
    );
  }
}

async function main() {
  const uri = process.env.MONGODB_URI ?? "";

  // 2. Validate the shape.
  const problems = validateMongoUri(uri);
  if (problems.length === 0) {
    console.log("Shape: looks well-formed.");
  } else {
    console.log("Shape problems:");
    for (const p of problems) console.log("  - " + p);
  }

  // 3. Print the non-secret parts only.
  const parts = parseParts(uri);
  console.log("\nParts (password hidden):");
  console.log("  scheme:   " + parts.scheme);
  console.log("  username: " + (parts.username || "(none)"));
  console.log("  host:     " + (parts.host || "(none)"));
  console.log("  database: " + (parts.database || "(none)"));
  console.log("  query:    " + (parts.query || "(none)"));

  if (!parts.scheme.startsWith("mongodb") || !parts.host) {
    console.error(
      "\nCannot attempt a connection — the URI isn't parseable. Fix it in .env.local.",
    );
    process.exit(1);
  }

  // 4/5. DNS first, so a resolution failure is reported distinctly. For
  // mongodb+srv:// this is an SRV lookup on _mongodb._tcp.<host> (Atlas SRV
  // hosts have no A record); for mongodb:// it's a plain host lookup.
  const isSrv = parts.scheme.includes("+srv");
  const dnsHost = dnsHostOf(parts.host);
  console.log(
    `\nResolving DNS (${isSrv ? "SRV record" : "host lookup"}) for ${dnsHost} ...`,
  );
  try {
    const dns = await resolveMongoDns(parts.scheme, parts.host, {
      resolveSrv: (n) => resolveSrv(n),
      lookup: (h) => lookup(h),
    });
    if (dns.kind === "srv") {
      console.log(
        `  ✓ SRV OK — ${dns.recordCount} shard record(s) at ${dns.queryName}.`,
      );
    } else {
      console.log("  ✓ DNS OK.");
    }
  } catch (err) {
    reportDnsError(err, dnsHost, isSrv);
    process.exit(1);
  }

  // Attempt the connection with a 10-second ceiling.
  console.log("\nConnecting (10s timeout) ...");
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  try {
    await client.connect();
    await client
      .db(parts.database || process.env.MONGODB_DB)
      .command({ ping: 1 });
    console.log("  ✓ Success — connected and pinged the database.");
  } catch (err) {
    reportConnectionError(err);
    await client.close().catch(() => {});
    process.exit(1);
  }
  await client.close().catch(() => {});
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    // Never dump the raw error — it can contain the connection string.
    const e = err as { name?: string; code?: string };
    console.error(
      `\nDiagnostic failed unexpectedly (${e?.name ?? "error"}${e?.code ? ", " + e.code : ""}).`,
    );
    process.exit(1);
  });
