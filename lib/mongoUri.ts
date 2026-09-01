/**
 * Validate the SHAPE of a MongoDB connection string before connecting, so a
 * malformed value gives a clear message instead of a confusing DNS error.
 * Never returns, throws, or logs the password — it is masked out.
 */

function validHost(h: string): boolean {
  if (h === "localhost") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4
  // A dotted domain ending in a 2+ letter TLD, e.g. cluster0.ab12c.mongodb.net
  return /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(
    h,
  );
}

/** Returns a list of problems (empty = looks fine). */
export function validateMongoUri(uri: string): string[] {
  const value = uri.trim();
  if (value === "") return ["MONGODB_URI is empty — set it in .env.local."];

  const scheme = /^(mongodb\+srv|mongodb):\/\//.exec(value);
  if (!scheme) {
    return [
      'Scheme is wrong — it must start with "mongodb+srv://" or "mongodb://".',
    ];
  }
  const isSrv = scheme[1] === "mongodb+srv";
  const afterScheme = value.slice(scheme[0].length);

  // Authority is everything before the first "/" or "?".
  const cut = afterScheme.search(/[/?]/);
  const authority = cut === -1 ? afterScheme : afterScheme.slice(0, cut);

  const firstAt = authority.indexOf("@");
  const lastAt = authority.lastIndexOf("@");

  // More than one "@" almost always means an unencoded "@" in the password —
  // the exact bug that splits the URI at the wrong place. Don't echo anything.
  if (firstAt !== -1 && firstAt !== lastAt) {
    return [
      "The credentials contain more than one '@' separating credentials from host. " +
        "This usually means the password has an unencoded '@' — percent-encode it as %40. Password hidden.",
    ];
  }

  const errors: string[] = [];
  let hostSection: string;

  if (firstAt === -1) {
    hostSection = authority; // no-auth (e.g. local); allowed
  } else {
    const userinfo = authority.slice(0, firstAt);
    const colon = userinfo.indexOf(":");
    const password = colon === -1 ? "" : userinfo.slice(colon + 1);

    // A correctly encoded password contains "%" only as part of a %XX escape.
    const literal = ["@", "#", "/", "?", ":", "&"].filter((ch) =>
      password.includes(ch),
    );
    const strayPercent = /%(?![0-9A-Fa-f]{2})/.test(password);
    if (literal.length > 0 || strayPercent) {
      const bits = literal.map((c) => `'${c}'`);
      if (strayPercent) bits.push("a stray '%' (not part of a %XX escape)");
      errors.push(
        `The password contains ${bits.join(", ")}, which must be percent-encoded ` +
          "(@→%40, #→%23, /→%2F, :→%3A, ?→%3F, %→%25, &→%26). Password hidden.",
      );
    }
    hostSection = authority.slice(firstAt + 1); // safe: after the single "@"
  }

  if (isSrv && /:\d+$/.test(hostSection)) {
    errors.push('An "mongodb+srv://" URI must not include a port number.');
  }

  const hosts = hostSection
    .split(",")
    .map((h) => h.replace(/:\d+$/, ""))
    .filter(Boolean);
  if (hosts.length === 0) {
    errors.push("No host found after the credentials.");
  }
  for (const h of hosts) {
    if (!validHost(h)) {
      errors.push(
        `The host "${h}" is not a valid domain (expected something like cluster0.ab12c.mongodb.net).`,
      );
    }
  }
  return errors;
}

/** Throw a clear, password-free error if the URI is malformed. */
export function assertValidMongoUri(uri: string): void {
  const problems = validateMongoUri(uri);
  if (problems.length > 0) {
    throw new Error("MONGODB_URI is malformed: " + problems.join(" "));
  }
}

/**
 * Redact the password in any string that contains a MongoDB URI, for safe
 * server-side logging. Best-effort: masks the user:PASSWORD@ segment.
 */
export function maskConnectionString(text: string): string {
  return text.replace(
    /(mongodb(?:\+srv)?:\/\/[^\s:/@]+:)([^@\s]*)(@)/gi,
    (_m, pre: string, _pw: string, at: string) => `${pre}***${at}`,
  );
}
