import { createHash } from "node:crypto";
import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import type { SlackThreadHistoryMessage } from "./slack-thread-history.js";

export type SlackSurface = "app_mention" | "message";
export type SlackCommandSurface = "slash_command";
export type SlackSlashCommandAckResponse = {
  response_type: "in_channel" | "ephemeral";
  text: string;
};

export type InboundSlackMessage = {
  surface: SlackSurface;
  sourceEventId: string;
  channelId: string;
  threadTs: string;
  messageTs: string;
  userId: string;
  text: string;
  isDirectMessage: boolean;
};

export type InboundSlackSlashCommand = {
  surface: SlackCommandSurface;
  sourceEventId: string;
  command: string;
  text: string;
  channelId: string;
  userId: string;
  triggerId: string | null;
};

export type { SlackThreadHistoryMessage } from "./slack-thread-history.js";

type QueuedWork = () => Promise<void>;

const SocketEnvelopeSchema = Type.Object(
  {
    event: Type.Optional(Type.Unknown()),
    ack: Type.Optional(Type.Unknown()),
    body: Type.Optional(Type.Unknown()),
    envelope_id: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

const SlackAppMentionEventSchema = Type.Object(
  {
    channel: Type.Optional(Type.String()),
    user: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    ts: Type.Optional(Type.String()),
    thread_ts: Type.Optional(Type.String()),
    client_msg_id: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

const SlackMessageEventSchema = Type.Object(
  {
    channel: Type.Optional(Type.String()),
    user: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    ts: Type.Optional(Type.String()),
    thread_ts: Type.Optional(Type.String()),
    channel_type: Type.Optional(Type.String()),
    subtype: Type.Optional(Type.String()),
    bot_id: Type.Optional(Type.String()),
    client_msg_id: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

const SlackSlashCommandBodySchema = Type.Object(
  {
    command: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    channel_id: Type.Optional(Type.String()),
    user_id: Type.Optional(Type.String()),
    trigger_id: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

type SocketEnvelope = Static<typeof SocketEnvelopeSchema>;
type SlackAppMentionEvent = Static<typeof SlackAppMentionEventSchema>;
type SlackMessageEvent = Static<typeof SlackMessageEventSchema>;
type SlackSlashCommandBody = Static<typeof SlackSlashCommandBodySchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeSlashCommand(command: string): string {
  return command.trim().toLowerCase();
}

function parseSocketEnvelope(value: unknown): SocketEnvelope | null {
  if (!Value.Check(SocketEnvelopeSchema, value)) {
    return null;
  }

  return value;
}

function extractSocketEvent<Schema extends TSchema>(payload: {
  event?: unknown;
  body?: unknown;
}, schema: Schema): Static<Schema> | null {
  if (Value.Check(schema, payload.event)) {
    return payload.event;
  }

  if (!isRecord(payload.body)) {
    return null;
  }

  const nestedEvent = payload.body.event;
  if (Value.Check(schema, nestedEvent)) {
    return nestedEvent;
  }

  if (Value.Check(schema, payload.body)) {
    return payload.body;
  }

  return null;
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

export type SocketModeClientLike = {
  on(
    eventName: "app_mention" | "message" | "slash_commands",
    handler: (payload: unknown) => void | Promise<void>,
  ): void;
  start(): Promise<void>;
  disconnect?: () => Promise<void>;
};

export type WebClientLike = {
  auth: {
    test: () => Promise<{ user_id?: string | null }>;
  };
  chat: {
    postMessage: (args: {
      channel: string;
      text: string;
      thread_ts?: string;
    }) => Promise<{ ts?: string }>;
  };
  conversations: {
    open: (args: { users: string }) => Promise<{ channel?: { id?: string } }>;
    replies?: (args: {
      channel: string;
      ts: string;
      oldest?: string;
      inclusive?: boolean;
      limit?: number;
      cursor?: string;
    }) => Promise<{
      messages?: Array<{
        user?: string;
        bot_id?: string;
        text?: string;
        ts?: string;
        subtype?: string;
      }>;
      response_metadata?: {
        next_cursor?: string;
      };
    }>;
  };
};

export type SlackTransportConfig = {
  appToken: string;
  botToken: string;
  onInboundMessage?: (message: InboundSlackMessage) => Promise<void> | void;
  onInboundSlashCommand?: (
    command: InboundSlackSlashCommand,
  ) => Promise<void> | void;
  onSlashCommandAcknowledge?: (
    command: InboundSlackSlashCommand,
  ) => SlackSlashCommandAckResponse | null;
  enableMessageEvents?: boolean;
  log?: (line: string) => void;
  socketClient?: SocketModeClientLike;
  webClient?: WebClientLike;
};

class ChannelQueue {
  private queue: QueuedWork[] = [];
  private processing = false;

  enqueue(work: QueuedWork): void {
    this.queue.push(work);
    void this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const work = this.queue.shift();

    if (!work) {
      this.processing = false;
      return;
    }

    try {
      await work();
    } finally {
      this.processing = false;
      void this.processNext();
    }
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

export function stripSlackMentions(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/gi, "").trim();
}

export function buildSourceEventId(input: {
  channelId: string;
  messageTs: string;
  userId: string;
  clientMessageId?: string;
}): string {
  if (input.clientMessageId) {
    return input.clientMessageId;
  }

  return `${input.channelId}:${input.messageTs}:${input.userId}`;
}

function buildSlashFallbackSourceEventId(input: {
  command: string;
  channelId: string;
  userId: string;
  text: string;
}): string {
  const fingerprint = createHash("sha256")
    .update(input.command)
    .update("\0")
    .update(input.channelId)
    .update("\0")
    .update(input.userId)
    .update("\0")
    .update(input.text)
    .digest("hex")
    .slice(0, 32);

  return `slash:${fingerprint}`;
}

function createDefaultSocketModeClient(appToken: string): SocketModeClientLike {
  const client = new SocketModeClient({ appToken });
  return {
    on(eventName, handler) {
      client.on(eventName, (...args: unknown[]) => {
        const payload = args[0];
        return handler(payload);
      });
    },
    async start() {
      await client.start();
    },
    async disconnect() {
      await client.disconnect();
    },
  };
}

function createDefaultWebClient(botToken: string): WebClientLike {
  const client = new WebClient(botToken);
  return {
    auth: {
      async test() {
        const result = await client.auth.test({});
        return {
          user_id: typeof result.user_id === "string" ? result.user_id : null,
        };
      },
    },
    chat: {
      async postMessage(args) {
        const result = await client.chat.postMessage({
          channel: args.channel,
          text: args.text,
          thread_ts: args.thread_ts,
        });
        return { ts: result.ts };
      },
    },
    conversations: {
      async open(args) {
        const result = await client.conversations.open({
          users: args.users,
        });

        return {
          channel: {
            id: typeof result.channel?.id === "string" ? result.channel.id : undefined,
          },
        };
      },
      async replies(args) {
        const result = await client.conversations.replies({
          channel: args.channel,
          ts: args.ts,
          oldest: args.oldest,
          inclusive: args.inclusive,
          limit: args.limit,
          cursor: args.cursor,
        });

        return {
          messages: Array.isArray(result.messages)
            ? result.messages.map((message) => {
                const candidate = message as Record<string, unknown>;
                return {
                  user:
                    typeof candidate.user === "string" ? candidate.user : undefined,
                  bot_id:
                    typeof candidate.bot_id === "string"
                      ? candidate.bot_id
                      : undefined,
                  text:
                    typeof candidate.text === "string" ? candidate.text : undefined,
                  ts: typeof candidate.ts === "string" ? candidate.ts : undefined,
                  subtype:
                    typeof candidate.subtype === "string"
                      ? candidate.subtype
                      : undefined,
                };
              })
            : undefined,
          response_metadata: {
            next_cursor:
              typeof result.response_metadata?.next_cursor === "string"
                ? result.response_metadata.next_cursor
                : undefined,
          },
        };
      },
    },
  };
}

export function normalizeAppMentionEvent(
  event: SlackAppMentionEvent,
): InboundSlackMessage | null {
  if (!event.channel || !event.user || !event.ts || !event.text) {
    return null;
  }

  if (event.channel.startsWith("D")) {
    return null;
  }

  const text = stripSlackMentions(event.text);
  if (text.length === 0) {
    return null;
  }

  return {
    surface: "app_mention",
    sourceEventId: buildSourceEventId({
      channelId: event.channel,
      messageTs: event.ts,
      userId: event.user,
      clientMessageId: event.client_msg_id,
    }),
    channelId: event.channel,
    threadTs: event.thread_ts ?? event.ts,
    messageTs: event.ts,
    userId: event.user,
    text,
    isDirectMessage: false,
  };
}

export function normalizeMessageEvent(
  event: SlackMessageEvent,
  context: { botUserId: string | null },
): InboundSlackMessage | null {
  if (!event.channel || !event.user || !event.ts || !event.text) {
    return null;
  }

  if (event.bot_id || event.user === context.botUserId) {
    return null;
  }

  if (event.subtype !== undefined && event.subtype !== "file_share") {
    return null;
  }

  const isDirectMessage =
    event.channel_type === "im" || event.channel.startsWith("D");
  const isBotMention =
    context.botUserId !== null &&
    event.text.includes(`<@${context.botUserId}>`);

  if (!isDirectMessage && isBotMention) {
    return null;
  }

  const text = stripSlackMentions(event.text);
  if (text.length === 0) {
    return null;
  }

  return {
    surface: "message",
    sourceEventId: buildSourceEventId({
      channelId: event.channel,
      messageTs: event.ts,
      userId: event.user,
      clientMessageId: event.client_msg_id,
    }),
    channelId: event.channel,
    threadTs: event.thread_ts ?? event.ts,
    messageTs: event.ts,
    userId: event.user,
    text,
    isDirectMessage,
  };
}

export function normalizeSlashCommandBody(
  body: SlackSlashCommandBody,
  options?: { envelopeId?: string },
): InboundSlackSlashCommand | null {
  if (!body.command || !body.channel_id || !body.user_id) {
    return null;
  }

  const normalizedCommand = normalizeSlashCommand(body.command);
  if (normalizedCommand.length === 0) {
    return null;
  }

  const channelId = body.channel_id.trim();
  const userId = body.user_id.trim();
  if (channelId.length === 0 || userId.length === 0) {
    return null;
  }

  const text = (body.text ?? "").trim();
  const triggerId = body.trigger_id?.trim() || null;
  const envelopeId = options?.envelopeId?.trim();
  const sourceEventId =
    triggerId ??
    envelopeId ??
    buildSlashFallbackSourceEventId({
      command: normalizedCommand,
      channelId,
      userId,
      text,
    });

  return {
    surface: "slash_command",
    sourceEventId,
    command: normalizedCommand,
    text,
    channelId,
    userId,
    triggerId,
  };
}

export class SlackTransport {
  private readonly socketClient: SocketModeClientLike;
  private readonly webClient: WebClientLike;
  private readonly onInboundMessage: SlackTransportConfig["onInboundMessage"];
  private readonly onInboundSlashCommand: SlackTransportConfig["onInboundSlashCommand"];
  private readonly onSlashCommandAcknowledge: SlackTransportConfig["onSlashCommandAcknowledge"];
  private readonly enableMessageEvents: boolean;
  private readonly log: (line: string) => void;
  private readonly queues = new Map<string, ChannelQueue>();
  private readonly directMessageChannelByUserId = new Map<string, string>();

  private botUserId: string | null = null;
  private started = false;
  private handlersRegistered = false;

  constructor(config: SlackTransportConfig) {
    this.onInboundMessage = config.onInboundMessage;
    this.onInboundSlashCommand = config.onInboundSlashCommand;
    this.onSlashCommandAcknowledge = config.onSlashCommandAcknowledge;
    this.enableMessageEvents = config.enableMessageEvents ?? true;
    this.log = config.log ?? console.log;
    this.socketClient =
      config.socketClient ?? createDefaultSocketModeClient(config.appToken);
    this.webClient = config.webClient ?? createDefaultWebClient(config.botToken);
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const auth = await this.webClient.auth.test();
    const botUserId = auth.user_id;

    if (!botUserId) {
      throw new Error("Slack auth.test() did not return a bot user ID");
    }

    this.botUserId = botUserId;
    this.registerEventHandlers();
    await this.socketClient.start();
    this.started = true;
    this.log(`[gravity] slack transport connected (botUserId=${botUserId})`);
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.socketClient.disconnect) {
      await this.socketClient.disconnect();
    }

    this.started = false;
    this.directMessageChannelByUserId.clear();
    this.log("[gravity] slack transport stopped");
  }

  async postThreadReply(
    channelId: string,
    threadTs: string,
    text: string,
  ): Promise<string> {
    const result = await this.webClient.chat.postMessage({
      channel: channelId,
      text,
      thread_ts: threadTs,
    });

    if (!result.ts) {
      throw new Error("Slack postMessage response missing ts");
    }

    return result.ts;
  }

  async postChannelMessage(channelId: string, text: string): Promise<string> {
    const result = await this.webClient.chat.postMessage({
      channel: channelId,
      text,
    });

    if (!result.ts) {
      throw new Error("Slack postMessage response missing ts");
    }

    return result.ts;
  }

  async postDirectMessage(
    userId: string,
    text: string,
  ): Promise<{ channelId: string; ts: string }> {
    const channelId = await this.resolveDirectMessageChannel(userId);
    const ts = await this.postChannelMessage(channelId, text);
    return { channelId, ts };
  }

  getBotUserId(): string | null {
    return this.botUserId;
  }

  async fetchThreadMessages(input: {
    channelId: string;
    threadTs: string;
    oldestMessageTs?: string | null;
  }): Promise<SlackThreadHistoryMessage[]> {
    const replies = this.webClient.conversations.replies;
    if (!replies) {
      return [];
    }

    const normalizedChannelId = input.channelId.trim();
    const normalizedThreadTs = input.threadTs.trim();
    if (normalizedChannelId.length === 0 || normalizedThreadTs.length === 0) {
      return [];
    }

    const oldestMessageTs = input.oldestMessageTs?.trim() || undefined;
    const messages: SlackThreadHistoryMessage[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    const maxPages = 4;

    do {
      const result = await replies({
        channel: normalizedChannelId,
        ts: normalizedThreadTs,
        oldest: oldestMessageTs,
        inclusive: false,
        limit: 200,
        cursor,
      });

      for (const message of result.messages ?? []) {
        if (!message.ts || !message.text) {
          continue;
        }
        const subtype =
          typeof message.subtype === "string" ? message.subtype.trim() : "";
        if (
          subtype.length > 0 &&
          subtype !== "file_share" &&
          subtype !== "bot_message"
        ) {
          continue;
        }

        const isBot =
          (this.botUserId !== null && message.user === this.botUserId) ||
          Boolean(message.bot_id);
        const effectiveUserId =
          typeof message.user === "string"
            ? message.user
            : isBot
              ? this.botUserId ?? "bot"
              : null;
        if (!effectiveUserId) {
          continue;
        }

        if (
          oldestMessageTs &&
          Number.parseFloat(message.ts) <= Number.parseFloat(oldestMessageTs)
        ) {
          continue;
        }

        const normalizedText = stripSlackMentions(message.text).trim();
        if (normalizedText.length === 0) {
          continue;
        }

        messages.push({
          sourceEventId: buildSourceEventId({
            channelId: normalizedChannelId,
            messageTs: message.ts,
            userId: effectiveUserId,
          }),
          messageTs: message.ts,
          userId: effectiveUserId,
          text: normalizedText,
          isBot,
        });
      }

      cursor = result.response_metadata?.next_cursor?.trim() || undefined;
      pageCount += 1;
    } while (cursor && pageCount < maxPages);

    if (cursor) {
      this.log(
        `[gravity][warning] slack thread history backfill truncated after ${maxPages} page(s) (channelId=${normalizedChannelId} threadTs=${normalizedThreadTs})`,
      );
    }

    messages.sort(
      (a, b) => Number.parseFloat(a.messageTs) - Number.parseFloat(b.messageTs),
    );

    return messages;
  }

  private async resolveDirectMessageChannel(userId: string): Promise<string> {
    const normalizedUserId = userId.trim();
    if (normalizedUserId.length === 0) {
      throw new Error("Slack userId must be non-empty");
    }

    const cachedChannelId = this.directMessageChannelByUserId.get(normalizedUserId);
    if (cachedChannelId) {
      return cachedChannelId;
    }

    const result = await this.webClient.conversations.open({
      users: normalizedUserId,
    });
    const channelId = result.channel?.id?.trim();
    if (!channelId) {
      throw new Error(`Slack conversations.open returned no channel id for user ${normalizedUserId}`);
    }

    this.directMessageChannelByUserId.set(normalizedUserId, channelId);
    return channelId;
  }

  private registerEventHandlers(): void {
    if (this.handlersRegistered) {
      return;
    }

    this.handlersRegistered = true;

    this.socketClient.on(
      "app_mention",
      async (payload) => {
        const envelope = parseSocketEnvelope(payload);
        if (!envelope) {
          return;
        }

        await this.safeAck(envelope.ack);
        if (!this.enableMessageEvents) {
          return;
        }

        const event = extractSocketEvent(envelope, SlackAppMentionEventSchema);
        if (!event) {
          return;
        }

        const message = normalizeAppMentionEvent(event);
        if (!message) {
          return;
        }

        this.enqueueMessage(message);
      },
    );

    this.socketClient.on(
      "message",
      async (payload) => {
        const envelope = parseSocketEnvelope(payload);
        if (!envelope) {
          return;
        }

        await this.safeAck(envelope.ack);
        if (!this.enableMessageEvents) {
          return;
        }

        const event = extractSocketEvent(envelope, SlackMessageEventSchema);
        if (!event) {
          return;
        }

        const message = normalizeMessageEvent(event, {
          botUserId: this.botUserId,
        });
        if (!message) {
          return;
        }

        this.enqueueMessage(message);
      },
    );

    this.socketClient.on(
      "slash_commands",
      async (payload) => {
        const envelope = parseSocketEnvelope(payload);
        if (!envelope) {
          return;
        }

        const body = extractSocketEvent(envelope, SlackSlashCommandBodySchema);
        if (!body) {
          await this.safeSlashCommandAck(envelope.ack);
          return;
        }

        const command = normalizeSlashCommandBody(body, {
          envelopeId: envelope.envelope_id,
        });
        if (!command) {
          await this.safeSlashCommandAck(envelope.ack);
          return;
        }

        let ackResponse: SlackSlashCommandAckResponse | undefined;
        if (this.onSlashCommandAcknowledge) {
          try {
            ackResponse = this.onSlashCommandAcknowledge(command) ?? undefined;
          } catch (error) {
            this.log(
              `[gravity] slash ack builder failed (${command.sourceEventId}): ${normalizeErrorMessage(error)}`,
            );
          }
        }

        await this.safeSlashCommandAck(envelope.ack, ackResponse);

        if (!this.onInboundSlashCommand) {
          return;
        }

        this.enqueueSlashCommand(command);
      },
    );
  }

  private getQueue(channelId: string): ChannelQueue {
    let queue = this.queues.get(channelId);
    if (!queue) {
      queue = new ChannelQueue();
      this.queues.set(channelId, queue);
    }

    return queue;
  }

  private enqueueMessage(message: InboundSlackMessage): void {
    if (!this.onInboundMessage) {
      return;
    }

    const queue = this.getQueue(message.channelId);
    queue.enqueue(async () => {
      try {
        await this.onInboundMessage?.(message);
      } catch (error) {
        this.log(
          `[gravity] slack inbound handler failed (${message.sourceEventId}): ${normalizeErrorMessage(error)}`,
        );
      }
    });
  }

  private enqueueSlashCommand(command: InboundSlackSlashCommand): void {
    const queue = this.getQueue(command.channelId);
    queue.enqueue(async () => {
      try {
        await this.onInboundSlashCommand?.(command);
      } catch (error) {
        this.log(
          `[gravity] slack slash handler failed (${command.sourceEventId}): ${normalizeErrorMessage(error)}`,
        );
      }
    });
  }

  private async safeAck(ack: unknown): Promise<void> {
    if (!isCallable(ack)) {
      return;
    }

    try {
      await ack();
    } catch (error) {
      this.log(
        `[gravity] slack ack failed: ${normalizeErrorMessage(error)}`,
      );
    }
  }

  private async safeSlashCommandAck(
    ack: unknown,
    response?: SlackSlashCommandAckResponse,
  ): Promise<void> {
    if (!isCallable(ack)) {
      return;
    }

    try {
      await ack(response);
    } catch (error) {
      this.log(
        `[gravity] slack ack failed: ${normalizeErrorMessage(error)}`,
      );
    }
  }
}
