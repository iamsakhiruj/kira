/**
 * Server-side authorization boundary tests for the `manager` role. These
 * exercise the real guards, not the UI:
 *
 *   1. The proxy route gate returns 403 for a manager on owner-only routes,
 *      and for reception on every manager+ route.
 *   2. The manager employee query asks Mongo for an inclusion projection that
 *      omits every owner-only field — proven by capturing the exact projection
 *      object passed to `find()`, so those fields never leave the database.
 *   3. `updateEmployee` rejects a manager change-set containing any owner-only
 *      field outright (throws before any write), not silently dropping it.
 *   4. A manager can still read and write the fields they're permitted.
 *
 * Field naming note: the owner instruction spoke of "icNumber",
 * "passportNumber" and "permitExpiry". The schema has no such fields — IC and
 * passport are one field `icOrPassport`, and permit expiry is
 * `workPermitExpiry`. These tests assert against the actual OWNER_ONLY_FIELDS
 * set (which also includes bankName, nationality, fixedAllowancesSen,
 * passportExpiry) so nothing sensitive is missed.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ObjectId } from "mongodb";

// ---- Shared in-memory DB state, hoisted so the vi.mock factory can close over it.
const dbState = vi.hoisted(() => ({
  employees: new Map<string, Record<string, unknown>>(), // hex id -> doc (incl. _id)
  lastFindProjection: undefined as Record<string, number> | undefined,
  auditEntries: [] as unknown[],
}));

// Replace the Mongo layer with a fake so the real store functions run without a
// live database. The fake records the projection it is asked for.
vi.mock("./mongodb", () => {
  function findById(query: { _id?: { toHexString?: () => string } }) {
    const hex = query?._id?.toHexString?.();
    return hex ? (dbState.employees.get(hex) ?? null) : null;
  }
  function project(
    doc: Record<string, unknown>,
    projection?: Record<string, number>,
  ) {
    if (!projection) return doc;
    const out: Record<string, unknown> = { _id: doc._id };
    for (const [k, v] of Object.entries(projection)) if (v) out[k] = doc[k];
    return out;
  }

  const employeesCol = {
    async createIndex() {},
    find(_query: unknown, opts?: { projection?: Record<string, number> }) {
      dbState.lastFindProjection = opts?.projection;
      const docs = [...dbState.employees.values()].map((d) =>
        project(d, opts?.projection),
      );
      return {
        sort() {
          return this;
        },
        async toArray() {
          return docs;
        },
      };
    },
    async findOne(query: { _id?: { toHexString?: () => string } }) {
      return findById(query);
    },
    async findOneAndUpdate(
      query: { _id?: { toHexString?: () => string } },
      update: { $set: Record<string, unknown> },
    ) {
      const doc = findById(query);
      if (!doc) return null;
      Object.assign(doc, update.$set);
      return doc;
    },
  };

  const auditCol = {
    async insertOne(entry: unknown) {
      dbState.auditEntries.push(entry);
      return { insertedId: "audit" };
    },
  };

  return {
    getDb: async () => ({
      collection(name: string) {
        return name === "auditLog" ? auditCol : employeesCol;
      },
    }),
    DbUnavailableError: class DbUnavailableError extends Error {},
  };
});

// A session secret is needed to sign/verify the tokens the proxy checks.
process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough-32+";

import { NextRequest } from "next/server";
import { proxy, ROUTE_REQUIREMENTS } from "../proxy";
import { createSessionToken, SESSION_COOKIE, type Role } from "./session";
import {
  MANAGER_EDITABLE_FIELDS,
  OWNER_ONLY_FIELDS,
} from "./employees";
import {
  getEmployeesManagerView,
  updateEmployee,
} from "./employeesStore";

// ---------------------------------------------------------------------------
// 1. Route gate: the proxy's actual 403 response
// ---------------------------------------------------------------------------

async function proxyStatusFor(role: Role, pathname: string): Promise<number> {
  const token = await createSessionToken({ sub: "user1", role, name: "Test" });
  const req = new NextRequest(new URL(`http://localhost${pathname}`));
  req.cookies.set(SESSION_COOKIE, token);
  const res = await proxy(req);
  return res.status;
}

const OWNER_ONLY_ROUTES = ROUTE_REQUIREMENTS.filter(
  (r) => r.required === "owner",
).map((r) => r.prefix);
const MANAGER_PLUS_ROUTES = ROUTE_REQUIREMENTS.filter(
  (r) => r.required === "manager" || r.required === "owner",
).map((r) => r.prefix);
const MANAGER_ONLY_ROUTES = ROUTE_REQUIREMENTS.filter(
  (r) => r.required === "manager",
).map((r) => r.prefix);

describe("proxy route gate — manager boundary", () => {
  it("returns 403 for a manager on /salary, /partners and /settings/users", async () => {
    expect(await proxyStatusFor("manager", "/salary")).toBe(403);
    expect(await proxyStatusFor("manager", "/partners")).toBe(403);
    expect(await proxyStatusFor("manager", "/settings/users")).toBe(403);
  });

  it("returns 403 for a manager on every owner-only route (no gaps)", async () => {
    // Guard against the route list being empty or the filter matching nothing.
    expect(OWNER_ONLY_ROUTES).toEqual(
      expect.arrayContaining(["/salary", "/partners", "/settings/users"]),
    );
    for (const route of OWNER_ONLY_ROUTES) {
      expect(await proxyStatusFor("manager", route)).toBe(403);
    }
  });

  it("still lets a manager through on manager-tier routes", async () => {
    expect(MANAGER_ONLY_ROUTES.length).toBeGreaterThan(0);
    for (const route of MANAGER_ONLY_ROUTES) {
      expect(await proxyStatusFor("manager", route)).toBe(200);
    }
  });

  it("lets an owner through on owner-only routes (boundary is a rank, not a blanket deny)", async () => {
    for (const route of OWNER_ONLY_ROUTES) {
      expect(await proxyStatusFor("owner", route)).toBe(200);
    }
  });
});

describe("proxy route gate — reception boundary", () => {
  it("returns 403 for reception on every manager+ route", async () => {
    expect(MANAGER_PLUS_ROUTES.length).toBeGreaterThan(0);
    for (const route of MANAGER_PLUS_ROUTES) {
      expect(await proxyStatusFor("reception", route)).toBe(403);
    }
  });

  it("still lets reception reach its own area", async () => {
    expect(await proxyStatusFor("reception", "/reception")).toBe(200);
  });

  it("redirects an unauthenticated request to /login instead of 403", async () => {
    const req = new NextRequest(new URL("http://localhost/salary"));
    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});

// ---------------------------------------------------------------------------
// 2–4. Employee field boundary
// ---------------------------------------------------------------------------

const MANAGER = { id: "mgr1", role: "manager" as Role };
const OWNER = { id: "own1", role: "owner" as Role };

const FULL_EMPLOYEE = {
  // manager-editable
  name: "Aisha Rahman",
  position: "Front desk",
  department: "Operations",
  joinDate: "2025-01-01",
  status: "active",
  contactPhone: "012-3456789",
  contactEmail: "aisha@example.com",
  notes: "",
  // owner-only
  payType: "monthly",
  basicAmountSen: 300000,
  fixedAllowancesSen: 0,
  bankName: "Maybank",
  bankAccount: "5140-1234-5678",
  icOrPassport: "900101-14-5678",
  nationality: "MY",
  epfNumber: "EPF-111",
  socsoNumber: "SOCSO-222",
  taxNumber: "TAX-333",
  workPermitExpiry: null,
  passportExpiry: null,
} as const;

let empId: string;

beforeEach(() => {
  dbState.employees.clear();
  dbState.auditEntries.length = 0;
  dbState.lastFindProjection = undefined;
  const _id = new ObjectId();
  empId = _id.toHexString();
  dbState.employees.set(empId, {
    _id,
    ...FULL_EMPLOYEE,
    statusChangedAt: new Date("2025-01-01T00:00:00Z"),
  });
});

describe("owner-only field set covers the sensitive fields", () => {
  it("classifies every named sensitive field as owner-only, none manager-editable", () => {
    // The concepts the owner named, mapped to the real field names.
    const sensitive = [
      "basicAmountSen",
      "payType",
      "bankAccount",
      "icOrPassport", // IC *and* passport are one field
      "epfNumber",
      "socsoNumber",
      "taxNumber",
      "workPermitExpiry", // "permitExpiry" in the instruction
    ];
    for (const f of sensitive) {
      expect(OWNER_ONLY_FIELDS).toContain(f);
      expect(MANAGER_EDITABLE_FIELDS).not.toContain(f);
    }
    // The two sets never overlap.
    for (const f of OWNER_ONLY_FIELDS) {
      expect(MANAGER_EDITABLE_FIELDS).not.toContain(f);
    }
  });
});

describe("2. manager read — projection excludes owner-only fields at the DB", () => {
  it("asks Mongo for an inclusion projection of only the manager fields", async () => {
    await getEmployeesManagerView();
    const projection = dbState.lastFindProjection;
    expect(projection).toBeDefined();

    // Every manager field is requested...
    for (const f of MANAGER_EDITABLE_FIELDS) {
      expect(projection![f]).toBe(1);
    }
    // ...and no owner-only field appears in the projection at all, so the
    // database is never asked to return them (not fetched-then-filtered).
    for (const f of OWNER_ONLY_FIELDS) {
      expect(f in projection!).toBe(false);
    }
  });

  it("returns documents that carry no owner-only field", async () => {
    const rows = await getEmployeesManagerView();
    expect(rows.length).toBe(1);
    const row = rows[0] as Record<string, unknown>;
    // Manager fields are present...
    expect(row.name).toBe(FULL_EMPLOYEE.name);
    expect(row.position).toBe(FULL_EMPLOYEE.position);
    // ...owner-only fields are absent entirely.
    for (const f of OWNER_ONLY_FIELDS) {
      expect(f in row).toBe(false);
    }
  });
});

describe("3. manager write — owner-only fields are rejected outright", () => {
  it("rejects a change-set containing any single owner-only field", async () => {
    const sample: Record<string, unknown> = {
      payType: "daily",
      basicAmountSen: 999999,
      bankAccount: "hijacked",
      icOrPassport: "forged",
      epfNumber: "x",
      socsoNumber: "x",
      taxNumber: "x",
      workPermitExpiry: "2030-01-01",
      passportExpiry: "2030-01-01",
      bankName: "x",
      nationality: "x",
      fixedAllowancesSen: 1,
    };
    for (const field of OWNER_ONLY_FIELDS) {
      await expect(
        updateEmployee(empId, { [field]: sample[field] }, MANAGER),
      ).rejects.toThrow(/not permitted/i);
    }
  });

  it("rejects the whole update when an owner-only field rides alongside allowed ones (not silently ignored)", async () => {
    await expect(
      updateEmployee(
        empId,
        { name: "Renamed", basicAmountSen: 500000 },
        MANAGER,
      ),
    ).rejects.toThrow(/not permitted/i);

    // Nothing was written — neither the allowed field nor the forbidden one.
    const stored = dbState.employees.get(empId)!;
    expect(stored.name).toBe(FULL_EMPLOYEE.name);
    expect(stored.basicAmountSen).toBe(FULL_EMPLOYEE.basicAmountSen);
    expect(dbState.auditEntries.length).toBe(0);
  });

  it("also rejects unknown field names (e.g. the non-existent 'icNumber')", async () => {
    await expect(
      updateEmployee(empId, { icNumber: "123" }, MANAGER),
    ).rejects.toThrow(/not permitted/i);
  });

  it("an owner CAN write those same fields — the boundary is the role, not the field", async () => {
    await expect(
      updateEmployee(empId, { basicAmountSen: 500000 }, OWNER),
    ).resolves.toBeUndefined();
    expect(dbState.employees.get(empId)!.basicAmountSen).toBe(500000);
  });
});

describe("4. manager write — permitted fields go through", () => {
  it("accepts and persists a manager-editable change-set", async () => {
    await expect(
      updateEmployee(
        empId,
        {
          name: "Aisha R.",
          position: "Duty manager",
          department: "Reception",
          joinDate: "2025-02-01",
          status: "on_leave",
          contactPhone: "011-2223333",
          contactEmail: "aisha.new@example.com",
        },
        MANAGER,
      ),
    ).resolves.toBeUndefined();

    const stored = dbState.employees.get(empId)!;
    expect(stored.name).toBe("Aisha R.");
    expect(stored.position).toBe("Duty manager");
    expect(stored.department).toBe("Reception");
    expect(stored.status).toBe("on_leave");
    expect(stored.contactPhone).toBe("011-2223333");
    expect(stored.contactEmail).toBe("aisha.new@example.com");

    // The write is audited, and the owner-only fields were left untouched.
    expect(dbState.auditEntries.length).toBe(1);
    expect(stored.basicAmountSen).toBe(FULL_EMPLOYEE.basicAmountSen);
    expect(stored.icOrPassport).toBe(FULL_EMPLOYEE.icOrPassport);
  });
});
