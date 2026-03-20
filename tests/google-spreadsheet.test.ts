import { describe, expect, it } from "vitest";

import { parseGoogleSpreadsheetIdFromUrl } from "../src/lib/google-spreadsheet";

describe("parseGoogleSpreadsheetIdFromUrl", () => {
  it("extracts id from standard edit URL", () => {
    expect(
      parseGoogleSpreadsheetIdFromUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK/edit"),
    ).toBe("1AbCdEfGhIjK");
  });

  it("returns null for unrelated URLs", () => {
    expect(parseGoogleSpreadsheetIdFromUrl("https://example.com/spreadsheets/d/xyz")).toBeNull();
  });
});
