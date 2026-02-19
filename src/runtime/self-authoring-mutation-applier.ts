import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SelfAuthoringApprovedMutation } from "./self-authoring-mutation-policy.js";

export type SelfAuthoringAppliedMutation = Readonly<{
  targetKind: "skill" | "memory";
  normalizedAbsolutePath: string;
  normalizedRelativePath: string;
  skillName?: string;
  summary: string;
  fileHash: string;
}>;

export type SelfAuthoringApplyResult = Readonly<{
  appliedMutations: readonly SelfAuthoringAppliedMutation[];
  rollbackSnapshotPath: string | null;
}>;

export type SelfAuthoringMutationApplier = Readonly<{
  apply: (input: {
    agentId: string;
    runId: string;
    sessionKey: string;
    sourceEventId: string | null;
    mutations: readonly SelfAuthoringApprovedMutation[];
  }) => Promise<SelfAuthoringApplyResult>;
  rollbackFromSnapshot: (input: {
    rollbackSnapshotPath: string;
  }) => Promise<void>;
}>;

type CreateSelfAuthoringMutationApplierInput = Readonly<{
  cwd: string;
  rollbackSnapshotRoot?: string;
}>;

type RollbackSnapshotEntry = {
  targetKind: "skill" | "memory";
  normalizedRelativePath: string;
  previousContent: string | null;
};

function isPathWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseRollbackSnapshotEntries(snapshot: unknown): RollbackSnapshotEntry[] {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Rollback snapshot is not an object");
  }

  const entries = (snapshot as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    throw new Error("Rollback snapshot entries are missing");
  }

  return entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Rollback entry at index ${index} is invalid`);
    }

    const targetKind = (entry as { targetKind?: unknown }).targetKind;
    const normalizedRelativePath = (entry as { normalizedRelativePath?: unknown })
      .normalizedRelativePath;
    const previousContent = (entry as { previousContent?: unknown }).previousContent;

    if (targetKind !== "skill" && targetKind !== "memory") {
      throw new Error(`Rollback entry at index ${index} has invalid target kind`);
    }

    if (
      typeof normalizedRelativePath !== "string" ||
      normalizedRelativePath.trim().length === 0
    ) {
      throw new Error(
        `Rollback entry at index ${index} has invalid normalized relative path`,
      );
    }

    if (typeof previousContent !== "string" && previousContent !== null) {
      throw new Error(`Rollback entry at index ${index} has invalid previous content`);
    }

    return {
      targetKind,
      normalizedRelativePath,
      previousContent,
    };
  });
}

function normalizeWriteContent(mode: "append" | "replace", content: string, existing: string | null): string {
  const normalized = content.trim();
  if (normalized.length === 0) {
    throw new Error("Mutation content must be non-empty");
  }

  if (mode === "replace") {
    return `${normalized}\n`;
  }

  if (!existing || existing.trim().length === 0) {
    return `${normalized}\n`;
  }

  const withTrailingNewline = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${withTrailingNewline}${normalized}\n`;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function sanitizeFileToken(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function readOptionalUtf8(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export function createSelfAuthoringMutationApplier(
  input: CreateSelfAuthoringMutationApplierInput,
): SelfAuthoringMutationApplier {
  const cwdAbsolute = path.resolve(input.cwd);
  const rollbackSnapshotRoot = path.resolve(
    cwdAbsolute,
    input.rollbackSnapshotRoot ?? "workspace/self-authoring-rollbacks",
  );

  return {
    async apply({ agentId, runId, sessionKey, sourceEventId, mutations }) {
      const orderedMutations = [...mutations].sort((left, right) =>
        left.normalizedAbsolutePath.localeCompare(right.normalizedAbsolutePath),
      );

      const appliedMutations: SelfAuthoringAppliedMutation[] = [];
      const rollbackEntries: RollbackSnapshotEntry[] = [];

      for (const mutation of orderedMutations) {
        const existingContent = await readOptionalUtf8(mutation.normalizedAbsolutePath);
        const nextContent = normalizeWriteContent(
          mutation.mode,
          mutation.content,
          existingContent,
        );

        await mkdir(path.dirname(mutation.normalizedAbsolutePath), { recursive: true });
        await writeFile(mutation.normalizedAbsolutePath, nextContent, "utf8");

        rollbackEntries.push({
          targetKind: mutation.targetKind,
          normalizedRelativePath: mutation.normalizedRelativePath,
          previousContent: existingContent,
        });

        appliedMutations.push({
          targetKind: mutation.targetKind,
          normalizedAbsolutePath: mutation.normalizedAbsolutePath,
          normalizedRelativePath: mutation.normalizedRelativePath,
          summary: mutation.summary,
          fileHash: hashContent(nextContent),
          ...(mutation.skillName ? { skillName: mutation.skillName } : {}),
        });
      }

      let rollbackSnapshotPath: string | null = null;
      if (rollbackEntries.length > 0) {
        const agentRollbackDir = path.join(
          rollbackSnapshotRoot,
          sanitizeFileToken(agentId),
        );
        await mkdir(agentRollbackDir, { recursive: true });
        rollbackSnapshotPath = path.join(
          agentRollbackDir,
          `${sanitizeFileToken(runId)}.json`,
        );

        await writeFile(
          rollbackSnapshotPath,
          JSON.stringify(
            {
              agentId,
              runId,
              sessionKey,
              sourceEventId,
              createdAt: new Date().toISOString(),
              entries: rollbackEntries,
            },
            null,
            2,
          ),
          "utf8",
        );
      }

      return {
        appliedMutations,
        rollbackSnapshotPath,
      };
    },
    async rollbackFromSnapshot({ rollbackSnapshotPath }) {
      const snapshotRaw = await readFile(rollbackSnapshotPath, "utf8");
      let parsedSnapshot: unknown;
      try {
        parsedSnapshot = JSON.parse(snapshotRaw);
      } catch (error) {
        throw new Error(
          `Failed to parse rollback snapshot at ${rollbackSnapshotPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const rollbackEntries = parseRollbackSnapshotEntries(parsedSnapshot);
      for (const entry of [...rollbackEntries].reverse()) {
        const absoluteTargetPath = path.resolve(cwdAbsolute, entry.normalizedRelativePath);
        if (!isPathWithinRoot(absoluteTargetPath, cwdAbsolute)) {
          throw new Error(
            `Rollback snapshot path escapes workspace: ${entry.normalizedRelativePath}`,
          );
        }

        if (entry.previousContent === null) {
          await rm(absoluteTargetPath, { force: true });
          continue;
        }

        await mkdir(path.dirname(absoluteTargetPath), { recursive: true });
        await writeFile(absoluteTargetPath, entry.previousContent, "utf8");
      }
    },
  };
}
