import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  isAuthorized,
} from "./session";

// getKey() reads SESSION_SECRET lazily, so setting it here (after imports,
// before any test runs) is enough.
const GOOD_SECRET = "test-secret-0123456789-abcdefghijklmnop";
process.env.SESSION_SECRET = GOOD_SECRET;

describe("session tokens", () => {
  it("round-trips a payload", async () => {
    const token = await createSessionToken({
      sub: "u1",
      role: "owner",
      name: "Aisha",
    });
    const payload = await verifySessionToken(token);
    expect(payload).toEqual({ sub: "u1", role: "owner", name: "Aisha" });
  });

  it("returns null for a tampered token", async () => {
    const token = await createSessionToken({
      sub: "u1",
      role: "reception",
      name: "Ben",
    });
    const tampered = token.slice(0, -3) + (token.endsWith("A") ? "B" : "A") + "xy";
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await createSessionToken(
      { sub: "u1", role: "owner", name: "Aisha" },
      -10, // expired 10 seconds ago
    );
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("returns null when signed with a different secret", async () => {
    const token = await createSessionToken({
      sub: "u1",
      role: "owner",
      name: "Aisha",
    });
    process.env.SESSION_SECRET = "a-completely-different-secret-key-value!";
    try {
      expect(await verifySessionToken(token)).toBeNull();
    } finally {
      process.env.SESSION_SECRET = GOOD_SECRET;
    }
  });

  it("returns null for junk", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });
});

describe("isAuthorized (role hierarchy)", () => {
  it("owner can reach owner, reception, and unguarded routes", () => {
    expect(isAuthorized("owner", "owner")).toBe(true);
    expect(isAuthorized("owner", "reception")).toBe(true);
    expect(isAuthorized("owner", undefined)).toBe(true);
  });

  it("reception can reach reception and unguarded, but not owner", () => {
    expect(isAuthorized("reception", "reception")).toBe(true);
    expect(isAuthorized("reception", undefined)).toBe(true);
    expect(isAuthorized("reception", "owner")).toBe(false);
  });
});
