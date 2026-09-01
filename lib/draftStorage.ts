/**
 * Draft persistence for a form keyed by date (the night report's date
 * picker). Switching dates must never lose the entry for the date being
 * left — that would be worse than the missing-backdate bug this feature
 * fixes. `switchDraftDate` is the one place that logic lives, deliberately
 * pulled out of the React component so it can be tested without a DOM: it
 * takes the storage as a parameter (same dependency-injection pattern as
 * lib/mongoDns.ts's resolvers) rather than reaching for `localStorage`
 * itself.
 */

/** The minimal surface of Web Storage this module needs. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function draftKeyFor(date: string): string {
  return `hbkl:nr:${date}`;
}

/**
 * Handle a date switch: persist the outgoing date's state under its own
 * key first, then return the incoming date's own draft if one exists, or
 * `blankState` if not. Never throws — a storage failure (full, unavailable,
 * or a corrupt existing draft) falls back to `blankState` for the incoming
 * date rather than blocking the switch, but the outgoing save is attempted
 * regardless so a transient read problem on the way in never costs the
 * entry on the way out.
 */
export function switchDraftDate<T>(
  storage: DraftStorage,
  outgoingDate: string,
  outgoingState: T,
  incomingDate: string,
  blankState: T,
): T {
  try {
    storage.setItem(draftKeyFor(outgoingDate), JSON.stringify(outgoingState));
  } catch {
    // Storage full or unavailable — nothing we can do, continue anyway.
  }

  try {
    const raw = storage.getItem(draftKeyFor(incomingDate));
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // A corrupt draft for the incoming date — fall through to blank.
  }
  return blankState;
}
