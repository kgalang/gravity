import { mkdir } from "node:fs/promises";
import path from "node:path";
import { agentRegistry } from "../../agents/index.js";
import type { CompiledAgentCapabilities } from "../../agents/capability-compiler.js";
import {
  assembleTurnContext,
  type ContextAssemblerAgent,
} from "./context-assembler.js";
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
import { gravitySchema, type GravityDatabase } from "./db.js";
import type {
  ExecutorManager,
  ExecutorRuntime,
} from "./executor-manager.js";

const DEFAULT_ANTHROPIC_MODEL_ID = "claude-sonnet-4-5";

type AgentRuntimeRecord = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  skills_path: string | null;
  memory_path: string | null;
  compiledCapabilities: CompiledAgentCapabilities;
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

function loadCodeDefinedAgentDetails(agentId: string): {
  name: string;
  description: string | null;
  model: string;
  compiledCapabilities: CompiledAgentCapabilities;
} {
  const registered = agentRegistry.agentsById.get(agentId);
  if (!registered) {
    throw new Error(`Agent declaration not found for id: ${agentId}`);
  }

  return {
    name: registered.declaration.name,
    description: registered.declaration.description ?? null,
    model: registered.model,
    compiledCapabilities: registered.compiledCapabilities,
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
      "skills_path",
      "memory_path",
    ])
    .where("id", "=", agentId)
    .where("status", "=", "active")
    .executeTakeFirst();

  if (!row) {
    throw new Error(`Active agent not found for id: ${agentId}`);
  }

  const declaration = loadCodeDefinedAgentDetails(agentId);

  return {
    id: row.id,
    name: declaration.name,
    description: declaration.description,
    model: declaration.model,
    skills_path: row.skills_path,
    memory_path: row.memory_path,
    compiledCapabilities: declaration.compiledCapabilities,
  };
}

function toAssemblerAgent(record: AgentRuntimeRecord): ContextAssemblerAgent {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    capabilityProfile: record.compiledCapabilities,
    skillsPath: asStringOrNull(record.skills_path),
    memoryPath: asStringOrNull(record.memory_path),
  };
}

function createSessionContextPath(agentId: string, sessionKey: string): string {
  const workspaceRoot = resolvePathFromRepoRoot(
    agentRegistry.config.paths.workspaceRoot,
  );
  return path.join(
    workspaceRoot,
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
  const assembledContext = await assembleTurnContext({
    cwd: process.cwd(),
    sharedRoot: agentRegistry.config.paths.sharedRoot,
    prompt: input.prompt,
    agent: toAssemblerAgent(agent),
  });

  const resourceLoader = createStaticResourceLoader(assembledContext.systemPrompt);
  const authStorage = new AuthStorage(
    path.join(process.cwd(), ".pi", "gravity", "auth.json"),
  );
  authStorage.setRuntimeApiKey("anthropic", input.anthropicApiKey);

  const modelRegistry = new ModelRegistry(authStorage);
  const model = resolveAnthropicModelId(agent.model);
  const executor = input.executorManager.resolve(input.agentRuntime);
  const allowedToolPrimitives = agent.compiledCapabilities.toolPrimitives;
  if (allowedToolPrimitives.length === 0) {
    throw new Error(
      `Agent ${agent.id} has no granted tool primitives from capabilities.`,
    );
  }
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
    tools: executor.createTools(process.cwd(), allowedToolPrimitives),
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

  await session.prompt(assembledContext.normalizedPrompt);

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
