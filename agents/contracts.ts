import {
  capabilityCatalog,
  type CapabilityId,
  type CapabilitySkillId,
} from "./capability-catalog.js";
import type { ResourceKind } from "./resource-kinds.js";

export type SessionMode = "thread" | "main" | "isolated";
export type AgentRuntime = "host" | "sandbox";
export type IngressEntrypoint =
  | "slash_command"
  | "app_mention"
  | "thread_reply"
  | "direct_message";

export type SlackDeliveryTargetInput =
  | {
      surface: "slack";
      mode: "channel_thread";
      channelId: string;
    }
  | {
      surface: "slack";
      mode: "dm";
      userId: string;
    };

export type SlackDeliveryTarget = Readonly<SlackDeliveryTargetInput>;

export type QuietHoursInput = {
  enabled?: boolean;
  timezone: string;
  startHour: number;
  endHour: number;
  daysOfWeek?: readonly number[];
};

export type QuietHours = Readonly<{
  enabled: boolean;
  timezone: string;
  startHour: number;
  endHour: number;
  daysOfWeek?: readonly number[];
}>;

export type FrameworkConfigInput = {
  infra: {
    database: {
      urlEnvVar: string;
    };
    slack: {
      appTokenEnvVar: string;
      botTokenEnvVar: string;
    };
    modelProvider: {
      provider: "anthropic";
      apiKeyEnvVar: string;
    };
  };
  defaults: {
    model: string;
    runtime: AgentRuntime;
    sessionMode: SessionMode;
    quietHours?: QuietHoursInput;
  };
  paths: {
    sharedRoot: string;
    workspaceRoot: string;
  };
};

export type FrameworkConfig = Readonly<{
  infra: Readonly<{
    database: Readonly<{
      urlEnvVar: string;
    }>;
    slack: Readonly<{
      appTokenEnvVar: string;
      botTokenEnvVar: string;
    }>;
    modelProvider: Readonly<{
      provider: "anthropic";
      apiKeyEnvVar: string;
    }>;
  }>;
  defaults: Readonly<{
    model: string;
    runtime: AgentRuntime;
    sessionMode: SessionMode;
    quietHours?: QuietHours;
  }>;
  paths: Readonly<{
    sharedRoot: string;
    workspaceRoot: string;
  }>;
}>;

export type IngressMatchInput = {
  command?: string;
  channelId?: string;
  userId?: string;
  isDirectMessage?: boolean;
  threadOwnedByAgent?: boolean;
};

export type IngressMatch = Readonly<{
  command?: string;
  channelId?: string;
  userId?: string;
  isDirectMessage?: boolean;
  threadOwnedByAgent?: boolean;
}>;

export type AgentListenerInput = {
  id: string;
  kind: "message";
  surface: "slack";
  entrypoint: IngressEntrypoint;
  sessionMode?: SessionMode;
  enabled?: boolean;
  match?: IngressMatchInput;
};

export type AgentListener = Readonly<{
  id: string;
  kind: "message";
  surface: "slack";
  entrypoint: IngressEntrypoint;
  sessionMode: SessionMode;
  enabled: boolean;
  match?: IngressMatch;
}>;

type CronTriggerInput = {
  id: string;
  kind: "cron";
  schedule: string;
  prompt: string;
  sessionMode?: SessionMode;
  delivery?: SlackDeliveryTargetInput;
  enabled?: boolean;
};

type HeartbeatTriggerInput = {
  id: string;
  kind: "heartbeat";
  intervalSeconds: number;
  prompt: string;
  sessionMode?: SessionMode;
  delivery?: SlackDeliveryTargetInput;
  enabled?: boolean;
};

export type AgentProactiveTriggerInput = CronTriggerInput | HeartbeatTriggerInput;

type CronTrigger = Readonly<{
  id: string;
  kind: "cron";
  schedule: string;
  prompt: string;
  sessionMode?: SessionMode;
  delivery?: SlackDeliveryTarget;
  enabled: boolean;
}>;

type HeartbeatTrigger = Readonly<{
  id: string;
  kind: "heartbeat";
  intervalSeconds: number;
  prompt: string;
  sessionMode?: SessionMode;
  delivery?: SlackDeliveryTarget;
  enabled: boolean;
}>;

export type AgentProactiveTrigger = CronTrigger | HeartbeatTrigger;

export type AgentProactiveInput = {
  deliveryDefaults?: SlackDeliveryTargetInput;
  triggers: readonly AgentProactiveTriggerInput[];
};

