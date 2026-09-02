/**
 * Password strength policy for owner-set account passwords (the /settings/users
 * screen). Pure and deterministic so it can be unit-tested without a database
 * — the policy is logic worth pinning down, not CRUD.
 *
 * Minimum length is 12 (a real floor, not the 8-char backstop in
 * lib/password.ts, which stays only to catch a bug that bypasses this). We
 * also reject the obvious weak ones: a short denylist, all-same-character,
 * trivial sequences, and anything that just echoes the account's own email —
 * because "P@ssw0rd" passing a length check is exactly how a five-user hotel
 * ends up with a guessable owner account.
 *
 * Messages say what to do (CLAUDE.md error rule), never "invalid".
 */

export const MIN_PASSWORD_LENGTH = 12;

// Substrings that, if present, make a password trivially guessable regardless
// of the rest. Matched case-insensitively.
const WEAK_SUBSTRINGS = [
  "password",
  "qwerty",
  "asdf",
  "letmein",
  "welcome",
  "admin",
  "hotel",
  "bintang",
];

// Long ascending/descending runs people reach for ("123456", "abcdef").
const SEQUENCES = [
  "0123456789",
  "abcdefghijklmnopqrstuvwxyz",
];

function containsSequence(lower: string): boolean {
  for (const seq of SEQUENCES) {
    for (let i = 0; i + 6 <= seq.length; i++) {
      const run = seq.slice(i, i + 6);
      if (lower.includes(run) || lower.includes([...run].reverse().join(""))) {
        return true;
      }
    }
  }
  return false;
}

export interface PasswordCheck {
  ok: boolean;
  /** A specific, actionable message when `ok` is false. */
  error?: string;
}

/**
 * Validate a proposed plaintext password. `email` is optional context so we
 * can reject a password that is just the account's own address.
 */
export function checkPasswordStrength(
  plain: unknown,
  email?: string,
): PasswordCheck {
  if (typeof plain !== "string" || plain.length === 0) {
    return { ok: false, error: "Enter a password." };
  }
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const lower = plain.toLowerCase();

  if (new Set(plain).size === 1) {
    return { ok: false, error: "Don't repeat a single character." };
  }

  for (const weak of WEAK_SUBSTRINGS) {
    if (lower.includes(weak)) {
      return {
        ok: false,
        error: `Avoid common words like "${weak}". Choose something harder to guess.`,
      };
    }
  }

  if (containsSequence(lower)) {
    return {
      ok: false,
      error: "Avoid simple sequences like 123456 or abcdef.",
    };
  }

  if (email) {
    const localPart = email.toLowerCase().split("@")[0];
    if (localPart.length >= 3 && lower.includes(localPart)) {
      return {
        ok: false,
        error: "Don't base the password on the email address.",
      };
    }
  }

  return { ok: true };
}
