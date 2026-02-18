import { describe, expect, it } from "vitest";
import { isWithinQuietHours } from "../../src/runtime/proactive-trigger-scheduler.js";

describe("isWithinQuietHours", () => {
  it("matches same-day quiet-hour windows", () => {
    const quietHours = {
      timezone: "UTC",
      startHour: 9,
      endHour: 17,
    };

    expect(isWithinQuietHours(new Date("2026-02-18T10:00:00.000Z"), quietHours)).toBe(
      true,
    );
    expect(isWithinQuietHours(new Date("2026-02-18T18:00:00.000Z"), quietHours)).toBe(
      false,
    );
  });

  it("matches overnight quiet-hour windows", () => {
    const quietHours = {
      timezone: "UTC",
      startHour: 22,
      endHour: 6,
    };

    expect(isWithinQuietHours(new Date("2026-02-18T23:00:00.000Z"), quietHours)).toBe(
      true,
    );
    expect(isWithinQuietHours(new Date("2026-02-18T02:00:00.000Z"), quietHours)).toBe(
      true,
    );
    expect(isWithinQuietHours(new Date("2026-02-18T12:00:00.000Z"), quietHours)).toBe(
      false,
    );
  });

  it("respects day-of-week restrictions", () => {
    const quietHours = {
      timezone: "UTC",
      startHour: 0,
      endHour: 1,
      daysOfWeek: [1], // Monday only
    };

    expect(isWithinQuietHours(new Date("2026-02-16T00:30:00.000Z"), quietHours)).toBe(
      true,
    );
    expect(isWithinQuietHours(new Date("2026-02-17T00:30:00.000Z"), quietHours)).toBe(
      false,
    );
  });

  it("fails open when timezone is invalid", () => {
    const quietHours = {
      timezone: "Invalid/Timezone",
      startHour: 0,
      endHour: 0,
    };

    expect(isWithinQuietHours(new Date("2026-02-17T00:30:00.000Z"), quietHours)).toBe(
      false,
    );
  });
});
