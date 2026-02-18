import path from "node:path";
import type { CompiledAgentCapabilities } from "../../agents/capability-compiler.js";
import type { CapabilitySkillId } from "../../agents/contracts.js";
import {
  readOptionalFile,
  readRequiredMarkdownFile,
  resolvePathFromCwd,
} from "../resources/fs-utils.js";
import { loadResourceContributions } from "../resources/registry.js";
import type { ResourceDocument } from "../resources/types.js";

type LoadedDocument = ResourceDocument;

export type ContextAssemblerAgent = Readonly<{
  id: string;
  name: string;
  description: string | null;
  capabilityProfile: CompiledAgentCapabilities;
  memoryPath: string | null;
}>;

export type AssembleTurnContextInput = Readonly<{
  cwd: string;
  sharedRoot: string;
  prompt: string;
  agent: ContextAssemblerAgent;
}>;

export type AssembledTurnContext = Readonly<{
  normalizedPrompt: string;
  systemPrompt: string;
}>;

function normalizeUserPrompt(
  prompt: string,
  capabilityProfile: CompiledAgentCapabilities,
): string {
  const normalized = prompt.trim();
  if (normalized.length > 0) {
    return normalized;
  }

  const hasDuckdb = capabilityProfile.requiredResources.some(
    (resource) => resource.kind === "duckdb",
  );
  if (hasDuckdb) {
    return "No question was provided. Ask for clarification and suggest example DuckDB business questions.";
  }

  return "No question was provided. Ask for clarification and suggest next steps based on available capabilities/resources.";
}

async function loadDeclaredSharedSkillDocs(input: {
  cwd: string;
  sharedRoot: string;
  skillIds: readonly CapabilitySkillId[];
}): Promise<LoadedDocument[]> {
  const uniqueSharedSkills = Array.from(new Set(input.skillIds)).sort();

  const sharedSkillsDir = path.join(
    resolvePathFromCwd(input.cwd, input.sharedRoot),
    "skills",
  );

  return Promise.all(
    uniqueSharedSkills.map((skillId) => {
      const sharedSkillFilePath = path.join(sharedSkillsDir, `${skillId}.md`);
      return readRequiredMarkdownFile(sharedSkillFilePath);
    }),
  );
}

function formatLoadedDocuments(
  heading: string,
  documents: LoadedDocument[],
): string {
  if (documents.length === 0) {
    return `${heading}\n(none loaded)`;
  }

  const sections = documents.map((document) => {
    return [
      `File: ${document.filePath}`,
      "```markdown",
      document.content,
      "```",
    ].join("\n");
  });

  return [heading, ...sections].join("\n\n");
}

function buildSystemPrompt(input: {
  agent: ContextAssemblerAgent;
  sharedSkillDocs: LoadedDocument[];
  resourceDocs: LoadedDocument[];
  resourceContextDocs: LoadedDocument[];
  memoryContent: string | null;
  capabilityGuidance: readonly string[];
  resourceGuidance: readonly string[];
  hasDuckdbResource: boolean;
}): string {
  const description = input.agent.description ?? "No description provided.";
  const memoryBlock =
    input.memoryContent ??
    "No prior memory is recorded yet for this agent.";

  const operatingExpectations = [
    "- Answer directly in plain business language.",
    "- Show supporting metrics and call out assumptions or caveats.",
    "- Keep responses concise and Slack-readable.",
    "- Do not invent table or column names; inspect available docs when unsure.",
    ...(input.hasDuckdbResource
      ? ["- Use DuckDB for factual claims when a query is needed."]
      : []),
  ];

  const resourceContextHeading = input.hasDuckdbResource
    ? "dbt schema/docs context loaded this turn:"
    : "Resource-specific schema/docs context loaded this turn:";

  return [
    `You are ${input.agent.name} (${input.agent.id}).`,
    description,
    "",
    "Operating expectations:",
    ...operatingExpectations,
    "",
    "Active capabilities:",
    ...input.capabilityGuidance,
    "",
    "Resource guidance:",
    ...input.resourceGuidance,
    "",
    "Agent memory:",
    "```markdown",
    memoryBlock,
    "```",
    "",
    formatLoadedDocuments("Shared skills loaded this turn:", input.sharedSkillDocs),
    "",
    formatLoadedDocuments(
      "Shared resource docs loaded this turn:",
      input.resourceDocs,
    ),
    "",
    formatLoadedDocuments(
      resourceContextHeading,
      input.resourceContextDocs,
    ),
  ].join("\n");
}

export async function assembleTurnContext(
  input: AssembleTurnContextInput,
): Promise<AssembledTurnContext> {
  const normalizedPrompt = normalizeUserPrompt(
    input.prompt,
    input.agent.capabilityProfile,
  );

  const agentMemoryFilePath = input.agent.memoryPath
    ? path.join(resolvePathFromCwd(input.cwd, input.agent.memoryPath), "MEMORY.md")
    : null;

  const [sharedSkillDocs, resourceContributions] = await Promise.all([
    loadDeclaredSharedSkillDocs({
      cwd: input.cwd,
      sharedRoot: input.sharedRoot,
      skillIds: input.agent.capabilityProfile.requiredSkillIds,
    }),
    loadResourceContributions({
      resources: input.agent.capabilityProfile.requiredResources,
      cwd: input.cwd,
      sharedRoot: input.sharedRoot,
    }),
  ]);

  const rawResourceGuidance = resourceContributions.flatMap(
    (contribution) => contribution.guidance,
  );
  const resourceGuidance =
    rawResourceGuidance.length > 0
      ? rawResourceGuidance
      : [
          "- No external resources configured; rely on loaded skills, memory, and conversation context.",
        ];
  const capabilityGuidance =
    input.agent.capabilityProfile.capabilityGuidance.length > 0
      ? input.agent.capabilityProfile.capabilityGuidance
      : ["- No capabilities configured."];
  const resourceDocs = resourceContributions.flatMap(
    (contribution) => contribution.sharedDocs,
  );
  const resourceContextDocs = resourceContributions.flatMap(
    (contribution) => contribution.contextDocs,
  );
  const hasDuckdbResource = resourceContributions.some(
    (contribution) => contribution.resourceKind === "duckdb",
  );

  const memoryContent = agentMemoryFilePath
    ? await readOptionalFile(agentMemoryFilePath)
    : null;

  const systemPrompt = buildSystemPrompt({
    agent: input.agent,
    sharedSkillDocs,
    resourceDocs,
    resourceContextDocs,
    memoryContent,
    capabilityGuidance,
    resourceGuidance,
    hasDuckdbResource,
  });

  return {
    normalizedPrompt,
    systemPrompt,
  };
}
