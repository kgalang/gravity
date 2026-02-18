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

  async upsertSession(record: CapturedRecord): Promise<void> {
    this.records.push(record);
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
});
