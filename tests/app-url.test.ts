import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("resolvePublicAppBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it("prefers NEXT_PUBLIC_APP_URL and strips trailing slash", async () => {
    vi.stubEnv("NODE_ENV", "test");
    applyEnv({
      NEXT_PUBLIC_APP_URL: "https://app.example.com/",
      BETTER_AUTH_URL: "https://auth.example.com",
    });
    const { resolvePublicAppBaseUrl } = await import("../src/lib/app-url");
    expect(resolvePublicAppBaseUrl()).toBe("https://app.example.com");
  });

  it("falls back to BETTER_AUTH_URL when NEXT_PUBLIC_APP_URL is unset", async () => {
    vi.stubEnv("NODE_ENV", "test");
    applyEnv({
      NEXT_PUBLIC_APP_URL: undefined,
      BETTER_AUTH_URL: "https://school.example.org/",
    });
    const { resolvePublicAppBaseUrl } = await import("../src/lib/app-url");
    expect(resolvePublicAppBaseUrl()).toBe("https://school.example.org");
  });

  it("uses VERCEL_URL when app and auth URLs are unset", async () => {
    vi.stubEnv("NODE_ENV", "test");
    applyEnv({
      NEXT_PUBLIC_APP_URL: undefined,
      BETTER_AUTH_URL: undefined,
    });
    process.env.VERCEL_URL = "my-app.vercel.app";
    const { resolvePublicAppBaseUrl } = await import("../src/lib/app-url");
    expect(resolvePublicAppBaseUrl()).toBe("https://my-app.vercel.app");
  });

  it("prefers VERCEL_PROJECT_PRODUCTION_URL when provided", async () => {
    vi.stubEnv("NODE_ENV", "test");
    applyEnv({
      NEXT_PUBLIC_APP_URL: undefined,
      BETTER_AUTH_URL: undefined,
    });
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "google-sheets-automatization-hon0pnrbg-oleksiikoval99s-projects.vercel.app";
    process.env.VERCEL_URL = "some-preview.vercel.app";

    const { resolvePublicAppBaseUrl } = await import("../src/lib/app-url");
    expect(resolvePublicAppBaseUrl()).toBe(
      "https://google-sheets-automatization-hon0pnrbg-oleksiikoval99s-projects.vercel.app",
    );
  });
});
