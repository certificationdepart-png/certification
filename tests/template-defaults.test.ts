import { describe, expect, it } from "vitest";

import { DEFAULT_MESSAGE_TEMPLATES } from "../src/services/template-defaults";

describe("default message templates", () => {
  it("contains unique template codes", () => {
    const codes = DEFAULT_MESSAGE_TEMPLATES.map((item) => item.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it("contains stage confirmation templates", () => {
    expect(DEFAULT_MESSAGE_TEMPLATES.some((item) => item.code === "after_confirmation")).toBe(true);
    expect(DEFAULT_MESSAGE_TEMPLATES.some((item) => item.code === "nova_poshta_warning")).toBe(true);
    expect(DEFAULT_MESSAGE_TEMPLATES.some((item) => item.code === "processing_followup")).toBe(true);
    expect(DEFAULT_MESSAGE_TEMPLATES.some((item) => item.code === "review_site_invite")).toBe(true);
  });
});
