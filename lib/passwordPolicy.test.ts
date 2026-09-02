import { describe, it, expect } from "vitest";
import { checkPasswordStrength, MIN_PASSWORD_LENGTH } from "./passwordPolicy";

describe("checkPasswordStrength", () => {
  it("accepts a strong password", () => {
    expect(checkPasswordStrength("Tr0ubl3-Kettle-Moon").ok).toBe(true);
  });

  it("rejects an empty password", () => {
    const r = checkPasswordStrength("");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/enter a password/i);
  });

  it("rejects the wrong type", () => {
    expect(checkPasswordStrength(undefined).ok).toBe(false);
    expect(checkPasswordStrength(12345678901234).ok).toBe(false);
  });

  it("rejects anything shorter than the minimum", () => {
    const justUnder = "a1B!".repeat(2).slice(0, MIN_PASSWORD_LENGTH - 1);
    const r = checkPasswordStrength(justUnder);
    expect(r.ok).toBe(false);
    expect(r.error).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("accepts exactly the minimum length when otherwise strong", () => {
    const exact = "Kf7$mZ9!qWx2"; // 12 chars, no weak patterns
    expect(exact.length).toBe(MIN_PASSWORD_LENGTH);
    expect(checkPasswordStrength(exact).ok).toBe(true);
  });

  it("rejects a single repeated character", () => {
    expect(checkPasswordStrength("aaaaaaaaaaaaaa").ok).toBe(false);
  });

  it("rejects common words regardless of length", () => {
    expect(checkPasswordStrength("password123456").ok).toBe(false);
    expect(checkPasswordStrength("MyQwertyKeyboard").ok).toBe(false);
    expect(checkPasswordStrength("welcomeToTheHotel").ok).toBe(false);
  });

  it("is case-insensitive about weak words", () => {
    expect(checkPasswordStrength("PASSWORDxyztuv").ok).toBe(false);
  });

  it("rejects numeric and alphabetic sequences (either direction)", () => {
    expect(checkPasswordStrength("xy123456zzTT").ok).toBe(false);
    expect(checkPasswordStrength("zz654321xxTT").ok).toBe(false);
    expect(checkPasswordStrength("zzabcdefXX99").ok).toBe(false);
    expect(checkPasswordStrength("zzfedcbaXX99").ok).toBe(false);
  });

  it("rejects a password that echoes the email local part", () => {
    const r = checkPasswordStrength("rahman-Kettle99", "rahman@hotelbintangkl.com");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/email/i);
  });

  it("ignores a very short email local part", () => {
    // "ab" is too short to meaningfully constrain the password.
    expect(checkPasswordStrength("Kf7$mZ9!qWx2", "ab@x.com").ok).toBe(true);
  });
});
