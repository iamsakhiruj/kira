import { describe, it, expect } from "vitest";
import {
  validateMongoUri,
  assertValidMongoUri,
  maskConnectionString,
} from "./mongoUri";

describe("validateMongoUri", () => {
  it("flags an unencoded @ in the password (the bug that started this)", () => {
    const problems = validateMongoUri(
      "mongodb+srv://user:pa@ss@cluster0.ab12c.mongodb.net/db",
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/more than one '@'/);
    // never leaks the password
    expect(problems.join(" ")).not.toContain("pa@ss");
  });

  it("flags a double @@ between password and host (paste/edit typo)", () => {
    const problems = validateMongoUri(
      "mongodb+srv://user:pass@@cluster0.ab12c.mongodb.net/db",
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/more than one '@'/);
  });

  it("accepts a password with the @ percent-encoded as %40", () => {
    expect(
      validateMongoUri("mongodb+srv://user:pa%40ss@cluster0.ab12c.mongodb.net/db"),
    ).toEqual([]);
  });

  it("accepts a no-auth localhost URI", () => {
    expect(validateMongoUri("mongodb://localhost:27017")).toEqual([]);
  });

  it("rejects a bad scheme", () => {
    const problems = validateMongoUri("http://cluster0.ab12c.mongodb.net");
    expect(problems[0]).toMatch(/Scheme is wrong/);
  });

  it("accepts a standard (non-SRV) URI with multiple ported hosts", () => {
    expect(
      validateMongoUri(
        "mongodb://user:pw@shard-00-00.ab12c.mongodb.net:27017,shard-00-01.ab12c.mongodb.net:27017,shard-00-02.ab12c.mongodb.net:27017/db?ssl=true&replicaSet=atlas-x-shard-0&authSource=admin",
      ),
    ).toEqual([]);
  });

  it("rejects a port on an srv URI", () => {
    const problems = validateMongoUri(
      "mongodb+srv://user:pw@cluster0.ab12c.mongodb.net:27017/db",
    );
    expect(problems.some((p) => /must not include a port/.test(p))).toBe(true);
  });
});

describe("assertValidMongoUri", () => {
  it("throws on malformed, passes on valid", () => {
    expect(() => assertValidMongoUri("nope")).toThrow(/malformed/);
    expect(() =>
      assertValidMongoUri("mongodb+srv://u:p@cluster0.ab12c.mongodb.net/db"),
    ).not.toThrow();
  });
});

describe("maskConnectionString", () => {
  it("masks the password in a URI so logs never leak it", () => {
    const masked = maskConnectionString(
      "failed for mongodb+srv://user:sup3rSecret@host.mongodb.net/db",
    );
    expect(masked).not.toContain("sup3rSecret");
    expect(masked).toContain("mongodb+srv://user:***@host.mongodb.net/db");
  });
});