export type AgentProactive = Readonly<{
  deliveryDefaults?: SlackDeliveryTarget;
  triggers: readonly AgentProactiveTrigger[];
}>;

export type DuckdbResourceInput = {
  id: string;
  kind: "duckdb";
  path: string;
};

export type KnowledgeDocsResourceInput = {
  id: string;
  kind: "knowledge-docs";
};

export type AgentResourceInput = DuckdbResourceInput | KnowledgeDocsResourceInput;

export type DuckdbResource = Readonly<{
  id: string;
  kind: "duckdb";
  path: string;
}>;

export type KnowledgeDocsResource = Readonly<{
  id: string;
  kind: "knowledge-docs";
}>;

export type AgentResource = DuckdbResource | KnowledgeDocsResource;
export type AgentResourceKind = ResourceKind;

type CapabilitySlotMap<TCapabilityId extends CapabilityId> =
  (typeof capabilityCatalog)[TCapabilityId]["resourceSlots"];

type CapabilitySlotId<TCapabilityId extends CapabilityId> =
  keyof CapabilitySlotMap<TCapabilityId> & string;

type CapabilityBindShape<
  TCapabilityId extends CapabilityId,
  TResourceId extends string,
> = CapabilitySlotId<TCapabilityId> extends never
  ? Readonly<{
      bindResources?: Readonly<Record<string, never>>;
    }>
  : Readonly<{
      bindResources: Readonly<Record<CapabilitySlotId<TCapabilityId>, TResourceId>>;
    }>;

type CapabilityBindingFor<
  TCapabilityId extends CapabilityId,
  TResourceId extends string,
> = Readonly<{
  capability: TCapabilityId;
}> &
  CapabilityBindShape<TCapabilityId, TResourceId>;

export type AgentCapabilityBindingInput<TResourceId extends string = string> = {
  [TCapabilityId in CapabilityId]: CapabilityBindingFor<
    TCapabilityId,
    TResourceId
  >;
}[CapabilityId];

export type AgentCapabilityBinding = Readonly<{
  capability: CapabilityId;
  bindResources: Readonly<Record<string, string>>;
}>;

type NonEmptyArray<T> = readonly [T, ...T[]];

type ResourceIdUnion<TResources extends readonly AgentResourceInput[]> =
  TResources[number]["id"];

type ResourceKindForId<
  TResources extends readonly AgentResourceInput[],
  TResourceId extends ResourceIdUnion<TResources>,
> = Extract<TResources[number], { id: TResourceId }>["kind"];

type NormalizeResources<
  TResources extends readonly AgentResourceInput[] | undefined,
> = TResources extends readonly AgentResourceInput[] ? TResources : readonly [];

type CapabilityBindingKindErrors<
  TResources extends readonly AgentResourceInput[],
  TBinding extends AgentCapabilityBindingInput<ResourceIdUnion<TResources>>,
> = CapabilitySlotId<TBinding["capability"]> extends never
  ? never
  : {
      [Slot in CapabilitySlotId<TBinding["capability"]>]: TBinding extends {
        bindResources: Record<Slot, infer TResourceId>;
      }
        ? TResourceId extends ResourceIdUnion<TResources>
          ? ResourceKindForId<TResources, TResourceId> extends CapabilitySlotMap<
              TBinding["capability"]
            >[Slot]
            ? never
            : `Capability "${TBinding["capability"]}" slot "${Slot}" requires resource kind "${CapabilitySlotMap<
                TBinding["capability"]
              >[Slot] & string}"`
          : never
        : `Capability "${TBinding["capability"]}" missing required binding for slot "${Slot}"`;
    }[CapabilitySlotId<TBinding["capability"]>];

type CapabilityBindingErrors<
  TResources extends readonly AgentResourceInput[],
  TCapabilities extends readonly AgentCapabilityBindingInput<
    ResourceIdUnion<TResources>
  >[],
> = {
  [Index in keyof TCapabilities]: TCapabilities[Index] extends AgentCapabilityBindingInput<
    ResourceIdUnion<TResources>
  >
    ? CapabilityBindingKindErrors<TResources, TCapabilities[Index]>
    : never;
}[number];

type CompileTimeCapabilityBindingGuard<
  TResources extends readonly AgentResourceInput[],
  TCapabilities extends readonly AgentCapabilityBindingInput<
    ResourceIdUnion<TResources>
  >[],
