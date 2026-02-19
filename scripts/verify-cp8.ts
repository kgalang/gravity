import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDb,
  destroyDb,
  gravitySchema,
} from "../src/runtime/db.js";
import {
  createSelfAuthoringMutationApplier,
  type SelfAuthoringMutationApplier,
} from "../src/runtime/self-authoring-mutation-applier.js";
import { createSelfAuthoringMutationCoordinator } from "../src/runtime/self-authoring-mutation-coordinator.js";
import { createKyselySkillVersionAuditStore } from "../src/runtime/skill-version-audit-store.js";

const TARGET_AGENT_ID = "data-analyst";
const SKILL_NAME_MAIN = "cp8-verify-runtime-loop";
const SKILL_NAME_OVERFLOW = "cp8-verify-overflow";

type SkillVersionRow = {
  skill_name: string;
  version: number;
  change_summary: string | null;
};

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function ensureTargetAgentExists(
  db: ReturnType<typeof createDb>,
): Promise<void> {
  const row = await gravitySchema(db)
    .selectFrom("agents")
    .select(["id"])
    .where("id", "=", TARGET_AGENT_ID)
    .executeTakeFirst();

  if (!row) {
    throw new Error(`Agent ${TARGET_AGENT_ID} not found`);
  }
}

async function deleteAuditRows(
  db: ReturnType<typeof createDb>,
  skillNames: readonly string[],
): Promise<void> {
  await gravitySchema(db)
    .deleteFrom("skill_versions")
    .where("agent_id", "=", TARGET_AGENT_ID)
    .where("skill_name", "in", [...skillNames])
    .executeTakeFirst();
}

async function loadAuditRows(
  db: ReturnType<typeof createDb>,
  skillNames: readonly string[],
): Promise<SkillVersionRow[]> {
  return gravitySchema(db)
    .selectFrom("skill_versions")
    .select(["skill_name", "version", "change_summary"])
    .where("agent_id", "=", TARGET_AGENT_ID)
    .where("skill_name", "in", [...skillNames])
    .orderBy("skill_name", "asc")
    .orderBy("version", "asc")
    .execute() as Promise<SkillVersionRow[]>;
}

async function scaffoldVerificationStore(root: string): Promise<void> {
  await mkdir(path.join(root, "store", "shared", "skills"), {
    recursive: true,
  });
  await mkdir(path.join(root, "store", "agents", TARGET_AGENT_ID, "memory"), {
    recursive: true,
  });

  await writeFile(
    path.join(root, "store", "shared", "skills", `${SKILL_NAME_MAIN}.md`),
    "# CP8 Verify Skill\n",
    "utf8",
  );
  await writeFile(
    path.join(root, "store", "shared", "skills", `${SKILL_NAME_OVERFLOW}.md`),
    "# CP8 Verify Overflow Skill\n",
    "utf8",
  );
  await writeFile(
    path.join(root, "store", "agents", TARGET_AGENT_ID, "memory", "MEMORY.md"),
    "# Agent Memory\n",
    "utf8",
  );
}

