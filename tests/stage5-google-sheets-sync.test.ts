import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    GOOGLE_SERVICE_ACCOUNT_JSON: null,
    GOOGLE_SERVICE_ACCOUNT_JSON_B64: null,
  },
}));

import { formatDate } from "@/lib/format-datetime";
import { applicationToRowValues, type ApplicationForSync } from "@/services/google-sheets-sync.service";

describe("stage5 Google Sheets sync", () => {
  describe("applicationToRowValues", () => {
    it("maps Application to row values in correct column order A-N", () => {
      const app: ApplicationForSync = {
        courses: [
          {
            course: { title: "Курс 1", bprSpecialtyCheckLink: null, bprTestLink: null },
            bprRequired: false,
          },
          {
            course: { title: "Курс 2", bprSpecialtyCheckLink: null, bprTestLink: null },
            bprRequired: false,
          },
        ],
        _count: { screenshots: 3 },
        createdAt: new Date("2026-03-19T12:00:00Z"),
        deliveryMode: "ua",
        status: "submitted",
        telegramUserId: "123456",
        telegramUsername: "student_ua",
        studentNameUa: "Іван Петренко",
        studentNameEn: "Ivan Petrenko",
        deliveryCity: "Київ",
        deliveryBranch: "Відділення №1",
        score: 10,
        feedbackText: "Чудовий курс!",
      };

      const row = applicationToRowValues(app, null);

      expect(row).toHaveLength(16);
      expect(row[0]).toBe("на перевірці");
      expect(row[1]).toBe(formatDate(app.createdAt));
      expect(row[2]).toBe("123456");
      expect(row[3]).toBe("student_ua");
      expect(row[4]).toBe("Україна");
      expect(row[5]).toBe("Курс 1, Курс 2");
      expect(row[6]).toBe("Іван Петренко");
      expect(row[7]).toBe("Ivan Petrenko");
      expect(row[8]).toBe("Київ");
      expect(row[9]).toBe("Відділення №1");
      expect(row[10]).toBe(3);
      expect(row[11]).toBe(10);
      expect(row[12]).toBe("Чудовий курс!");
      expect(row[13]).toBe("Ні");
      expect(row[14]).toBe("");
      expect(row[15]).toBe("на перевірці");
    });

    it("handles null/empty delivery and optional fields", () => {
      const app: ApplicationForSync = {
        courses: [
          {
            course: { title: "Test", bprSpecialtyCheckLink: null, bprTestLink: null },
            bprRequired: false,
          },
        ],
        createdAt: new Date("2026-01-01"),
        deliveryMode: "none",
        status: "approved",
        telegramUserId: "1",
        telegramUsername: null,
        studentNameUa: "Test",
        studentNameEn: "Test",
        deliveryCity: null,
        deliveryBranch: null,
        score: null,
        feedbackText: null,
      };

      const row = applicationToRowValues(app, null);

      expect(row[0]).toBe("підтверджено");
      expect(row[3]).toBe("");
      expect(row[4]).toBe("—");
      expect(row[8]).toBe("");
      expect(row[9]).toBe("");
      expect(row[11]).toBe("");
      expect(row[12]).toBe("");
      expect(row[13]).toBe("Ні");
      expect(row[14]).toBe("");
      expect(row[15]).toBe("підтверджено");
    });

    it("handles abroad delivery mode", () => {
      const app: ApplicationForSync = {
        courses: [
          {
            course: { title: "X", bprSpecialtyCheckLink: null, bprTestLink: null },
            bprRequired: false,
          },
        ],
        createdAt: new Date(),
        deliveryMode: "abroad",
        status: "submitted",
        telegramUserId: "1",
        telegramUsername: null,
        studentNameUa: "A",
        studentNameEn: "A",
        deliveryCity: null,
        deliveryBranch: null,
        score: null,
        feedbackText: null,
      };

      const row = applicationToRowValues(app, null);
      expect(row[4]).toBe("за кордон");
    });
  });
});
