import { randomUUID } from "node:crypto";
import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";
import { normalizeSlashCommand } from "./slash-command-router.js";

export type SlackSurface = "app_mention" | "message";
export type SlackCommandSurface = "slash_command";

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

type Acknowledge = () => Promise<void> | void;
type QueuedWork = () => Promise<void>;

type SocketEnvelope<EventPayload> = {
  event?: EventPayload;
  ack?: Acknowledge;
  body?: unknown;
  envelope_id?: string;
};

type SlackAppMentionEvent = {
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  client_msg_id?: string;
};

type SlackMessageEvent = {
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  channel_type?: string;
  subtype?: string;
  bot_id?: string;
  client_msg_id?: string;
};

type SlackSlashCommandBody = {
  command?: string;
  text?: string;
  channel_id?: string;
  user_id?: string;
  trigger_id?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractSocketEvent<EventPayload>(payload: {
  event?: unknown;
  body?: unknown;
}): EventPayload | null {
  if (isRecord(payload.event)) {
    return payload.event as EventPayload;
  }

  if (!isRecord(payload.body)) {
    return null;
  }

  const nestedEvent = payload.body.event;
  if (isRecord(nestedEvent)) {
    return nestedEvent as EventPayload;
  }

  return payload.body as EventPayload;
}

export type SocketModeClientLike = {
  on(
    eventName: "app_mention" | "message" | "slash_commands",
    handler:
      | ((payload: SocketEnvelope<SlackAppMentionEvent>) => void | Promise<void>)
      | ((payload: SocketEnvelope<SlackMessageEvent>) => void | Promise<void>)
      | ((payload: SocketEnvelope<SlackSlashCommandBody>) => void | Promise<void>),
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
};

export type SlackTransportConfig = {
  appToken: string;
  botToken: string;
  onInboundMessage?: (message: InboundSlackMessage) => Promise<void> | void;
  onInboundSlashCommand?: (
    command: InboundSlackSlashCommand,
  ) => Promise<void> | void;
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

  const text = (body.text ?? "").trim();
  const triggerId = body.trigger_id?.trim() || null;
  const envelopeId = options?.envelopeId?.trim();
  const sourceEventId =
    triggerId ?? envelopeId ?? `slash:${randomUUID().replace(/-/g, "")}`;

  return {
    surface: "slash_command",
    sourceEventId,
    command: normalizedCommand,
    text,
    channelId: body.channel_id,
    userId: body.user_id,
    triggerId,
  };
}

export class SlackTransport {
  private readonly socketClient: SocketModeClientLike;
  private readonly webClient: WebClientLike;
  private readonly onInboundMessage: SlackTransportConfig["onInboundMessage"];
  private readonly onInboundSlashCommand: SlackTransportConfig["onInboundSlashCommand"];
  private readonly enableMessageEvents: boolean;
  private readonly log: (line: string) => void;
  private readonly queues = new Map<string, ChannelQueue>();

  private botUserId: string | null = null;
  private started = false;
  private handlersRegistered = false;

  constructor(config: SlackTransportConfig) {
    this.onInboundMessage = config.onInboundMessage;
    this.onInboundSlashCommand = config.onInboundSlashCommand;
    this.enableMessageEvents = config.enableMessageEvents ?? true;
    this.log = config.log ?? console.log;
    this.socketClient =
      config.socketClient ??
      ((new SocketModeClient({
        appToken: config.appToken,
      }) as unknown) as SocketModeClientLike);
    this.webClient =
      config.webClient ??
      ((new WebClient(config.botToken) as unknown) as WebClientLike);
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

  getBotUserId(): string | null {
    return this.botUserId;
  }

  private registerEventHandlers(): void {
    if (this.handlersRegistered) {
      return;
    }

    this.handlersRegistered = true;

    this.socketClient.on(
      "app_mention",
      async (payload: SocketEnvelope<SlackAppMentionEvent>) => {
        await this.safeAck(payload.ack);
        if (!this.enableMessageEvents) {
          return;
        }

        const event = extractSocketEvent<SlackAppMentionEvent>(payload);
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
      async (payload: SocketEnvelope<SlackMessageEvent>) => {
        await this.safeAck(payload.ack);
        if (!this.enableMessageEvents) {
          return;
        }

        const event = extractSocketEvent<SlackMessageEvent>(payload);
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
      async (payload: SocketEnvelope<SlackSlashCommandBody>) => {
        await this.safeAck(payload.ack);

        if (!this.onInboundSlashCommand) {
          return;
        }

        const body = extractSocketEvent<SlackSlashCommandBody>(payload);
        if (!body) {
          return;
        }

        const command = normalizeSlashCommandBody(body, {
          envelopeId: payload.envelope_id,
        });
        if (!command) {
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

  private async safeAck(ack: Acknowledge | undefined): Promise<void> {
    if (!ack) {
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
}