> = CapabilityBindingErrors<TResources, TCapabilities> extends never
  ? {}
  : {
      __compileTimeCapabilityBindingError__: CapabilityBindingErrors<
        TResources,
        TCapabilities
      >;
    };

export type AgentDefinitionInput<
  TResources extends readonly AgentResourceInput[] | undefined = undefined,
  TCapabilities extends NonEmptyArray<
    AgentCapabilityBindingInput<ResourceIdUnion<NormalizeResources<TResources>>>
  > = NonEmptyArray<
    AgentCapabilityBindingInput<ResourceIdUnion<NormalizeResources<TResources>>>
  >,
> = {
  id: string;
  name: string;
  listen: NonEmptyArray<AgentListenerInput>;
  useCapabilities: TCapabilities;
  description?: string;
  model?: string;
  proactive?: AgentProactiveInput;
  resources?: TResources;
  runtime?: AgentRuntime;
  quietHours?: QuietHoursInput;
  session?: {
    defaultMode?: SessionMode;
  };
};

export type AgentDefinition = Readonly<{
  id: string;
  name: string;
  listen: readonly AgentListener[];
  useCapabilities: readonly AgentCapabilityBinding[];
  description?: string;
  model?: string;
  proactive?: AgentProactive;
  resources?: readonly AgentResource[];
  runtime?: AgentRuntime;
  quietHours?: QuietHours;
  session?: Readonly<{
    defaultMode?: SessionMode;
  }>;
}>;

export type { CapabilityId, CapabilitySkillId };

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    return Object.freeze(value);
  }

  return value;
}

function normalizeRequiredString(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return trimmed;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeRequiredString(value, "optional string");
}

function normalizeSessionMode(value: SessionMode, label: string): SessionMode {
  if (value === "thread" || value === "main" || value === "isolated") {
    return value;
  }
  throw new Error(`${label} must be one of: thread, main, isolated`);
}

function defaultSessionModeForEntrypoint(entrypoint: IngressEntrypoint): SessionMode {
  return entrypoint === "direct_message" ? "main" : "thread";
}

