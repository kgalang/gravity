import { describe, expect, it } from "vitest";
import { createSelfAuthoringMutationPolicy } from "../../src/runtime/self-authoring-mutation-policy.js";

describe("createSelfAuthoringMutationPolicy", () => {
  it("approves shared-skill and agent-memory paths", () => {
    const policy = createSelfAuthoringMutationPolicy({
      cwd: "/tmp/gravity-policy",
    });

    const decision = policy.evaluate({
      agentId: "data-analyst",
      mutations: [
        {
          targetKind: "skill",
          targetPath: "store/shared/skills/data-analyst-query-patterns.md",
          mode: "append",
          content: "- Include weekly deltas.",
          summary: "Include weekly deltas.",
          skillName: "data-analyst-query-patterns",
        },
        {
          targetKind: "memory",
          targetPath: "store/agents/data-analyst/memory/MEMORY.md",
          mode: "append",
          content: "- Enterprise users ask for weekly trends.",
          summary: "Enterprise users ask for weekly trends.",
        },
      ],
    });

    expect(decision.status).toBe("approved");
    expect(decision.approvedMutations).toHaveLength(2);
    expect(decision.deniedMutations).toEqual([]);
  });

  it("fails closed when any mutation targets a disallowed path", () => {
    const policy = createSelfAuthoringMutationPolicy({
      cwd: "/tmp/gravity-policy",
    });

    const decision = policy.evaluate({
      agentId: "data-analyst",
      mutations: [
        {
          targetKind: "skill",
          targetPath: "store/shared/skills/data-analyst-query-patterns.md",
          mode: "append",
          content: "- Allowed update.",
          summary: "Allowed update.",
          skillName: "data-analyst-query-patterns",
        },
        {
          targetKind: "skill",
          targetPath: "src/index.ts",
          mode: "append",
          content: "- Inject disallowed runtime change.",
          summary: "Inject disallowed runtime change.",
        },
      ],
    });

    expect(decision.status).toBe("mutation_policy_denied");
    expect(decision.approvedMutations).toHaveLength(1);
    expect(decision.deniedMutations).toHaveLength(1);
    expect(decision.deniedMutations[0]).toMatchObject({
      targetPath: "src/index.ts",
      reason: "path_outside_shared_skills_root",
    });
  });
});
