import { createHash } from "node:crypto";
import {
  createSelfAuthoringIntentDetector,
  type SelfAuthoringIntentDetector,
} from "./self-authoring-intent.js";
import {
  createSelfAuthoringMutationApplier,
  type SelfAuthoringApplyResult,
  type SelfAuthoringMutationApplier,
} from "./self-authoring-mutation-applier.js";
import {
  createSelfAuthoringMutationPolicy,
  type SelfAuthoringMutationPolicy,
} from "./self-authoring-mutation-policy.js";
import {
  createSelfAuthoringMutationQueue,
  type SelfAuthoringMutationQueue,
} from "./self-authoring-mutation-queue.js";
import {
  type SkillVersionAuditRecord,
  type SkillVersionAuditStore,
} from "./skill-version-audit-store.js";
import type {
  SelfAuthoringRequestContext,
  SelfAuthoringTransactionStage,
} from "./self-authoring-types.js";

export type SelfAuthoringMutationCompletedResult = Readonly<{
  status: "completed";
  triggerKey: string;
  queueSeq: number;
  stageHistory: readonly SelfAuthoringTransactionStage[];
  mutationCount: number;
  appliedCount: number;
  auditRecords: readonly SkillVersionAuditRecord[];
  rollbackSnapshotPath: string | null;
}>;

export type SelfAuthoringMutationRejectedResult = Readonly<{
  status: "mutation_policy_denied";
  triggerKey: string;
  queueSeq: number;
  stageHistory: readonly SelfAuthoringTransactionStage[];
  deniedTargets: readonly string[];
}>;

export type SelfAuthoringMutationQueueRejectedResult =
  | Readonly<{
      status: "deduped_duplicate";
      triggerKey: string;
      queueSeq: null;
    }>
  | Readonly<{
      status: "queue_overflow";
      triggerKey: string;
      queueSeq: null;
      maxDepth: number;
    }>;

export type SelfAuthoringMutationFailedResult = Readonly<{
  status: "failed";
  triggerKey: string;
  queueSeq: number;
  stageHistory: readonly SelfAuthoringTransactionStage[];
  errorMessage: string;
}>;

export type SelfAuthoringMutationOutcome =
  | SelfAuthoringMutationCompletedResult
  | SelfAuthoringMutationRejectedResult
  | SelfAuthoringMutationQueueRejectedResult
  | SelfAuthoringMutationFailedResult;

export type SelfAuthoringMutationCoordinator = Readonly<{
  detectIntent: (prompt: string) => boolean;
  execute: (
    request: SelfAuthoringRequestContext,
  ) => Promise<SelfAuthoringMutationOutcome | null>;
}>;

