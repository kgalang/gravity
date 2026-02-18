import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { type Api, getModels, type Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createExtensionRuntime,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
  type ResourceLoader,
} from "@mariozechner/pi-coding-agent";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Kysely } from "kysely";
import { parseAgentConfig, type AgentConfig } from "./agent-config.js";
import { gravitySchema, type GravityDatabase } from "./db.js";
import type {
  ExecutorManager,
  ExecutorRuntime,
} from "./executor-manager.js";

const DEFAULT_ANTHROPIC_MODEL_ID = "claude-opus-4-6";
const MAX_DBT_CONTEXT_FILES = 10;
const MAX_DBT_FILE_CHARS = 6000;

type AgentRuntimeRecord = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  skills_path: string | null;
  memory_path: string | null;
  config: AgentConfig;
};

type LoadedDocument = {
  filePath: string;
  content: string;
};

const AgentAssistantMessageSchema = Type.Object(
  {
    role: Type.Optional(Type.String()),
    content: Type.Optional(Type.Unknown()),
    errorMessage: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

type AgentAssistantMessage = Static<typeof AgentAssistantMessageSchema>;

export type RunPiAgentTurnInput = {
  db: Kysely<GravityDatabase>;
  agentId: string;
  agentRuntime: ExecutorRuntime;
  sessionKey: string;
  prompt: string;
  anthropicApiKey: string | null;
  executorManager: ExecutorManager;
};

export type RunPiAgentTurnResult = {
  responseText: string;
  modelId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAssistantMessage(value: unknown): AgentAssistantMessage | null {
  if (!Value.Check(AgentAssistantMessageSchema, value)) {
    return null;
  }

  return value;
}

function resolvePathFromRepoRoot(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  return path.resolve(process.cwd(), inputPath);
}

function normalizeUserPrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (normalized.length > 0) {
    return normalized;
  }

  return "No question was provided. Ask for clarification and suggest example DuckDB business questions.";
}

function resolveAnthropicModelId(preferredModelId: string): Model<Api> {
  const models = getModels("anthropic");
  if (models.length === 0) {
    throw new Error("No Anthropic models are available in pi-ai.");
  }

  const preferred = preferredModelId.trim();
  const exact = models.find((model) => model.id === preferred);
  if (exact) {
    return exact;
  }

  const defaultModel = models.find(
    (model) => model.id === DEFAULT_ANTHROPIC_MODEL_ID,
  );
  if (defaultModel) {
    return defaultModel;
  }

  return models[0];
}

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  const textParts: string[] = [];

  for (const part of content) {
    if (!isRecord(part)) {
      continue;
    }

    if (part.type === "text" && typeof part.text === "string") {
      const trimmed = part.text.trim();
      if (trimmed.length > 0) {
        textParts.push(trimmed);
      }
    }
  }

  return textParts.join("\n\n").trim();
}

async function readMarkdownFiles(dirPath: string): Promise<LoadedDocument[]> {
  try {
    const directoryEntries = await readdir(dirPath, { withFileTypes: true });
    const markdownFiles = directoryEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();

    const loadedFiles = await Promise.all(
      markdownFiles.map(async (fileName) => {
        const filePath = path.join(dirPath, fileName);
        const content = await readFile(filePath, "utf8");
        return {
          filePath,
          content: content.trim(),
        } satisfies LoadedDocument;
      }),
    );

    return loadedFiles.filter((document) => document.content.length > 0);
  } catch {
    return [];
  }
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function walkDbtMetadataFiles(modelsDir: string): Promise<string[]> {
  const discoveredFiles: string[] = [];
  const stack = [modelsDir];

  while (stack.length > 0) {
    const nextDir = stack.pop();
    if (!nextDir) {
      continue;
    }

    let entries: Array<{ isDirectory: () => boolean; isFile: () => boolean; name: string }>;
    try {
      const dirEntries = await readdir(nextDir, {
        withFileTypes: true,
        encoding: "utf8",
      });
      entries = dirEntries;
    } catch {
      continue;
    }

    const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sortedEntries) {
      const entryPath = path.join(nextDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (
        entry.name.endsWith(".yml") ||
        entry.name.endsWith(".yaml") ||
        entry.name.endsWith(".md")
      ) {
        discoveredFiles.push(entryPath);
      }
    }
  }

  discoveredFiles.sort();
  return discoveredFiles.slice(0, MAX_DBT_CONTEXT_FILES);
}

async function loadDbtContextFromDuckdbPath(
  duckdbPath: string | null,
): Promise<LoadedDocument[]> {
  if (!duckdbPath) {
    return [];
  }

  const projectRoot = path.dirname(duckdbPath);
  const modelsDir = path.join(projectRoot, "models");

  try {
    const modelsDirStats = await stat(modelsDir);
    if (!modelsDirStats.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const metadataFilePaths = await walkDbtMetadataFiles(modelsDir);
  const documents: LoadedDocument[] = [];

  for (const metadataFilePath of metadataFilePaths) {
    const content = await readOptionalFile(metadataFilePath);
    if (!content) {
      continue;
    }

    documents.push({
      filePath: metadataFilePath,
      content: content.slice(0, MAX_DBT_FILE_CHARS).trim(),
    });
  }

  return documents;
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
  agent: AgentRuntimeRecord;
  sharedSkills: LoadedDocument[];
  connectorDocs: LoadedDocument[];
  agentSkills: LoadedDocument[];
  memoryContent: string | null;
  dbtContextDocs: LoadedDocument[];
  duckdbPath: string | null;
}): string {
  const description = input.agent.description ?? "No description provided.";
  const memoryBlock =
    input.memoryContent ??
    "No prior memory is recorded yet for this agent.";
  const duckdbPathLine =
    input.duckdbPath ??
    "DuckDB path not configured in agent config. Ask for configuration before running queries.";

  return [
    `You are ${input.agent.name} (${input.agent.id}).`,
    description,
    "",
    "Operating expectations:",
    "- Answer directly in plain business language.",
    "- Use DuckDB for factual claims when a query is needed.",
    "- Show supporting metrics and call out assumptions or caveats.",
    "- Keep responses concise and Slack-readable.",
    "- Do not invent table or column names; inspect schema/docs when unsure.",
    "",
    "DuckDB execution contract:",
    `- Preferred command pattern: duckdb ${duckdbPathLine} -cmd \"<SQL>\"`,
    "- Use `bash` for SQL execution and `read` for inspecting files/docs.",
    "- If output is truncated, follow the truncation hint or rerun a narrower query.",
    "",
    "Agent memory:",
    "```markdown",
    memoryBlock,
    "```",
    "",
    formatLoadedDocuments("Shared skills loaded this turn:", input.sharedSkills),
    "",
    formatLoadedDocuments(
      "Shared connector docs loaded this turn:",
      input.connectorDocs,
    ),
    "",
    formatLoadedDocuments(
      "Agent-specific skills loaded this turn:",
      input.agentSkills,
    ),
    "",
    formatLoadedDocuments(
      "dbt schema/docs context loaded this turn:",
      input.dbtContextDocs,
    ),
  ].join("\n");
}

function createStaticResourceLoader(systemPrompt: string): ResourceLoader {
  const extensionRuntime = createExtensionRuntime();

  return {
    getExtensions: () => ({
      extensions: [],
      errors: [],
      runtime: extensionRuntime,
    }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [],
    getPathMetadata: () => new Map(),
    extendResources: () => {
      // no-op for CP4 static loader
    },
    reload: async () => undefined,
  };
}

async function loadAgentRuntimeRecord(
  db: Kysely<GravityDatabase>,
  agentId: string,
): Promise<AgentRuntimeRecord> {
  const row = await gravitySchema(db)
    .selectFrom("agents")
    .select([
      "id",
      "name",
      "description",
      "model",
      "skills_path",
      "memory_path",
      "config",
    ])
    .where("id", "=", agentId)
    .where("status", "=", "active")
    .executeTakeFirst();

  if (!row) {
    throw new Error(`Active agent not found for id: ${agentId}`);
  }

  return {
    ...row,
    config: parseAgentConfig(row.config, {
      warn: console.warn,
      context: `agentId=${row.id}`,
    }),
  };
}

function createSessionContextPath(agentId: string, sessionKey: string): string {
  return path.join(
    process.cwd(),
    "workspace",
    agentId,
    "sessions",
    sessionKey,
    "context.jsonl",
  );
}

function summarizeForRunLog(responseText: string): string {
  const normalized = responseText.replace(/\s+/g, " ").trim();
  if (normalized.length <= 280) {
    return normalized;
  }

  return `${normalized.slice(0, 277)}...`;
}

export async function runPiAgentTurn(
  input: RunPiAgentTurnInput,
): Promise<RunPiAgentTurnResult> {
  if (!input.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required to run Claude.");
  }

  const agent = await loadAgentRuntimeRecord(input.db, input.agentId);
  const normalizedPrompt = normalizeUserPrompt(input.prompt);
  const skillPath = asStringOrNull(agent.skills_path);
  const memoryPath = asStringOrNull(agent.memory_path);
  const connectorName = agent.config.connector ?? null;
  const duckdbPath = agent.config.duckdb_path ?? null;

  const sharedSkillsDir = resolvePathFromRepoRoot("store/shared/skills");
  const sharedConnectorsDir = resolvePathFromRepoRoot("store/shared/connectors");
  const agentSkillsDir = skillPath ? resolvePathFromRepoRoot(skillPath) : null;
  const agentMemoryFilePath = memoryPath
    ? path.join(resolvePathFromRepoRoot(memoryPath), "MEMORY.md")
    : null;

  const [sharedSkills, agentSkills, dbtContextDocs] = await Promise.all([
    readMarkdownFiles(sharedSkillsDir),
    agentSkillsDir ? readMarkdownFiles(agentSkillsDir) : Promise.resolve([]),
    loadDbtContextFromDuckdbPath(duckdbPath),
  ]);

  const connectorDocs = connectorName
    ? await readMarkdownFiles(sharedConnectorsDir).then((documents) =>
        documents.filter((document) =>
          path.basename(document.filePath).startsWith(connectorName),
        ),
      )
    : [];

  const memoryContent = agentMemoryFilePath
    ? await readOptionalFile(agentMemoryFilePath)
    : null;

  const systemPrompt = buildSystemPrompt({
    agent,
    sharedSkills,
    connectorDocs,
    agentSkills,
    memoryContent,
    dbtContextDocs,
    duckdbPath,
  });

  const resourceLoader = createStaticResourceLoader(systemPrompt);
  const authStorage = new AuthStorage(
    path.join(process.cwd(), ".pi", "gravity", "auth.json"),
  );
  authStorage.setRuntimeApiKey("anthropic", input.anthropicApiKey);

  const modelRegistry = new ModelRegistry(authStorage);
  const model = resolveAnthropicModelId(agent.model);
  const executor = input.executorManager.resolve(input.agentRuntime);
  const sessionContextPath = createSessionContextPath(input.agentId, input.sessionKey);
  const sessionDir = path.dirname(sessionContextPath);
  await mkdir(sessionDir, { recursive: true });

  const sessionManager = SessionManager.open(sessionContextPath, sessionDir);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 2 },
  });

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: "high",
    tools: executor.createTools(process.cwd()),
    resourceLoader,
    sessionManager,
    settingsManager,
  });

  const assistantResponses: string[] = [];
  let sessionErrorMessage: string | null = null;

  session.subscribe((event: AgentSessionEvent) => {
    if (event.type !== "message_end") {
      return;
    }

    const candidateMessage = parseAssistantMessage(event.message);
    if (!candidateMessage || candidateMessage.role !== "assistant") {
      return;
    }

    const responseText = extractAssistantText(candidateMessage.content);
    if (responseText.length > 0) {
      assistantResponses.push(responseText);
    }

    if (typeof candidateMessage.errorMessage === "string") {
      sessionErrorMessage = candidateMessage.errorMessage;
    }
  });

  await session.prompt(normalizedPrompt);

  if (sessionErrorMessage) {
    throw new Error(sessionErrorMessage);
  }

  const responseText =
    assistantResponses.at(-1) ??
    "I could not produce a response. Please retry the question.";

  return {
    responseText,
    modelId: model.id,
  };
}

export function summarizeAgentResponseForRunLog(responseText: string): string {
  return summarizeForRunLog(responseText);
}
