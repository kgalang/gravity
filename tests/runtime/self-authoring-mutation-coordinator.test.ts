import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSelfAuthoringMutationApplier,
  type SelfAuthoringMutationApplier,
} from "../../src/runtime/self-authoring-mutation-applier.js";
import { createSelfAuthoringMutationCoordinator } from "../../src/runtime/self-authoring-mutation-coordinator.js";
import type {
  SkillVersionAuditMutation,
  SkillVersionAuditRecord,
  SkillVersionAuditStore,
} from "../../src/runtime/skill-version-audit-store.js";

class InMemorySkillVersionAuditStore implements SkillVersionAuditStore {
  readonly mutations: SkillVersionAuditMutation[] = [];
  readonly versions = new Map<string, number>();

  async recordSkillMutation(
    input: SkillVersionAuditMutation,
  ): Promise<SkillVersionAuditRecord> {
    this.mutations.push(input);
    const key = `${input.agentId}:${input.skillName}`;
    const nextVersion = (this.versions.get(key) ?? 0) + 1;
    this.versions.set(key, nextVersion);

    return {
      skillName: input.skillName,
      version: nextVersion,
    };
  }
}

class FailingSkillVersionAuditStore implements SkillVersionAuditStore {
  readonly mutations: SkillVersionAuditMutation[] = [];
  private readonly failAfter: number;

  constructor(input?: { failAfter?: number }) {
    this.failAfter = input?.failAfter ?? 0;
  }

  async recordSkillMutation(
    input: SkillVersionAuditMutation,
  ): Promise<SkillVersionAuditRecord> {
    this.mutations.push(input);
    if (this.mutations.length > this.failAfter) {
      throw new Error("audit store unavailable");
    }

    return {
      skillName: input.skillName,
      version: this.mutations.length,
    };
  }
}

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function scaffoldStore(root: string): Promise<void> {
  await mkdir(path.join(root, "store", "shared", "skills"), {
    recursive: true,
  });
  await mkdir(path.join(root, "store", "agents", "data-analyst", "memory"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "store", "shared", "skills", "data-analyst-query-patterns.md"),
    "# Query Patterns\n",
    "utf8",
  );
  await writeFile(
    path.join(root, "store", "agents", "data-analyst", "memory", "MEMORY.md"),
    "# Agent Memory\n",
    "utf8",
  );
}

