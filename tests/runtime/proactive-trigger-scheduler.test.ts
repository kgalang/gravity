import { describe, expect, it } from "vitest";
import {
  computeCronReplayTimes,
  computeHeartbeatReplayTimes,
  isWithinQuietHours,
} from "../../src/runtime/proactive-trigger-scheduler.js";

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

describe("computeHeartbeatReplayTimes", () => {
  it("preserves cadence when lookback clipping is applied", () => {
    const replayTimes = computeHeartbeatReplayTimes({
      intervalSeconds: 300,
      lastFiredAt: new Date("2026-02-18T10:01:00.000Z"),
      lookbackStart: new Date("2026-02-18T10:14:00.000Z"),
      now: new Date("2026-02-18T10:30:00.000Z"),
      maxRuns: 10,
    });

    expect(replayTimes.map((value) => value.toISOString())).toEqual([
      "2026-02-18T10:16:00.000Z",
      "2026-02-18T10:21:00.000Z",
      "2026-02-18T10:26:00.000Z",
    ]);
  });
});

describe("computeCronReplayTimes", () => {
  it("skips invalid schedules without throwing", () => {
    const warnings: string[] = [];
    const replayTimes = computeCronReplayTimes({
      schedule: "not-a-cron",
      lastFiredAt: new Date("2026-02-18T10:00:00.000Z"),
      lookbackStart: new Date("2026-02-18T09:00:00.000Z"),
      now: new Date("2026-02-18T10:30:00.000Z"),
      maxRuns: 3,
      onInvalidSchedule: (message) => {
        warnings.push(message);
      },
    });

    expect(replayTimes).toEqual([]);
    expect(warnings.length).toBe(1);
  });
});