function normalizeIngressMatch(
  match: IngressMatchInput | undefined,
  entrypoint: IngressEntrypoint,
  label: string,
): IngressMatch | undefined {
  if (!match) {
    if (entrypoint === "slash_command") {
      throw new Error(`${label} requires match.command`);
    }
    return undefined;
  }

  const normalized: IngressMatchInput = {};
  if (match.command !== undefined) {
    const command = normalizeRequiredString(match.command, `${label}.command`)
      .toLowerCase()
      .replaceAll(/\s+/g, "");
    if (!command.startsWith("/")) {
      throw new Error(`${label}.command must start with "/"`);
    }
    normalized.command = command;
  }
  if (match.channelId !== undefined) {
    normalized.channelId = normalizeRequiredString(
      match.channelId,
      `${label}.channelId`,
    );
  }
  if (match.userId !== undefined) {
    normalized.userId = normalizeRequiredString(match.userId, `${label}.userId`);
  }
  if (match.isDirectMessage !== undefined) {
    normalized.isDirectMessage = Boolean(match.isDirectMessage);
  }
  if (match.threadOwnedByAgent !== undefined) {
    normalized.threadOwnedByAgent = Boolean(match.threadOwnedByAgent);
  }

  if (entrypoint === "slash_command" && !normalized.command) {
    throw new Error(`${label} requires match.command`);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeDeliveryTarget(
  delivery: SlackDeliveryTargetInput,
  label: string,
): SlackDeliveryTarget {
  if (delivery.mode === "channel_thread") {
    return {
      surface: "slack",
      mode: "channel_thread",
      channelId: normalizeRequiredString(delivery.channelId, `${label}.channelId`),
    };
  }

  return {
    surface: "slack",
    mode: "dm",
    userId: normalizeRequiredString(delivery.userId, `${label}.userId`),
  };
}

function normalizeQuietHours(value: QuietHoursInput, label: string): QuietHours {
  const startHour = Math.floor(value.startHour);
  const endHour = Math.floor(value.endHour);

  if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
    throw new Error(`${label} startHour/endHour must be in [0, 23]`);
  }

  const daysOfWeek = value.daysOfWeek
    ? Array.from(new Set(value.daysOfWeek.map((day) => Math.floor(day))))
    : undefined;

  if (
    daysOfWeek &&
    daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new Error(`${label}.daysOfWeek values must be in [0, 6]`);
  }

  return {
    enabled: value.enabled ?? true,
    timezone: normalizeRequiredString(value.timezone, `${label}.timezone`),
    startHour,
    endHour,
    ...(daysOfWeek ? { daysOfWeek } : {}),
  };
}

function normalizeResource(
  resource: AgentResourceInput,
  label: string,
): AgentResource {
  if (resource.kind === "duckdb") {
    return {
      id: normalizeRequiredString(resource.id, `${label}.id`),
      kind: "duckdb",
      path: normalizeRequiredString(resource.path, `${label}.path`),
    };
  }

  if (resource.kind === "knowledge-docs") {
    return {
      id: normalizeRequiredString(resource.id, `${label}.id`),
      kind: "knowledge-docs",
    };
  }

  throw new Error(`${label}.kind must be one of: duckdb, knowledge-docs`);
}

function normalizeResources(
  values: readonly AgentResourceInput[] | undefined,
  label: string,
): readonly AgentResource[] | undefined {
  if (!values) {
    return undefined;
  }

  const normalized: AgentResource[] = [];
  const seenIds = new Set<string>();

  for (const [index, resource] of values.entries()) {
    const entryLabel = `${label}[${index}]`;
    const normalizedResource = normalizeResource(resource, entryLabel);

    if (seenIds.has(normalizedResource.id)) {
      throw new Error(
        `${entryLabel} duplicates resource id "${normalizedResource.id}"`,
      );
    }

    seenIds.add(normalizedResource.id);
    normalized.push(normalizedResource);
  }

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeCapabilityBinding(
  inputBinding: AgentCapabilityBindingInput<string>,
  label: string,
  resourceKindsById: ReadonlyMap<string, AgentResourceKind>,
): AgentCapabilityBinding {
  const capabilityId = inputBinding.capability;
  const definition = capabilityCatalog[capabilityId];
  if (!definition) {
    const validCapabilities = Object.keys(capabilityCatalog).sort().join(", ");
    throw new Error(`${label}.capability must be one of: ${validCapabilities}`);
  }

  const bindInput: Readonly<Record<string, string | undefined>> =
    "bindResources" in inputBinding && inputBinding.bindResources
      ? inputBinding.bindResources
      : {};
  const expectedSlotEntries = Object.entries(definition.resourceSlots).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const normalizedBind: Record<string, string> = {};

  for (const [slot, expectedKind] of expectedSlotEntries) {
    const rawResourceId = bindInput[slot];
    if (rawResourceId === undefined) {
      throw new Error(
        `${label}.bindResources is missing required slot "${slot}" for capability "${capabilityId}"`,
      );
    }

    const resourceId = normalizeRequiredString(
      rawResourceId,
      `${label}.bindResources.${slot}`,
    );
    const actualKind = resourceKindsById.get(resourceId);
    if (!actualKind) {
      throw new Error(
        `${label}.bindResources.${slot} references unknown resource id "${resourceId}"`,
      );
    }
    if (actualKind !== expectedKind) {
      throw new Error(
        `${label}.bindResources.${slot} requires resource kind "${expectedKind}" but received "${actualKind}"`,
      );
    }

    normalizedBind[slot] = resourceId;
  }

  const expectedSlotSet = new Set(expectedSlotEntries.map(([slot]) => slot));
  for (const slot of Object.keys(bindInput)) {
    if (!expectedSlotSet.has(slot)) {
      throw new Error(
        `${label}.bindResources.${slot} is not a valid slot for capability "${capabilityId}"`,
      );
    }
  }

  return {
    capability: capabilityId,
    bindResources: normalizedBind,
  };
}

function normalizeCapabilities(
  values: readonly AgentCapabilityBindingInput<string>[],
  label: string,
  resources: readonly AgentResource[] | undefined,
): readonly AgentCapabilityBinding[] {
  if (values.length === 0) {
    throw new Error("agent must declare at least one capability");
  }

  const resourceKindsById = new Map<string, AgentResourceKind>();
  for (const resource of resources ?? []) {
    resourceKindsById.set(resource.id, resource.kind);
  }

  const normalized: AgentCapabilityBinding[] = [];
  const seenCapabilitySignatures = new Set<string>();

  for (const [index, capability] of values.entries()) {
    const entryLabel = `${label}[${index}]`;
    const normalizedBinding = normalizeCapabilityBinding(
      capability,
      entryLabel,
      resourceKindsById,
    );
    const signature = [
      normalizedBinding.capability,
      ...Object.entries(normalizedBinding.bindResources)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([slot, resourceId]) => `${slot}=${resourceId}`),
    ].join("|");

    if (seenCapabilitySignatures.has(signature)) {
      throw new Error(`${entryLabel} duplicates capability binding "${signature}"`);
    }

    seenCapabilitySignatures.add(signature);
    normalized.push(normalizedBinding);
  }

  return normalized;
}

function normalizeProactiveTrigger(
  trigger: AgentProactiveTriggerInput,
  label: string,
): AgentProactiveTrigger {
  const id = normalizeRequiredString(trigger.id, `${label}.id`);
  const prompt = normalizeRequiredString(trigger.prompt, `${label}.prompt`);
  const sessionMode =
    trigger.sessionMode !== undefined
      ? normalizeSessionMode(trigger.sessionMode, `${label}.sessionMode`)
      : undefined;
  const enabled = trigger.enabled ?? true;
  const delivery = trigger.delivery
    ? normalizeDeliveryTarget(trigger.delivery, `${label}.delivery`)
    : undefined;

  if (trigger.kind === "cron") {
    return {
      id,
      kind: "cron",
      schedule: normalizeRequiredString(trigger.schedule, `${label}.schedule`),
      prompt,
      enabled,
      ...(sessionMode ? { sessionMode } : {}),
      ...(delivery ? { delivery } : {}),
    };
  }

  const intervalSeconds = Math.floor(trigger.intervalSeconds);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 5) {
    throw new Error(`${label}.intervalSeconds must be a number >= 5`);
  }

  return {
    id,
    kind: "heartbeat",
    intervalSeconds,
    prompt,
    enabled,
    ...(sessionMode ? { sessionMode } : {}),
    ...(delivery ? { delivery } : {}),
  };
}

