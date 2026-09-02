import { describe, it, expect } from "vitest";
import { lockoutDurationMinutes, LOCKOUT_THRESHOLD, LOCKOUT_SCHEDULE_MINUTES } from "./loginRateLimit";

describe("lockoutDurationMinutes", () => {
  it("is null below the threshold", () => {
    for (let n = 0; n < LOCKOUT_THRESHOLD; n++) {
      expect(lockoutDurationMinutes(n)).toBeNull();
    }
  });

  it("starts the schedule at the threshold", () => {
    expect(lockoutDurationMinutes(5)).toBe(1);
  });

  it("holds the same duration until the next multiple of the threshold", () => {
    expect(lockoutDurationMinutes(6)).toBe(1);
    expect(lockoutDurationMinutes(9)).toBe(1);
  });

  it("escalates every additional threshold's worth of failures", () => {
    expect(lockoutDurationMinutes(10)).toBe(5);
    expect(lockoutDurationMinutes(14)).toBe(5);
    expect(lockoutDurationMinutes(15)).toBe(15);
    expect(lockoutDurationMinutes(19)).toBe(15);
    expect(lockoutDurationMinutes(20)).toBe(60);
  });

  it("caps at the last entry in the schedule", () => {
    expect(lockoutDurationMinutes(25)).toBe(60);
    expect(lockoutDurationMinutes(100)).toBe(60);
  });

  it("matches the exported schedule constant", () => {
    expect(lockoutDurationMinutes(5)).toBe(LOCKOUT_SCHEDULE_MINUTES[0]);
    expect(lockoutDurationMinutes(100)).toBe(
      LOCKOUT_SCHEDULE_MINUTES[LOCKOUT_SCHEDULE_MINUTES.length - 1],
    );
  });
});