type CreateSelfAuthoringMutationCoordinatorInput = Readonly<{
  cwd: string;
  queueMaxDepth: number;
  auditStore: SkillVersionAuditStore;
  intentDetector?: SelfAuthoringIntentDetector;
  policy?: SelfAuthoringMutationPolicy;
  applier?: SelfAuthoringMutationApplier;
  queue?: SelfAuthoringMutationQueue;
}>;

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeSourceEventId(sourceEventId: string | null): string | null {
  if (sourceEventId === null) {
    return null;
  }

  const trimmed = sourceEventId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function computeTriggerKey(request: SelfAuthoringRequestContext): string {
  const sourceEventId = normalizeSourceEventId(request.sourceEventId);
  if (sourceEventId) {
    return sourceEventId;
  }

  const normalizedPrompt = request.prompt.trim().replace(/\s+/g, " ");
  const hashInput = [
    request.agentId,
    request.sessionKey,
    request.runId,
    normalizedPrompt,
  ].join("|");
  return `hash:${createHash("sha256").update(hashInput, "utf8").digest("hex")}`;
}

function buildAuditChangeSummary(input: {
  mutationSummary: string;
  runId: string;
  sessionKey: string;
  sourceEventId: string | null;
}): string {
  const linkage = [
    `runId=${input.runId}`,
    `sessionKey=${input.sessionKey}`,
    `sourceEventId=${input.sourceEventId ?? "null"}`,
  ].join(" ");

  return `[${linkage}] ${input.mutationSummary}`;
}

function formatCompletedOutcome(result: SelfAuthoringMutationCompletedResult): string {
  return [
    "Self-authoring completed.",
    `status: ${result.status}`,
    `queue_seq: ${result.queueSeq}`,
    `mutations_applied: ${result.appliedCount}/${result.mutationCount}`,
    `skill_audit_records: ${result.auditRecords.length}`,
    `rollback_snapshot: ${result.rollbackSnapshotPath ?? "none"}`,
  ].join("\n");
}

function formatPolicyDeniedOutcome(result: SelfAuthoringMutationRejectedResult): string {
  const denied =
    result.deniedTargets.length > 0
      ? result.deniedTargets.map((target) => `- ${target}`).join("\n")
      : "- (none)";

  return [
    "Self-authoring rejected.",
    `status: ${result.status}`,
    "denied_targets:",
    denied,
  ].join("\n");
}

export function formatSelfAuthoringOutcome(outcome: SelfAuthoringMutationOutcome): string {
  if (outcome.status === "completed") {
    return formatCompletedOutcome(outcome);
  }

  if (outcome.status === "mutation_policy_denied") {
    return formatPolicyDeniedOutcome(outcome);
  }

  if (outcome.status === "deduped_duplicate") {
    return [
      "Self-authoring skipped.",
      "status: deduped_duplicate",
      `trigger_key: ${outcome.triggerKey}`,
    ].join("\n");
  }

  if (outcome.status === "queue_overflow") {
    return [
      "Self-authoring rejected.",
      "status: queue_overflow",
      `max_depth: ${outcome.maxDepth}`,
    ].join("\n");
  }

  return [
    "Self-authoring failed.",
    "status: failed",
    `error: ${outcome.errorMessage}`,
  ].join("\n");
}

export function createSelfAuthoringMutationCoordinator(
  input: CreateSelfAuthoringMutationCoordinatorInput,
): SelfAuthoringMutationCoordinator {
  const intentDetector =
    input.intentDetector ?? createSelfAuthoringIntentDetector();
  const policy =
    input.policy ??
    createSelfAuthoringMutationPolicy({
      cwd: input.cwd,
    });
  const applier =
    input.applier ??
    createSelfAuthoringMutationApplier({
      cwd: input.cwd,
    });
  const queue =
    input.queue ??
    createSelfAuthoringMutationQueue({
      maxDepth: input.queueMaxDepth,
    });

  return {
    detectIntent(prompt) {
      return intentDetector.detectIntent(prompt);
    },

    async execute(request) {
      const delta = intentDetector.generateDelta({
        agentId: request.agentId,
        prompt: request.prompt,
      });
      if (!delta) {
        return null;
      }

      const triggerKey = computeTriggerKey(request);
      const queueResult = queue.enqueue({
        lockScopeKey: request.agentId,
        triggerKey,
        task: async () => {
          const stageHistory: SelfAuthoringTransactionStage[] = [
            "request_received",
            "authoring_turn_completed",
            "mutation_lock_acquired",
          ];
          let appliedResult: SelfAuthoringApplyResult | null = null;

          try {
            const decision = policy.evaluate({
              agentId: request.agentId,
              mutations: delta.mutations,
            });

            if (decision.status === "mutation_policy_denied") {
              stageHistory.push("failed");
              return {
                status: "mutation_policy_denied",
                triggerKey,
                queueSeq: -1,
                stageHistory,
                deniedTargets: decision.deniedMutations.map(
                  (mutation) => `${mutation.targetPath} (${mutation.reason})`,
                ),
              } satisfies SelfAuthoringMutationRejectedResult;
            }

            appliedResult = await applier.apply({
              agentId: request.agentId,
              runId: request.runId,
              sessionKey: request.sessionKey,
              sourceEventId: request.sourceEventId,
              mutations: decision.approvedMutations,
            });
            stageHistory.push("mutation_applied");

            const changedBy = request.userId?.trim()
              ? `slack:${request.userId.trim()}`
              : "system";

            const auditRecords: SkillVersionAuditRecord[] = [];
            for (const mutation of appliedResult.appliedMutations) {
              if (mutation.targetKind !== "skill" || !mutation.skillName) {
                continue;
              }

              const record = await input.auditStore.recordSkillMutation({
                agentId: request.agentId,
                skillName: mutation.skillName,
                changedBy,
                changeSummary: buildAuditChangeSummary({
                  mutationSummary: mutation.summary,
                  runId: request.runId,
                  sessionKey: request.sessionKey,
                  sourceEventId: request.sourceEventId,
                }),
                fileHash: mutation.fileHash,
              });
              auditRecords.push(record);
            }

            stageHistory.push("audit_logged", "completed");
            return {
              status: "completed",
              triggerKey,
              queueSeq: -1,
              stageHistory,
              mutationCount: delta.mutations.length,
              appliedCount: appliedResult.appliedMutations.length,
              auditRecords,
              rollbackSnapshotPath: appliedResult.rollbackSnapshotPath,
            } satisfies SelfAuthoringMutationCompletedResult;
          } catch (error) {
            const errorMessages = [normalizeErrorMessage(error)];
            if (appliedResult?.rollbackSnapshotPath) {
              try {
                await applier.rollbackFromSnapshot({
                  rollbackSnapshotPath: appliedResult.rollbackSnapshotPath,
                });
              } catch (rollbackError) {
                errorMessages.push(
                  `rollback_failed (${appliedResult.rollbackSnapshotPath}): ${normalizeErrorMessage(
                    rollbackError,
                  )}`,
                );
              }
            }

            stageHistory.push("failed");
            return {
              status: "failed",
              triggerKey,
              queueSeq: -1,
              stageHistory,
              errorMessage: errorMessages.join("; "),
            } satisfies SelfAuthoringMutationFailedResult;
          }
        },
      });

      if (queueResult.status === "deduped_duplicate") {
        return {
          status: "deduped_duplicate",
          triggerKey,
          queueSeq: null,
        };
      }

      if (queueResult.status === "queue_overflow") {
        return {
          status: "queue_overflow",
          triggerKey,
          queueSeq: null,
          maxDepth: queueResult.maxDepth,
        };
      }

      const queuedResult = await queueResult.completion;
      if (queuedResult.status === "completed") {
        return {
          ...queuedResult,
          queueSeq: queueResult.queueSeq,
        };
      }

      if (queuedResult.status === "mutation_policy_denied") {
        return {
          ...queuedResult,
          queueSeq: queueResult.queueSeq,
        };
      }

      return {
        ...queuedResult,
        queueSeq: queueResult.queueSeq,
      };
    },
  };
}