export function defineConfig(input: FrameworkConfigInput): FrameworkConfig {
  const config: FrameworkConfig = {
    infra: {
      database: {
        urlEnvVar: normalizeRequiredString(
          input.infra.database.urlEnvVar,
          "config.infra.database.urlEnvVar",
        ),
      },
      slack: {
        appTokenEnvVar: normalizeRequiredString(
          input.infra.slack.appTokenEnvVar,
          "config.infra.slack.appTokenEnvVar",
        ),
        botTokenEnvVar: normalizeRequiredString(
          input.infra.slack.botTokenEnvVar,
          "config.infra.slack.botTokenEnvVar",
        ),
      },
      modelProvider: {
        provider: input.infra.modelProvider.provider,
        apiKeyEnvVar: normalizeRequiredString(
          input.infra.modelProvider.apiKeyEnvVar,
          "config.infra.modelProvider.apiKeyEnvVar",
        ),
      },
    },
    defaults: {
      model: normalizeRequiredString(input.defaults.model, "config.defaults.model"),
      runtime: input.defaults.runtime,
      sessionMode: normalizeSessionMode(
        input.defaults.sessionMode,
        "config.defaults.sessionMode",
      ),
      ...(input.defaults.quietHours
        ? {
            quietHours: normalizeQuietHours(
              input.defaults.quietHours,
              "config.defaults.quietHours",
            ),
          }
        : {}),
    },
    paths: {
      sharedRoot: normalizeRequiredString(
        input.paths.sharedRoot,
        "config.paths.sharedRoot",
      ),
      workspaceRoot: normalizeRequiredString(
        input.paths.workspaceRoot,
        "config.paths.workspaceRoot",
      ),
    },
  };

  return deepFreeze(config);
}

export function defineAgent<
  const TResources extends readonly AgentResourceInput[] | undefined,
  const TCapabilities extends NonEmptyArray<
    AgentCapabilityBindingInput<ResourceIdUnion<NormalizeResources<TResources>>>
  >,
