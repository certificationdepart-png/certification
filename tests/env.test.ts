import { describe, expect, it } from "vitest";

describe("stage 1 baseline", () => {
  it("has a semver app version", async () => {
    const pkg = await import("../package.json");
    expect(pkg.default.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

