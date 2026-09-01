import { describe, it, expect, vi } from "vitest";
import { draftKeyFor, switchDraftDate, type DraftStorage } from "./draftStorage";

/** One shared shape so TS doesn't need to unify a different object literal
 * type on every call — mirrors how the real FormState is one fixed shape. */
interface TestState {
  rooms: { sold: string };
  remarks?: string;
  blank?: boolean;
}

/** A tiny in-memory Storage-alike, so these tests never touch a browser. */
function fakeStorage(initial: Record<string, string> = {}): DraftStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("draftKeyFor", () => {
  it("namespaces the key by date", () => {
    expect(draftKeyFor("2026-09-03")).toBe("hbkl:nr:2026-09-03");
  });
});

describe("switchDraftDate", () => {
  it("persists the outgoing date's state under its own key before switching", () => {
    const storage = fakeStorage();
    const outgoing = { rooms: { sold: "12" } };

    switchDraftDate<TestState>(storage, "2026-09-03", outgoing, "2026-09-04", {
      rooms: { sold: "" },
      blank: true,
    });

    expect(storage.getItem(draftKeyFor("2026-09-03"))).toBe(
      JSON.stringify(outgoing),
    );
  });

  it("loads the incoming date's existing draft when one exists", () => {
    const incomingDraft = { rooms: { sold: "5" } };
    const storage = fakeStorage({
      [draftKeyFor("2026-09-04")]: JSON.stringify(incomingDraft),
    });

    const result = switchDraftDate<TestState>(
      storage,
      "2026-09-03",
      { rooms: { sold: "12" } },
      "2026-09-04",
      { rooms: { sold: "" }, blank: true },
    );

    expect(result).toEqual(incomingDraft);
  });

  it("falls back to blankState when the incoming date has no draft", () => {
    const storage = fakeStorage();
    const blank: TestState = { rooms: { sold: "" }, blank: true };

    const result = switchDraftDate<TestState>(
      storage,
      "2026-09-03",
      { rooms: { sold: "12" } },
      "2026-09-04",
      blank,
    );

    expect(result).toBe(blank);
  });

  it("a round trip preserves the outgoing entry exactly", () => {
    const storage = fakeStorage();
    const dayA = { rooms: { sold: "12" }, remarks: "walk-in turned away" };
    const blank = { rooms: { sold: "" }, remarks: "" };

    // Leave date A with an in-progress entry, switching to date B.
    switchDraftDate(storage, "2026-09-03", dayA, "2026-09-04", blank);
    // Switch back to date A without having touched B's (still-blank) draft.
    const backOnA = switchDraftDate(storage, "2026-09-04", blank, "2026-09-03", blank);

    expect(backOnA).toEqual(dayA);
  });

  it("still saves the outgoing entry even if reading the incoming draft fails", () => {
    const outgoing = { rooms: { sold: "12" } };
    const storage: DraftStorage = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: vi.fn(),
    };

    const result = switchDraftDate<TestState>(
      storage,
      "2026-09-03",
      outgoing,
      "2026-09-04",
      { rooms: { sold: "" }, blank: true },
    );

    expect(storage.setItem).toHaveBeenCalledWith(
      draftKeyFor("2026-09-03"),
      JSON.stringify(outgoing),
    );
    expect(result).toEqual({ rooms: { sold: "" }, blank: true });
  });

  it("falls back to blankState rather than throwing on a corrupt incoming draft", () => {
    const storage = fakeStorage({
      [draftKeyFor("2026-09-04")]: "{not valid json",
    });
    const blank: TestState = { rooms: { sold: "" }, blank: true };

    const result = switchDraftDate<TestState>(
      storage,
      "2026-09-03",
      { rooms: { sold: "12" } },
      "2026-09-04",
      blank,
    );

    expect(result).toBe(blank);
  });

  it("does not throw when the outgoing save itself fails (storage full)", () => {
    const storage: DraftStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const blank: TestState = { rooms: { sold: "" }, blank: true };

    expect(() =>
      switchDraftDate<TestState>(
        storage,
        "2026-09-03",
        { rooms: { sold: "" } },
        "2026-09-04",
        blank,
      ),
    ).not.toThrow();
  });
});