>(
  input: AgentDefinitionInput<TResources, TCapabilities> &
    CompileTimeCapabilityBindingGuard<NormalizeResources<TResources>, TCapabilities>,
): AgentDefinition {
  if (
    Object.prototype.hasOwnProperty.call(
      input as Record<string, unknown>,
      "duckdbPath",
    )
  ) {
    throw new Error(
      'agent.duckdbPath has been removed; use resources: [{ id: "warehouse", kind: "duckdb", path: "<path>" }]',
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input as Record<string, unknown>,
      "connectors",
    )
  ) {
    throw new Error(
      'agent.connectors has been renamed to resources: [{ id: "<id>", kind: "duckdb" | "knowledge-docs", ... }]',
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input as Record<string, unknown>,
      "capabilities",
    )
  ) {
    throw new Error(
      'agent.capabilities has been renamed to useCapabilities: [{ capability: "<capability-id>", bindResources?: { "<slot>": "<resource-id>" } }]',
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input as Record<string, unknown>,
      "tools",
    )
  ) {
      throw new Error(
      'agent.tools has been replaced by useCapabilities: [{ capability: "<capability-id>", bindResources?: { "<slot>": "<resource-id>" } }]',
      );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      input as Record<string, unknown>,
      "skills",
    )
  ) {
      throw new Error(
      'agent.skills has been replaced by useCapabilities: [{ capability: "<capability-id>", bindResources?: { "<slot>": "<resource-id>" } }]',
      );
  }

  const id = normalizeRequiredString(input.id, "agent.id");
  const name = normalizeRequiredString(input.name, "agent.name");
  const description = normalizeOptionalString(input.description);
  const model = normalizeOptionalString(input.model);
  const runtime = input.runtime;
  const quietHours = input.quietHours
    ? normalizeQuietHours(input.quietHours, `agent(${id}).quietHours`)
    : undefined;
  const resources = normalizeResources(input.resources, `agent(${id}).resources`);
  const useCapabilities = normalizeCapabilities(
    input.useCapabilities,
    `agent(${id}).useCapabilities`,
    resources,
  );

  const listeners = input.listen.map((listener, index) => {
    const listenerLabel = `agent(${id}).listen[${index}]`;
    const listenerId = normalizeRequiredString(listener.id, `${listenerLabel}.id`);
    const sessionMode = listener.sessionMode
      ? normalizeSessionMode(listener.sessionMode, `${listenerLabel}.sessionMode`)
      : defaultSessionModeForEntrypoint(listener.entrypoint);
    const match = normalizeIngressMatch(
      listener.match,
      listener.entrypoint,
      `${listenerLabel}.match`,
    );

    return {
      id: listenerId,
      kind: listener.kind,
      surface: listener.surface,
      entrypoint: listener.entrypoint,
      sessionMode,
      enabled: listener.enabled ?? true,
      ...(match ? { match } : {}),
    } satisfies AgentListener;
  });
  if (listeners.length === 0) {
    throw new Error(`agent(${id}) must declare at least one listener`);
  }

  const proactive = input.proactive
    ? {
        ...(input.proactive.deliveryDefaults
          ? {
              deliveryDefaults: normalizeDeliveryTarget(
                input.proactive.deliveryDefaults,
                `agent(${id}).proactive.deliveryDefaults`,
              ),
            }
          : {}),
        triggers: input.proactive.triggers.map((trigger, index) =>
          normalizeProactiveTrigger(trigger, `agent(${id}).proactive.triggers[${index}]`),
        ),
      }
    : undefined;

  const declaration: AgentDefinition = {
    id,
    name,
    listen: listeners,
    useCapabilities,
    ...(description ? { description } : {}),
    ...(model ? { model } : {}),
    ...(proactive ? { proactive } : {}),
    ...(resources ? { resources } : {}),
    ...(runtime ? { runtime } : {}),
    ...(quietHours ? { quietHours } : {}),
    ...(input.session
      ? {
          session: {
            ...(input.session.defaultMode
              ? {
                  defaultMode: normalizeSessionMode(
                    input.session.defaultMode,
                    `agent(${id}).session.defaultMode`,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };

  return deepFreeze(declaration);
}

export function resolveAgentModel(
  agent: AgentDefinition,
  config: FrameworkConfig,
): string {
  return agent.model ?? config.defaults.model;
}

export function resolveAgentRuntime(
  agent: AgentDefinition,
  config: FrameworkConfig,
): AgentRuntime {
  return agent.runtime ?? config.defaults.runtime;
}

export function resolveAgentSessionMode(
  agent: AgentDefinition,
  config: FrameworkConfig,
): SessionMode {
  return agent.session?.defaultMode ?? config.defaults.sessionMode;
}

export function resolveAgentQuietHours(
  agent: AgentDefinition,
  config: FrameworkConfig,
): QuietHours | undefined {
  return agent.quietHours ?? config.defaults.quietHours;
}
