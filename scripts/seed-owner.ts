/**
 * Seed login accounts. Idempotent — an account that already exists is left
 * untouched. Run: npm run seed
 *
 * Required (creates the owner):
 *   SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, SEED_OWNER_NAME (optional)
 *
 * Optional (creates a reception account, handy for testing role separation
 * until the owner's user-management screen exists):
 *   SEED_RECEPTION_EMAIL, SEED_RECEPTION_PASSWORD, SEED_RECEPTION_NAME
 *
 * Rotate or clear the seed passwords once the accounts exist.
 */

import { ensureUserIndexes, getUserByEmail, createUser } from "../lib/users";
import { hashPassword } from "../lib/password";
import type { Role } from "../lib/session";

// Load .env.local. Imports above only read env lazily (at call time), so
// loading it here — after the import graph is evaluated — is fine.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Fall back to whatever is already in the environment.
}

async function ensureUser(
  role: Role,
  email: string,
  password: string,
  name: string,
): Promise<void> {
  const existing = await getUserByEmail(email);
  if (existing) {
    console.log(`${role} already exists: ${email}. Skipped.`);
    return;
  }
  const passwordHash = await hashPassword(password);
  const id = await createUser(
    { email, name, role, passwordHash, active: true },
    { id: "seed", role: "owner" },
  );
  console.log(`Created ${role} ${email} (${id.toString()}).`);
}

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  if (!ownerEmail || !ownerPassword) {
    console.error(
      "Set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in .env.local, then run again.",
    );
    process.exit(1);
  }

  await ensureUserIndexes();

  await ensureUser(
    "owner",
    ownerEmail,
    ownerPassword,
    process.env.SEED_OWNER_NAME ?? "Owner",
  );

  const recEmail = process.env.SEED_RECEPTION_EMAIL;
  const recPassword = process.env.SEED_RECEPTION_PASSWORD;
  if (recEmail && recPassword) {
    await ensureUser(
      "reception",
      recEmail,
      recPassword,
      process.env.SEED_RECEPTION_NAME ?? "Reception",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
