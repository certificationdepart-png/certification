import { describe, expect, it } from "vitest";

import { schoolCreateSchema, templateCreateSchema } from "../src/services/validation";

const sampleSheetUrl = "https://docs.google.com/spreadsheets/d/1abc_def-ghi/edit#gid=0";

describe("stage2 validation", () => {
  it("requires integration credentials for school create", () => {
    const result = schoolCreateSchema.safeParse({
      name: "Demo School",
      telegramChatId: "-100123",
      telegramBotToken: "",
      novaPoshtaApiKey: "",
      googleSheetUrl: sampleSheetUrl,
    });

    expect(result.success).toBe(false);
  });

  it("accepts school create with spreadsheet URL (slug/key are server-side)", () => {
    const result = schoolCreateSchema.safeParse({
      name: "Demo School",
      telegramChatId: "-100123",
      telegramBotToken: "12345",
      novaPoshtaApiKey: "12345",
      googleSheetUrl: sampleSheetUrl,
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-spreadsheet URLs for school create", () => {
    const result = schoolCreateSchema.safeParse({
      name: "Demo School",
      telegramChatId: "-100123",
      telegramBotToken: "12345",
      novaPoshtaApiKey: "12345",
      googleSheetUrl: "https://example.com/doc",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid template code format", () => {
    const result = templateCreateSchema.safeParse({
      schoolId: "school-id",
      code: "bad code spaces",
      text: "template",
    });

    expect(result.success).toBe(false);
  });
});
