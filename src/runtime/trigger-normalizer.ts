import type { MessageEntrypoint } from "./ingress-binding-resolver.js";
import type {
  RunEntrypoint,
  RunSurface,
  RunTriggerKind,
} from "./run-lifecycle.js";

export type ProactiveTriggerKind = "cron" | "heartbeat";

export type NormalizedTrigger = {
  triggerKind: RunTriggerKind;
  surface: RunSurface;
  entrypoint: RunEntrypoint;
};

export function normalizeSystemTrigger(): NormalizedTrigger {
  return {
    triggerKind: "system",
    surface: "system",
    entrypoint: "system",
  };
}

export function normalizeSlackSlashCommandTrigger(): NormalizedTrigger {
  return {
    triggerKind: "message",
    surface: "slack",
    entrypoint: "slash_command",
  };
}

export function normalizeSlackMessageTrigger(
  entrypoint: MessageEntrypoint,
): NormalizedTrigger {
  return {
    triggerKind: "message",
    surface: "slack",
    entrypoint,
  };
}

export function normalizeProactiveTrigger(
  kind: ProactiveTriggerKind,
): NormalizedTrigger {
  return {
    triggerKind: kind,
    surface: "system",
    entrypoint: kind,
  };
}
