import type {
  RunEntrypoint,
  RunSurface,
  RunTriggerKind,
} from "./run-lifecycle.js";

export type SelfAuthoringMutationTargetKind = "skill" | "memory";
export type SelfAuthoringMutationMode = "append" | "replace";

export type SelfAuthoringMutationDraft = Readonly<{
  targetKind: SelfAuthoringMutationTargetKind;
  targetPath: string;
  mode: SelfAuthoringMutationMode;
  content: string;
  summary: string;
  skillName?: string;
}>;

export type SelfAuthoringDelta = Readonly<{
  summary: string;
  mutations: readonly SelfAuthoringMutationDraft[];
}>;

export type SelfAuthoringRequestContext = Readonly<{
  agentId: string;
  sessionKey: string;
  runId: string;
  sourceEventId: string | null;
  userId: string | null;
  prompt: string;
  triggerKind: RunTriggerKind;
  surface: RunSurface;
  entrypoint: RunEntrypoint;
}>;

export type SelfAuthoringTransactionStage =
  | "request_received"
  | "authoring_turn_completed"
  | "mutation_lock_acquired"
  | "mutation_applied"
  | "audit_logged"
  | "completed"
  | "failed";
