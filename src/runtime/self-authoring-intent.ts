import path from "node:path";
import type {
  SelfAuthoringDelta,
  SelfAuthoringMutationDraft,
} from "./self-authoring-types.js";

type CreateSelfAuthoringIntentDetectorInput = Readonly<{
  now?: () => Date;
}>;

export type SelfAuthoringIntentDetector = Readonly<{
  detectIntent: (prompt: string) => boolean;
  generateDelta: (input: { agentId: string; prompt: string }) => SelfAuthoringDelta | null;
}>;

type ParsedMutationLine = Readonly<{
  targetKind: "skill" | "memory";
  targetPath: string;
  summary: string;
  content: string;
  skillName?: string;
}>;

const SKILL_LINE_PATTERN =
  /^(?:teach|update|add)\s+skill\s+([a-z0-9][a-z0-9\-/]*)\s*[:|-]\s*(.+)$/i;
const MEMORY_LINE_PATTERN =
  /^(?:teach|update)\s+memory\s*[:|-]\s*(.+)$/i;
const REMEMBER_LINE_PATTERN = /^(?:remember|learned)\s*[:|-]\s*(.+)$/i;
const TEACH_THAT_PATTERN = /^teach\s+that\s+(.+)$/i;
const FILE_LINE_PATTERN = /^(?:write|update)\s+file\s+([^\s]+)\s*[:|-]\s*(.+)$/i;

function normalizePrompt(prompt: string): string {
  return prompt.trim();
}

function normalizeSummary(summary: string): string | null {
  const normalized = summary.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function normalizeMutationContent(content: string): string {
  return content.trim();
}

function deriveSkillPath(skillName: string): string {
  const normalizedSkill = skillName.trim().toLowerCase();
  return path.posix.join("store", "shared", "skills", `${normalizedSkill}.md`);
}

function deriveMemoryPath(agentId: string): string {
  return path.posix.join("store", "agents", agentId, "memory", "MEMORY.md");
}

function formatSkillAppendContent(summary: string, now: Date): string {
  const timestamp = now.toISOString();
  return [`## Self-Authored Update (${timestamp})`, `- ${summary}`].join("\n");
}

function formatMemoryAppendContent(summary: string): string {
  const normalized = summary.startsWith("- ") ? summary : `- ${summary}`;
  return normalized;
}

function parseFileTargetLine(input: {
  agentId: string;
  line: string;
  now: Date;
}): ParsedMutationLine | null {
  const fileMatch = input.line.match(FILE_LINE_PATTERN);
  if (!fileMatch) {
    return null;
  }

  const rawPath = fileMatch[1]?.trim();
  const summary = normalizeSummary(fileMatch[2] ?? "");
  if (!rawPath || !summary) {
    return null;
  }

  if (rawPath.endsWith("/MEMORY.md") || rawPath === "MEMORY.md") {
    return {
      targetKind: "memory",
      targetPath: rawPath,
      summary,
      content: formatMemoryAppendContent(summary),
    };
  }

  return {
    targetKind: "skill",
    targetPath: rawPath,
    summary,
    content: formatSkillAppendContent(summary, input.now),
  };
}

function parseSingleLineMutation(input: {
  agentId: string;
  line: string;
  now: Date;
}): ParsedMutationLine | null {
  const skillMatch = input.line.match(SKILL_LINE_PATTERN);
  if (skillMatch) {
    const skillName = skillMatch[1]?.trim().toLowerCase();
    const summary = normalizeSummary(skillMatch[2] ?? "");
    if (!skillName || !summary) {
      return null;
    }

    return {
      targetKind: "skill",
      targetPath: deriveSkillPath(skillName),
      summary,
      content: formatSkillAppendContent(summary, input.now),
      skillName,
    };
  }

  const memoryMatch =
    input.line.match(MEMORY_LINE_PATTERN) ??
    input.line.match(REMEMBER_LINE_PATTERN) ??
    input.line.match(TEACH_THAT_PATTERN);

  if (memoryMatch) {
    const summary = normalizeSummary(memoryMatch[1] ?? "");
    if (!summary) {
      return null;
    }

    return {
      targetKind: "memory",
      targetPath: deriveMemoryPath(input.agentId),
      summary,
      content: formatMemoryAppendContent(summary),
    };
  }

  return parseFileTargetLine(input);
}

function parseMutationLines(input: {
  agentId: string;
  prompt: string;
  now: Date;
}): ParsedMutationLine[] {
  const lines = input.prompt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsed: ParsedMutationLine[] = [];
  for (const line of lines) {
    const mutation = parseSingleLineMutation({
      agentId: input.agentId,
      line,
      now: input.now,
    });
    if (!mutation) {
      continue;
    }
    parsed.push(mutation);
  }

  return parsed;
}

function toMutationDraft(line: ParsedMutationLine): SelfAuthoringMutationDraft {
  return {
    targetKind: line.targetKind,
    targetPath: line.targetPath,
    mode: "append",
    content: normalizeMutationContent(line.content),
    summary: line.summary,
    ...(line.skillName ? { skillName: line.skillName } : {}),
  };
}

export function createSelfAuthoringIntentDetector(
  input: CreateSelfAuthoringIntentDetectorInput = {},
): SelfAuthoringIntentDetector {
  const now = input.now ?? (() => new Date());

  return {
    detectIntent(prompt) {
      const normalized = normalizePrompt(prompt);
      if (normalized.length === 0) {
        return false;
      }

      return parseMutationLines({
        agentId: "intent-probe",
        prompt: normalized,
        now: now(),
      }).length > 0;
    },

    generateDelta({ agentId, prompt }) {
      const normalized = normalizePrompt(prompt);
      if (normalized.length === 0) {
        return null;
      }

      const parsed = parseMutationLines({
        agentId,
        prompt: normalized,
        now: now(),
      });
      if (parsed.length === 0) {
        return null;
      }

      const mutations = parsed.map(toMutationDraft);
      return {
        summary: parsed.map((mutation) => mutation.summary).join("; "),
        mutations,
      };
    },
  };
}
