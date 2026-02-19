import path from "node:path";
import type {
  SelfAuthoringMutationDraft,
  SelfAuthoringMutationMode,
  SelfAuthoringMutationTargetKind,
} from "./self-authoring-types.js";

export type SelfAuthoringApprovedMutation = Readonly<{
  targetKind: SelfAuthoringMutationTargetKind;
  targetPath: string;
  normalizedAbsolutePath: string;
  normalizedRelativePath: string;
  mode: SelfAuthoringMutationMode;
  content: string;
  summary: string;
  skillName?: string;
}>;

export type SelfAuthoringDeniedMutation = Readonly<{
  targetKind: SelfAuthoringMutationTargetKind;
  targetPath: string;
  reason: string;
}>;

export type SelfAuthoringMutationPolicyDecision =
  | Readonly<{
      status: "approved";
      approvedMutations: readonly SelfAuthoringApprovedMutation[];
      deniedMutations: readonly SelfAuthoringDeniedMutation[];
    }>
  | Readonly<{
      status: "mutation_policy_denied";
      approvedMutations: readonly SelfAuthoringApprovedMutation[];
      deniedMutations: readonly SelfAuthoringDeniedMutation[];
    }>;

export type SelfAuthoringMutationPolicy = Readonly<{
  evaluate: (input: {
    agentId: string;
    mutations: readonly SelfAuthoringMutationDraft[];
  }) => SelfAuthoringMutationPolicyDecision;
}>;

type CreateSelfAuthoringMutationPolicyInput = Readonly<{
  cwd: string;
}>;

function isPathWithinDirectory(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeMutationContent(content: string): string | null {
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveSkillNameFromPath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized.endsWith(".md")) {
    return null;
  }

  const withoutExtension = normalized.slice(0, -3);
  return withoutExtension.length > 0 ? withoutExtension : null;
}

export function createSelfAuthoringMutationPolicy(
  input: CreateSelfAuthoringMutationPolicyInput,
): SelfAuthoringMutationPolicy {
  const cwdAbsolute = path.resolve(input.cwd);
  const skillsRoot = path.resolve(cwdAbsolute, "store", "shared", "skills");

  return {
    evaluate({ agentId, mutations }) {
      const approvedMutations: SelfAuthoringApprovedMutation[] = [];
      const deniedMutations: SelfAuthoringDeniedMutation[] = [];
      const expectedMemoryPath = path.resolve(
        cwdAbsolute,
        "store",
        "agents",
        agentId,
        "memory",
        "MEMORY.md",
      );

      for (const mutation of mutations) {
        const normalizedContent = normalizeMutationContent(mutation.content);
        if (!normalizedContent) {
          deniedMutations.push({
            targetKind: mutation.targetKind,
            targetPath: mutation.targetPath,
            reason: "content_empty",
          });
          continue;
        }

        const normalizedAbsolutePath = path.resolve(cwdAbsolute, mutation.targetPath);
        const normalizedRelativePath = path.relative(cwdAbsolute, normalizedAbsolutePath);

        if (mutation.targetKind === "skill") {
          if (!isPathWithinDirectory(normalizedAbsolutePath, skillsRoot)) {
            deniedMutations.push({
              targetKind: mutation.targetKind,
              targetPath: mutation.targetPath,
              reason: "path_outside_shared_skills_root",
            });
            continue;
          }

          if (!normalizedAbsolutePath.endsWith(".md")) {
            deniedMutations.push({
              targetKind: mutation.targetKind,
              targetPath: mutation.targetPath,
              reason: "skill_path_must_be_markdown",
            });
            continue;
          }

          const skillRelativePath = path.relative(skillsRoot, normalizedAbsolutePath);
          const derivedSkillName =
            mutation.skillName?.trim().toLowerCase() ??
            deriveSkillNameFromPath(skillRelativePath);

          if (!derivedSkillName) {
            deniedMutations.push({
              targetKind: mutation.targetKind,
              targetPath: mutation.targetPath,
              reason: "skill_name_missing",
            });
            continue;
          }

          approvedMutations.push({
            targetKind: mutation.targetKind,
            targetPath: mutation.targetPath,
            normalizedAbsolutePath,
            normalizedRelativePath,
            mode: mutation.mode,
            content: normalizedContent,
            summary: mutation.summary,
            skillName: derivedSkillName,
          });
          continue;
        }

        if (normalizedAbsolutePath !== expectedMemoryPath) {
          deniedMutations.push({
            targetKind: mutation.targetKind,
            targetPath: mutation.targetPath,
            reason: "memory_path_not_allowed",
          });
          continue;
        }

        approvedMutations.push({
          targetKind: mutation.targetKind,
          targetPath: mutation.targetPath,
          normalizedAbsolutePath,
          normalizedRelativePath,
          mode: mutation.mode,
          content: normalizedContent,
          summary: mutation.summary,
        });
      }

      if (deniedMutations.length > 0) {
        return {
          status: "mutation_policy_denied",
          approvedMutations,
          deniedMutations,
        };
      }

      return {
        status: "approved",
        approvedMutations,
        deniedMutations: [],
      };
    },
  };
}
