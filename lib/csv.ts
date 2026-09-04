/**
 * Tiny shared CSV helpers — used by every /reports export route so escaping
 * rules don't drift between them.
 */

export function csvEscape(val: string): string {
  if (val.includes('"') || val.includes(",") || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function csvRow(...cols: string[]): string {
  return cols.map(csvEscape).join(",") + "\r\n";
}
