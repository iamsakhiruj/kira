/**
 * Money is stored as an integer number of sen. RM 1,234.50 is 123450.
 * Never floats. Format only at the display layer.
 *
 * These helpers are the single place money is parsed and rendered. When the
 * meaning or format of a money value changes, it changes here and nowhere else.
 *
 * Parsing refuses to guess. "1.234" is ambiguous — is the dot a decimal point
 * (over-precise for sen) or a thousands separator? — so it throws rather than
 * silently pick one. Convention for this system: "." is the decimal point,
 * "," groups thousands. That matches how RM is written on a Malaysian invoice.
 */

/** Thrown when user input can't be turned into an unambiguous sen amount. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

const THOUSANDS = /^\d{1,3}(,\d{3})+$/;

/**
 * Parse user input (or a number) into integer sen.
 *
 * Accepts: "1234", "1234.5", "1234.50", "1,234.50", "1,234", optional leading
 * "RM", optional leading sign. Rejects anything ambiguous or over-precise.
 *
 * @throws {MoneyError} with a message that says what to do.
 */
export function toSen(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new MoneyError("Enter a valid amount.");
    }
    const scaled = input * 100;
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > 1e-6) {
      throw new MoneyError("Amounts can have at most 2 decimal places.");
    }
    if (!Number.isSafeInteger(rounded)) {
      throw new MoneyError("That amount is too large.");
    }
    return rounded;
  }

  let s = input.trim();
  if (s === "") throw new MoneyError("Enter an amount.");

  // Sign.
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }

  // Optional currency prefix.
  s = s.replace(/^RM\s*/i, "").trim();
  if (s === "") throw new MoneyError("Enter an amount.");

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  let intText: string;
  let fracText = "";

  if (hasDot) {
    if ((s.match(/\./g) as string[]).length > 1) {
      throw new MoneyError(`"${input}" is not a valid amount.`);
    }
    const [ip, fp] = s.split(".");
    if (fp.length === 3) {
      throw new MoneyError(
        `"${input}" is ambiguous — write thousands as "1,234" and use "." only for the decimal point (max 2 digits).`,
      );
    }
    if (fp.length === 0 || fp.length > 2) {
      throw new MoneyError("Amounts can have at most 2 decimal places.");
    }
    fracText = fp;
    intText = ip;
    if (intText.includes(",")) {
      if (!THOUSANDS.test(intText)) {
        throw new MoneyError(`"${input}" is not a valid amount.`);
      }
      intText = intText.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Comma with no decimal point: only valid as a thousands separator.
    if (!THOUSANDS.test(s)) {
      throw new MoneyError(
        `"${input}" is ambiguous — use "," only for thousands (e.g. 1,234) and "." for the decimal point.`,
      );
    }
    intText = s.replace(/,/g, "");
  } else {
    intText = s;
  }

  if (!/^\d+$/.test(intText)) {
    throw new MoneyError(`"${input}" is not a valid amount.`);
  }

  const cents = fracText === "" ? 0 : Number(fracText.padEnd(2, "0"));
  const sen = sign * (Number(intText) * 100 + cents);
  if (!Number.isSafeInteger(sen)) {
    throw new MoneyError("That amount is too large.");
  }
  return sen;
}

/**
 * Format integer sen for display: 123450 -> "1,234.50". Negatives carry a
 * leading minus so the sign survives greyscale printing, not just colour.
 * No currency symbol — pair with the `.money` utility for alignment.
 */
export function fromSen(sen: number): string {
  if (!Number.isInteger(sen)) {
    throw new MoneyError("Sen amounts must be whole numbers.");
  }
  const negative = sen < 0;
  const abs = Math.abs(sen);
  const ringgit = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(ringgit).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${String(cents).padStart(2, "0")}`;
}

/** Format integer sen with the currency symbol: 123450 -> "RM 1,234.50". */
export function formatRM(sen: number): string {
  const negative = sen < 0;
  return `${negative ? "-" : ""}RM ${fromSen(Math.abs(sen))}`;
}
