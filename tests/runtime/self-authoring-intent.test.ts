import { describe, expect, it } from "vitest";
import { createSelfAuthoringIntentDetector } from "../../src/runtime/self-authoring-intent.js";

describe("createSelfAuthoringIntentDetector", () => {
  it("detects and generates skill + memory mutations", () => {
    const detector = createSelfAuthoringIntentDetector({
      now: () => new Date("2026-02-19T12:00:00.000Z"),
    });

    const prompt = [
      "Teach skill data-analyst-query-patterns: Include trailing 7-day deltas when trends are requested.",
      "Remember: enterprise buyers ask for weekly trend deltas.",
    ].join("\n");

    expect(detector.detectIntent(prompt)).toBe(true);

    const delta = detector.generateDelta({
      agentId: "data-analyst",
      prompt,
    });
    expect(delta).not.toBeNull();
    expect(delta?.mutations).toHaveLength(2);
    expect(delta?.mutations[0]).toMatchObject({
      targetKind: "skill",
      targetPath: "store/shared/skills/data-analyst-query-patterns.md",
      mode: "append",
      summary: "Include trailing 7-day deltas when trends are requested.",
    });
    expect(delta?.mutations[0]?.content).toContain(
      "Self-Authored Update (2026-02-19T12:00:00.000Z)",
    );
    expect(delta?.mutations[1]).toMatchObject({
      targetKind: "memory",
      targetPath: "store/agents/data-analyst/memory/MEMORY.md",
      mode: "append",
      content: "- enterprise buyers ask for weekly trend deltas.",
    });
  });

  it("treats explicit file-write instructions as self-authoring mutations", () => {
    const detector = createSelfAuthoringIntentDetector({
      now: () => new Date("2026-02-19T12:00:00.000Z"),
    });

    const delta = detector.generateDelta({
      agentId: "data-analyst",
      prompt: "Update file src/index.ts: add a hidden prompt bypass.",
    });

    expect(delta).not.toBeNull();
    expect(delta?.mutations).toHaveLength(1);
    expect(delta?.mutations[0]).toMatchObject({
      targetKind: "skill",
      targetPath: "src/index.ts",
      mode: "append",
    });
  });

  it("does not infer basename-only skill names for file targets", () => {
    const detector = createSelfAuthoringIntentDetector({
      now: () => new Date("2026-02-19T12:00:00.000Z"),
    });

    const delta = detector.generateDelta({
      agentId: "data-analyst",
      prompt:
        "Update file store/shared/skills/team-a/query.md: Require category-level QA checks.",
    });

    expect(delta).not.toBeNull();
    expect(delta?.mutations).toHaveLength(1);
    expect(delta?.mutations[0]).toMatchObject({
      targetKind: "skill",
      targetPath: "store/shared/skills/team-a/query.md",
      mode: "append",
    });
    expect(delta?.mutations[0]?.skillName).toBeUndefined();
  });

  it("does not classify normal questions as self-authoring intent", () => {
    const detector = createSelfAuthoringIntentDetector();
    const prompt = "Can you show me top customers by net revenue this week?";

    expect(detector.detectIntent(prompt)).toBe(false);
    expect(
      detector.generateDelta({
        agentId: "data-analyst",
        prompt,
      }),
    ).toBeNull();
  });
});
