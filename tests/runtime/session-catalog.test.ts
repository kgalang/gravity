import { describe, expect, it } from "vitest";
import {
  createSessionCatalog,
  type SessionCatalogRepository,
} from "../../src/runtime/session-catalog.js";

type CapturedRecord = {
  sessionKey: string;
  agentId: string;
  mode: "thread" | "main" | "isolated";
  status: "active" | "closed";
  surface: "slack" | "system";
  channelId: string | null;
  threadTs: string | null;
  ownerUserId: string | null;
  openedByTrigger: "message" | "cron" | "heartbeat" | "system";
  activityAt: Date;
};

class FakeSessionCatalogRepository implements SessionCatalogRepository {
  readonly records: CapturedRecord[] = [];
  readonly closeRecords: Array<{ sessionKey: string; closedAt: Date }> = [];

  async upsertSession(record: CapturedRecord): Promise<void> {
    this.records.push(record);
  }

  async closeSession(input: {
    sessionKey: string;
    closedAt: Date;
  }): Promise<void> {
    this.closeRecords.push(input);
  }
}

describe("createSessionCatalog", () => {
  it("upserts normalized active sessions", async () => {
    const repository = new FakeSessionCatalogRepository();
    const catalog = createSessionCatalog(repository);

    await catalog.ensureSessionActive({
      sessionKey: " data-analyst:abc123 ",
      agentId: " data-analyst ",
      mode: "isolated",
      surface: "slack",
      channelId: " C123 ",
      threadTs: " ",
      ownerUserId: " U123 ",
      openedByTrigger: "message",
    });

    expect(repository.records).toHaveLength(1);
    expect(repository.records[0]).toMatchObject({
      sessionKey: "data-analyst:abc123",
      agentId: "data-analyst",
      mode: "isolated",
      status: "active",
      surface: "slack",
      channelId: "C123",
      threadTs: null,
      ownerUserId: "U123",
      openedByTrigger: "message",
    });
    expect(repository.records[0]?.activityAt).toBeInstanceOf(Date);
  });

  it("rejects empty required identifiers", async () => {
    const repository = new FakeSessionCatalogRepository();
    const catalog = createSessionCatalog(repository);

    await expect(
      catalog.ensureSessionActive({
        sessionKey: "   ",
        agentId: "data-analyst",
        mode: "isolated",
        surface: "slack",
        openedByTrigger: "message",
      }),
    ).rejects.toThrow("Session catalog sessionKey must be non-empty");

    await expect(
      catalog.ensureSessionActive({
        sessionKey: "data-analyst:abc123",
        agentId: "   ",
        mode: "isolated",
        surface: "slack",
        openedByTrigger: "message",
      }),
    ).rejects.toThrow("Session catalog agentId must be non-empty");
  });

  it("closes sessions with normalized session keys", async () => {
    const repository = new FakeSessionCatalogRepository();
    const catalog = createSessionCatalog(repository);

    await catalog.closeSession({
      sessionKey: " data-analyst:abc123 ",
    });

    expect(repository.closeRecords).toHaveLength(1);
    expect(repository.closeRecords[0]?.sessionKey).toBe("data-analyst:abc123");
    expect(repository.closeRecords[0]?.closedAt).toBeInstanceOf(Date);
  });
});
