import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "12345678901234567890123456789012",
  DATA_ENCRYPTION_KEY: "12345678901234567890123456789012",
} as const;

function applyEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries({ ...baseEnv, ...overrides })) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("telegram bot setup", () => {
  const fetchMock = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    applyEnv({ NODE_ENV: "development" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("registerSchoolBotCommands calls setMyCommands with /start and /new", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });

    const { registerSchoolBotCommands } = await import("@/services/telegram/telegram-set-webhook.service");
    await registerSchoolBotCommands({ botToken: "123:abc" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:abc/setMyCommands");
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual({ "Content-Type": "application/json" });
    expect(request.body).toBe(
      JSON.stringify({
        commands: [
          { command: "start", description: "Отримати сертифікат" },
          { command: "new", description: "Почати нову сесію" },
        ],
      }),
    );
  });

  it("registerSchoolBotCommands throws AppError when Telegram rejects request", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ ok: false, description: "Bad Request: BOT_COMMAND_INVALID" }),
    });

    const { registerSchoolBotCommands } = await import("@/services/telegram/telegram-set-webhook.service");
    await expect(registerSchoolBotCommands({ botToken: "123:abc" })).rejects.toThrow(
      "Bad Request: BOT_COMMAND_INVALID",
    );
  });
});
