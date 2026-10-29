import { beforeEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
  env: {
    DELAYED_FOLLOWUPS_ENABLED: "true",
    DELAYED_FOLLOWUPS_START_AT: "2020-01-01T00:00:00Z",
    DELAYED_CRON_SECRET: "a".repeat(40),
  },
  query: vi.fn(),
  update: vi.fn(),
  findApplication: vi.fn(),
  log: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: control.env }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "test-token" }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: control.query,
    outboxEvent: { update: control.update },
    application: { findFirst: control.findApplication },
    outgoingMessageLog: { create: control.log },
  },
}));

import { processDelayedFollowups, isFollowupPayload } from "@/services/delayed-followups.service";
import { POST } from "@/app/api/cron/process-delayed-messages/route";

const event = {
  id: "new-event", schoolId: "s1", applicationId: "a1", attemptCount: 1,
  payload: { applicationId: "a1", schoolId: "s1", courseId: "c1", chatId: "111", messageText: "Hi" },
};
const application = {
  status: "approved", chatId: "111", school: { telegramBotTokenEnc: "encrypted" },
  courses: [{ course: { delayedMessageEnabled: true } }],
};

function req(authorization?: string) {
  return new Request("https://example.com/api/cron/process-delayed-messages", {
    method: "POST", headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("delayed follow-up safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    control.env.DELAYED_FOLLOWUPS_ENABLED = "true";
    control.env.DELAYED_FOLLOWUPS_START_AT = "2020-01-01T00:00:00Z";
    control.env.DELAYED_CRON_SECRET = "a".repeat(40);
    control.query.mockResolvedValueOnce([event]).mockResolvedValueOnce([]);
    control.findApplication.mockResolvedValue(application);
    control.update.mockResolvedValue({});
    control.log.mockResolvedValue({});
  });
  it("refuses unauthenticated calls", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(control.query).not.toHaveBeenCalled();
  });
  it("fails closed if no secret exists", async () => {
    control.env.DELAYED_CRON_SECRET = "";
    expect((await POST(req("Bearer " + "a".repeat(40)))).status).toBe(401);
  });
  it("remains disabled without explicitly enabling the rollout", async () => {
    control.env.DELAYED_FOLLOWUPS_ENABLED = "false";
    expect((await POST(req("Bearer " + "a".repeat(40)))).status).toBe(503);
  });
  it("rejects invalid payloads without Telegram calls", async () => {
    control.query.mockReset().mockResolvedValueOnce([{...event, payload: {chatId: "111"}}]).mockResolvedValueOnce([]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await processDelayedFollowups();
    expect(result.cancelled).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("checks current approval before any send", async () => {
    control.findApplication.mockResolvedValue({ ...application, status: "rejected" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await processDelayedFollowups();
    expect(result.cancelled).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("marks sent event complete even when optional message log fails", async () => {
    control.log.mockRejectedValue(new Error("log unavailable"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"ok":true}', {status:200}));
    const result = await processDelayedFollowups();
    expect(result.sent).toBe(1);
    expect(control.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"completed"})}));
    fetchSpy.mockRestore();
  });
  it("never blindly retries an uncertain delivery", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    const result = await processDelayedFollowups();
    expect(result.needsReview).toBe(1);
    expect(control.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"needs_review"})}));
    fetchSpy.mockRestore();
  });
  it("validates the intended payload shape", () => {
    expect(isFollowupPayload(event.payload)).toBe(true);
    expect(isFollowupPayload({})).toBe(false);
  });
});
