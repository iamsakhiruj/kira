import { describe, it, expect, vi } from "vitest";
import {
  buildAuditEntry,
  writeAudit,
  AuditEntrySchema,
  type AuditSink,
  type AuditInput,
} from "./audit";

const AT = new Date("2026-09-01T18:30:00.000Z");

describe("buildAuditEntry", () => {
  it("builds a valid entry for a create (before is null)", () => {
    const entry = buildAuditEntry({
      actorId: "u1",
      actorRole: "reception",
      action: "create",
      collection: "businessDays",
      documentId: "d1",
      before: null,
      after: { status: "submitted" },
      at: AT,
    });
    expect(entry).toEqual({
      actorId: "u1",
      actorRole: "reception",
      action: "create",
      collection: "businessDays",
      documentId: "d1",
      before: null,
      after: { status: "submitted" },
      at: AT,
    });
    // The entry conforms to its own schema.
    expect(() => AuditEntrySchema.parse(entry)).not.toThrow();
  });

  it("captures both before and after on an update", () => {
    const entry = buildAuditEntry({
      actorId: "owner1",
      actorRole: "owner",
      action: "update",
      collection: "businessDays",
      documentId: "d1",
      before: { status: "submitted" },
      after: { status: "approved" },
      reason: "reviewed and approved",
      at: AT,
    });
    expect(entry.before).toEqual({ status: "submitted" });
    expect(entry.after).toEqual({ status: "approved" });
    expect(entry.reason).toBe("reviewed and approved");
  });

  it("defaults `at` to now when omitted", () => {
    const before = Date.now();
    const entry = buildAuditEntry({
      actorId: "u1",
      action: "delete",
      collection: "advances",
      documentId: "a1",
      before: { amountSen: 5000 },
      after: null,
    });
    expect(entry.at.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("rejects a missing required field", () => {
    // Cast through any: the point is runtime Zod validation, not the type.
    const missingActor = {
      action: "create",
      collection: "users",
      documentId: "d1",
      before: null,
      after: {},
      at: AT,
    } as unknown as AuditInput;
    expect(() => buildAuditEntry(missingActor)).toThrow();
  });

  it("rejects an unknown action", () => {
    const badAction = {
      actorId: "u1",
      action: "frobnicate",
      collection: "users",
      documentId: "d1",
      before: null,
      after: {},
      at: AT,
    } as unknown as AuditInput;
    expect(() => buildAuditEntry(badAction)).toThrow();
  });
});

describe("writeAudit", () => {
  it("persists the built entry and returns the inserted id", async () => {
    const insertOne = vi.fn().mockResolvedValue({ insertedId: "audit-1" });
    const sink: AuditSink = { insertOne };

    const id = await writeAudit(sink, {
      actorId: "u1",
      actorRole: "owner",
      action: "approve",
      collection: "businessDays",
      documentId: "d1",
      before: { status: "submitted" },
      after: { status: "approved" },
      at: AT,
    });

    expect(id).toBe("audit-1");
    expect(insertOne).toHaveBeenCalledOnce();
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "u1",
        action: "approve",
        collection: "businessDays",
        documentId: "d1",
        at: AT,
      }),
    );
  });

  it("does not insert an invalid entry", async () => {
    const insertOne = vi.fn().mockResolvedValue({ insertedId: "x" });
    const sink: AuditSink = { insertOne };
    await expect(
      writeAudit(sink, {
        actorId: "",
        action: "create",
        collection: "users",
        documentId: "d1",
        before: null,
        after: {},
        at: AT,
      }),
    ).rejects.toThrow();
    expect(insertOne).not.toHaveBeenCalled();
  });
});