describe("createSelfAuthoringMutationCoordinator", () => {
  it("applies skill/memory mutations and logs skill audits", async () => {
    const root = await createTempRoot("gravity-self-authoring-coordinator-");
    await scaffoldStore(root);
    const auditStore = new InMemorySkillVersionAuditStore();

    const coordinator = createSelfAuthoringMutationCoordinator({
      cwd: root,
      queueMaxDepth: 8,
      auditStore,
    });

    const outcome = await coordinator.execute({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-1",
      runId: "slack:evt-1",
      sourceEventId: "evt-1",
      userId: "U123",
      prompt: [
        "Teach skill data-analyst-query-patterns: Include trailing 7-day deltas when trends are requested.",
        "Remember: enterprise users ask for weekly trend deltas.",
      ].join("\n"),
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    expect(outcome).not.toBeNull();
    expect(outcome?.status).toBe("completed");
    if (!outcome || outcome.status !== "completed") {
      throw new Error("Expected completed outcome");
    }

    expect(outcome.appliedCount).toBe(2);
    expect(outcome.auditRecords).toHaveLength(1);
    expect(outcome.rollbackSnapshotPath).not.toBeNull();

    const skillContent = await readFile(
      path.join(root, "store", "shared", "skills", "data-analyst-query-patterns.md"),
      "utf8",
    );
    expect(skillContent).toContain("Include trailing 7-day deltas");

    const memoryContent = await readFile(
      path.join(root, "store", "agents", "data-analyst", "memory", "MEMORY.md"),
      "utf8",
    );
    expect(memoryContent).toContain("enterprise users ask for weekly trend deltas");

    expect(auditStore.mutations).toHaveLength(1);
    expect(auditStore.mutations[0]).toMatchObject({
      agentId: "data-analyst",
      skillName: "data-analyst-query-patterns",
      changedBy: "slack:U123",
    });
    expect(auditStore.mutations[0]?.changeSummary).toContain("runId=slack:evt-1");
  });

  it("rejects non-allowlisted paths with mutation_policy_denied", async () => {
    const root = await createTempRoot("gravity-self-authoring-coordinator-");
    await scaffoldStore(root);
    const auditStore = new InMemorySkillVersionAuditStore();

    const coordinator = createSelfAuthoringMutationCoordinator({
      cwd: root,
      queueMaxDepth: 8,
      auditStore,
    });

    const outcome = await coordinator.execute({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-2",
      runId: "slack:evt-2",
      sourceEventId: "evt-2",
      userId: "U123",
      prompt: "Update file src/index.ts: disable path checks.",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    expect(outcome).not.toBeNull();
    expect(outcome?.status).toBe("mutation_policy_denied");
    if (!outcome || outcome.status !== "mutation_policy_denied") {
      throw new Error("Expected mutation_policy_denied outcome");
    }

    expect(outcome.deniedTargets[0]).toContain("src/index.ts");
    expect(auditStore.mutations).toHaveLength(0);
  });

  it("dedupes duplicate source-event trigger keys", async () => {
    const root = await createTempRoot("gravity-self-authoring-coordinator-");
    await scaffoldStore(root);
    const auditStore = new InMemorySkillVersionAuditStore();

    const coordinator = createSelfAuthoringMutationCoordinator({
      cwd: root,
      queueMaxDepth: 8,
      auditStore,
    });

    const first = await coordinator.execute({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-3",
      runId: "slack:evt-3",
      sourceEventId: "evt-3",
      userId: "U123",
      prompt:
        "Teach skill data-analyst-query-patterns: Prefer trend summaries first.",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });
    const duplicate = await coordinator.execute({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-3",
      runId: "slack:evt-3-dup",
      sourceEventId: "evt-3",
      userId: "U123",
      prompt:
        "Teach skill data-analyst-query-patterns: This duplicate should be dropped.",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    expect(first?.status).toBe("completed");
    expect(duplicate).toMatchObject({
      status: "deduped_duplicate",
      queueSeq: null,
    });
    expect(auditStore.mutations).toHaveLength(1);
  });

  it("rolls back file mutations when audit logging fails", async () => {
    const root = await createTempRoot("gravity-self-authoring-coordinator-");
    await scaffoldStore(root);
    const auditStore = new FailingSkillVersionAuditStore();

    const coordinator = createSelfAuthoringMutationCoordinator({
      cwd: root,
      queueMaxDepth: 8,
      auditStore,
    });

    const outcome = await coordinator.execute({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-rollback",
      runId: "slack:evt-rollback",
      sourceEventId: "evt-rollback",
      userId: "U123",
      prompt: [
        "Teach skill data-analyst-query-patterns: Add a rollback verification marker.",
        "Remember: this memory write should also roll back on audit failure.",
      ].join("\n"),
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    expect(outcome).not.toBeNull();
    expect(outcome?.status).toBe("failed");
    if (!outcome || outcome.status !== "failed") {
      throw new Error("Expected failed outcome");
    }

    expect(outcome.errorMessage).toContain("audit store unavailable");
    expect(outcome.stageHistory).toContain("mutation_applied");
    expect(auditStore.mutations).toHaveLength(1);

    const skillContent = await readFile(
      path.join(root, "store", "shared", "skills", "data-analyst-query-patterns.md"),
      "utf8",
    );
    const memoryContent = await readFile(
      path.join(root, "store", "agents", "data-analyst", "memory", "MEMORY.md"),
      "utf8",
    );
    expect(skillContent).toBe("# Query Patterns\n");
    expect(memoryContent).toBe("# Agent Memory\n");
  });

  it("uses namespaced file paths when deriving skill audit names", async () => {
    const root = await createTempRoot("gravity-self-authoring-coordinator-");
    await scaffoldStore(root);
    const auditStore = new InMemorySkillVersionAuditStore();

    const coordinator = createSelfAuthoringMutationCoordinator({
      cwd: root,
      queueMaxDepth: 8,
      auditStore,
    });

    const outcome = await coordinator.execute({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-namespaced",
      runId: "slack:evt-namespaced",
      sourceEventId: "evt-namespaced",
      userId: "U123",
      prompt: [
        "Update file store/shared/skills/team-a/query.md: Capture region-level variance checks.",
        "Update file store/shared/skills/team-b/query.md: Require baseline alignment checks.",
      ].join("\n"),
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    expect(outcome?.status).toBe("completed");
    expect(auditStore.mutations).toHaveLength(2);
    expect(auditStore.mutations.map((mutation) => mutation.skillName)).toEqual([
      "team-a/query",
      "team-b/query",
    ]);
  });

  it("returns queue_overflow when lock scope queue is full", async () => {
    const root = await createTempRoot("gravity-self-authoring-coordinator-");
    await scaffoldStore(root);
    const auditStore = new InMemorySkillVersionAuditStore();

    const baseApplier = createSelfAuthoringMutationApplier({ cwd: root });
    const delayedApplier: SelfAuthoringMutationApplier = {
      apply: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return baseApplier.apply(input);
      },
      rollbackFromSnapshot: async (input) => {
        await baseApplier.rollbackFromSnapshot(input);
      },
    };

    const coordinator = createSelfAuthoringMutationCoordinator({
      cwd: root,
      queueMaxDepth: 1,
      auditStore,
      applier: delayedApplier,
    });

    const firstPromise = coordinator.execute({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-4",
      runId: "slack:evt-4a",
      sourceEventId: "evt-4a",
      userId: "U123",
      prompt:
        "Teach skill data-analyst-query-patterns: First queued mutation should run.",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    const secondPromise = coordinator.execute({
      agentId: "data-analyst",
      sessionKey: "data-analyst:thread-4",
      runId: "slack:evt-4b",
      sourceEventId: "evt-4b",
      userId: "U123",
      prompt:
        "Teach skill data-analyst-query-patterns: Second mutation should overflow.",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first?.status).toBe("completed");
    expect(second).toMatchObject({
      status: "queue_overflow",
      queueSeq: null,
      maxDepth: 1,
    });
  });
});