async function main(): Promise<void> {
  process.loadEnvFile?.();

  const databaseUrl = process.env.DATABASE_URL;
  assertCondition(
    typeof databaseUrl === "string" && databaseUrl.length > 0,
    "DATABASE_URL must be set for CP8 verification",
  );

  const db = createDb(databaseUrl);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gravity-cp8-verify-"));
  const auditStore = createKyselySkillVersionAuditStore(db);
  const skillNames = [SKILL_NAME_MAIN, SKILL_NAME_OVERFLOW] as const;

  try {
    await ensureTargetAgentExists(db);
    await scaffoldVerificationStore(tempRoot);
    await deleteAuditRows(db, skillNames);

    const baseCoordinator = createSelfAuthoringMutationCoordinator({
      cwd: tempRoot,
      queueMaxDepth: 8,
      auditStore,
    });

    const teachApply = await baseCoordinator.execute({
      agentId: TARGET_AGENT_ID,
      sessionKey: `${TARGET_AGENT_ID}:verify:teach-apply`,
      runId: "cp8:teach-apply",
      sourceEventId: "cp8-teach-apply",
      userId: "U_CP8_VERIFY",
      prompt: [
        `Teach skill ${SKILL_NAME_MAIN}: Include variance notes when trend slope changes abruptly.`,
        "Remember: finance users ask for weekly deltas before monthly rollups.",
      ].join("\n"),
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    assertCondition(teachApply?.status === "completed", "Teach/apply mutation must complete");
    assert.equal(teachApply.appliedCount, 2, "Teach/apply should write skill + memory");
    assert.equal(teachApply.auditRecords.length, 1, "Teach/apply should write one skill audit record");

    const skillFilePath = path.join(
      tempRoot,
      "store",
      "shared",
      "skills",
      `${SKILL_NAME_MAIN}.md`,
    );
    const memoryFilePath = path.join(
      tempRoot,
      "store",
      "agents",
      TARGET_AGENT_ID,
      "memory",
      "MEMORY.md",
    );
    const skillAfterTeach = await readFile(skillFilePath, "utf8");
    const memoryAfterTeach = await readFile(memoryFilePath, "utf8");
    assert.match(skillAfterTeach, /variance notes/i);
    assert.match(memoryAfterTeach, /weekly deltas before monthly rollups/i);

    const duplicate = await baseCoordinator.execute({
      agentId: TARGET_AGENT_ID,
      sessionKey: `${TARGET_AGENT_ID}:verify:teach-apply`,
      runId: "cp8:teach-apply:duplicate",
      sourceEventId: "cp8-teach-apply",
      userId: "U_CP8_VERIFY",
      prompt: `Teach skill ${SKILL_NAME_MAIN}: this should be deduped and not re-applied.`,
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });
    assertCondition(
      duplicate?.status === "deduped_duplicate",
      "Duplicate trigger must be deduped",
    );

    const policyDenied = await baseCoordinator.execute({
      agentId: TARGET_AGENT_ID,
      sessionKey: `${TARGET_AGENT_ID}:verify:policy`,
      runId: "cp8:policy-denied",
      sourceEventId: "cp8-policy-denied",
      userId: "U_CP8_VERIFY",
      prompt: "Update file src/index.ts: bypass self-authoring policy guardrail.",
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });
    assertCondition(
      policyDenied?.status === "mutation_policy_denied",
      "Disallowed target must return mutation_policy_denied",
    );

    const delayedMainApplier = createSelfAuthoringMutationApplier({
      cwd: tempRoot,
    });
    const delayedApplier: SelfAuthoringMutationApplier = {
      apply: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return delayedMainApplier.apply(input);
      },
    };
    const fifoCoordinator = createSelfAuthoringMutationCoordinator({
      cwd: tempRoot,
      queueMaxDepth: 8,
      auditStore,
      applier: delayedApplier,
    });

    const [fifoOne, fifoTwo] = await Promise.all([
      fifoCoordinator.execute({
        agentId: TARGET_AGENT_ID,
        sessionKey: `${TARGET_AGENT_ID}:verify:fifo`,
        runId: "cp8:fifo:1",
        sourceEventId: "cp8-fifo-1",
        userId: "U_CP8_VERIFY",
        prompt: `Teach skill ${SKILL_NAME_MAIN}: fifo-order-one marker.`,
        triggerKind: "message",
        surface: "slack",
        entrypoint: "thread_reply",
      }),
      fifoCoordinator.execute({
        agentId: TARGET_AGENT_ID,
        sessionKey: `${TARGET_AGENT_ID}:verify:fifo`,
        runId: "cp8:fifo:2",
        sourceEventId: "cp8-fifo-2",
        userId: "U_CP8_VERIFY",
        prompt: `Teach skill ${SKILL_NAME_MAIN}: fifo-order-two marker.`,
        triggerKind: "message",
        surface: "slack",
        entrypoint: "thread_reply",
      }),
    ]);

    assertCondition(fifoOne?.status === "completed", "FIFO first mutation should complete");
    assertCondition(fifoTwo?.status === "completed", "FIFO second mutation should complete");

    const skillAfterFifo = await readFile(skillFilePath, "utf8");
    const fifoOneIndex = skillAfterFifo.indexOf("fifo-order-one marker");
    const fifoTwoIndex = skillAfterFifo.indexOf("fifo-order-two marker");
    assertCondition(
      fifoOneIndex >= 0 && fifoTwoIndex > fifoOneIndex,
      "FIFO markers must be written in enqueue order",
    );

    const overflowCoordinator = createSelfAuthoringMutationCoordinator({
      cwd: tempRoot,
      queueMaxDepth: 1,
      auditStore,
      applier: delayedApplier,
    });

    const overflowFirstPromise = overflowCoordinator.execute({
      agentId: TARGET_AGENT_ID,
      sessionKey: `${TARGET_AGENT_ID}:verify:overflow`,
      runId: "cp8:overflow:1",
      sourceEventId: "cp8-overflow-1",
      userId: "U_CP8_VERIFY",
      prompt: `Teach skill ${SKILL_NAME_OVERFLOW}: overflow-first marker.`,
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });
    const overflowSecondPromise = overflowCoordinator.execute({
      agentId: TARGET_AGENT_ID,
      sessionKey: `${TARGET_AGENT_ID}:verify:overflow`,
      runId: "cp8:overflow:2",
      sourceEventId: "cp8-overflow-2",
      userId: "U_CP8_VERIFY",
      prompt: `Teach skill ${SKILL_NAME_OVERFLOW}: overflow-second marker.`,
      triggerKind: "message",
      surface: "slack",
      entrypoint: "thread_reply",
    });

    const [overflowFirst, overflowSecond] = await Promise.all([
      overflowFirstPromise,
      overflowSecondPromise,
    ]);

    assertCondition(
      overflowFirst?.status === "completed",
      "Overflow first mutation should complete",
    );
    assertCondition(
      overflowSecond?.status === "queue_overflow",
      "Overflow second mutation should return queue_overflow",
    );

    const expectedAuditRows = [teachApply, fifoOne, fifoTwo, overflowFirst].reduce(
      (count, outcome) => {
        if (outcome?.status !== "completed") {
          return count;
        }
        return count + outcome.auditRecords.length;
      },
      0,
    );

    const auditRows = await loadAuditRows(db, skillNames);
    assert.equal(
      auditRows.length,
      expectedAuditRows,
      "Skill audit row count must match completed skill mutations",
    );

    for (const row of auditRows) {
      assertCondition(
        typeof row.change_summary === "string" && row.change_summary.includes("runId="),
        "Skill audit change_summary must include stable run linkage",
      );
      assertCondition(
        row.change_summary.includes("sessionKey=") &&
          row.change_summary.includes("sourceEventId="),
        "Skill audit change_summary must include session/source linkage",
      );
    }

    console.log(
      "verification passed (teach_apply=true, mutation_correctness=true, auditability=true, idempotent_dedupe=true, lock_fifo=true, queue_overflow=true, mutation_policy_guardrail=true, stable_id_linkage=true)",
    );
  } finally {
    await deleteAuditRows(db, skillNames);
    await destroyDb(db);
    await rm(tempRoot, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`verification failed: ${message}`);
  process.exit(1);
});
