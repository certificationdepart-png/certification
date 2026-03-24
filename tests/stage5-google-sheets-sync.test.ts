import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    GOOGLE_SERVICE_ACCOUNT_JSON: null,
    GOOGLE_SERVICE_ACCOUNT_JSON_B64: null,
  },
}));

import { formatDate } from "@/lib/format-datetime";
import {
  applicationCourseToRowValues,
  type ApplicationCourseForSync,
  type ApplicationForSync,
} from "@/services/google-sheets-sync.service";

function makeCourse(overrides?: Partial<ApplicationCourseForSync>): ApplicationCourseForSync {
  return {
    id: "ac-1",
    externalRowId: null,
    certificateFormat: "electronic",
    bprRequired: false,
    course: { title: "Курс 1", bprSpecialtyCheckLink: null, bprTestLink: null },
    ...overrides,
  };
}

describe("stage5 Google Sheets sync", () => {
  describe("applicationCourseToRowValues", () => {
    it("maps a single ApplicationCourse to 17 column values in correct order A-Q", () => {
      const app: ApplicationForSync = {
        courses: [makeCourse()],
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

      const row = applicationCourseToRowValues(app, makeCourse(), null);

      expect(row).toHaveLength(17);
      expect(row[0]).toBe("на перевірці");          // A: status
      expect(row[1]).toBe(formatDate(app.createdAt)); // B: date
      expect(row[2]).toBe("123456");                  // C: TG ID
      expect(row[3]).toBe("student_ua");              // D: username
      expect(row[4]).toBe("Україна");                 // E: delivery type
      expect(row[5]).toBe("Курс 1");                  // F: single course title
      expect(row[6]).toBe("Іван Петренко");            // G: name UA
      expect(row[7]).toBe("Ivan Petrenko");            // H: name EN
      expect(row[8]).toBe("Київ");                    // I: city
      expect(row[9]).toBe("Відділення №1");            // J: branch
      expect(row[10]).toBe(3);                         // K: screenshots
      expect(row[11]).toBe(10);                        // L: score
      expect(row[12]).toBe("Чудовий курс!");           // M: feedback
      expect(row[13]).toBe("Ні");                      // N: BPR (per-course)
      expect(row[14]).toBe("");                         // O: admin link (null → "")
      expect(row[15]).toBe("на перевірці");            // P: status duplicate
      expect(row[16]).toBe("Електронний");             // Q: certificateFormat
    });

    it("reflects per-course BPR and certificateFormat correctly", () => {
      const app: ApplicationForSync = {
        courses: [],
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
      const ac = makeCourse({ bprRequired: true, certificateFormat: "physical" });
      const row = applicationCourseToRowValues(app, ac, null);

      expect(row[13]).toBe("Так");           // N: BPR true
      expect(row[16]).toBe("Фізичний");      // Q: physical
    });

    it("produces separate rows for two courses in the same application", () => {
      const app: ApplicationForSync = {
        courses: [],
        createdAt: new Date("2026-03-01"),
        deliveryMode: "ua",
        status: "submitted",
        telegramUserId: "999",
        telegramUsername: null,
        studentNameUa: "А Б",
        studentNameEn: "A B",
        deliveryCity: "Одеса",
        deliveryBranch: null,
        score: null,
        feedbackText: null,
      };
      const ac1 = makeCourse({ id: "ac-1", course: { title: "Курс 1", bprSpecialtyCheckLink: null, bprTestLink: null }, bprRequired: false, certificateFormat: "electronic" });
      const ac2 = makeCourse({ id: "ac-2", course: { title: "Курс 2", bprSpecialtyCheckLink: null, bprTestLink: null }, bprRequired: true, certificateFormat: "both" });

      const row1 = applicationCourseToRowValues(app, ac1, null);
      const row2 = applicationCourseToRowValues(app, ac2, null);

      expect(row1[5]).toBe("Курс 1");
      expect(row1[13]).toBe("Ні");
      expect(row1[16]).toBe("Електронний");

      expect(row2[5]).toBe("Курс 2");
      expect(row2[13]).toBe("Так");
      expect(row2[16]).toBe("Електронний і фізичний");

      // Application-level fields are the same on both rows.
      expect(row1[2]).toBe(row2[2]); // TG ID
      expect(row1[6]).toBe(row2[6]); // name UA
    });

    it("handles null/empty optional fields", () => {
      const app: ApplicationForSync = {
        courses: [],
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
      const row = applicationCourseToRowValues(app, makeCourse(), null);

      expect(row[0]).toBe("підтверджено");
      expect(row[3]).toBe("");   // username null → ""
      expect(row[4]).toBe("—"); // delivery none
      expect(row[8]).toBe("");   // city null
      expect(row[9]).toBe("");   // branch null
      expect(row[11]).toBe(""); // score null
      expect(row[12]).toBe(""); // feedback null
      expect(row[14]).toBe(""); // admin link null
    });

    it("handles abroad delivery mode", () => {
      const app: ApplicationForSync = {
        courses: [],
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
      const row = applicationCourseToRowValues(app, makeCourse(), null);
      expect(row[4]).toBe("за кордон");
    });
  });
});
