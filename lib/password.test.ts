import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes so the plaintext is not recoverable from the hash", async () => {
    const plain = "correct horse battery staple";
    const hash = await hashPassword(plain);
    expect(hash).not.toContain(plain);
    expect(hash.startsWith("$argon2")).toBe(true);
  });

  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("returns false for a malformed hash rather than throwing", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });

  it("rejects a too-short password", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });
});
