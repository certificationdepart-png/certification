import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    GOOGLE_SERVICE_ACCOUNT_JSON: null,
    GOOGLE_SERVICE_ACCOUNT_JSON_B64: null,
  },
}));

import { formatSheetDate } from "@/lib/format-datetime";
import {
  applicationCourseToRowValues,
  findMatchingCourseRowNumbers,
  type ApplicationCourseForSync,
  type ApplicationForSync,
  parseUpdatedRange,
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

const NULL_DELIVERY_FIELDS = {
  deliveryAddress: null,
  deliveryCountry: null,
  deliveryPhone: null,
  deliveryEmail: null,
  recipientName: null,
  recipientPhone: null,
} satisfies Partial<ApplicationForSync>;

describe("stage5 Google Sheets sync", () => {
  describe("applicationCourseToRowValues", () => {
    it("maps a single ApplicationCourse to 19 column values in correct order A-S", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
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

      expect(row).toHaveLength(19);
      expect(row[0]).toBe("на перевірці");          // A: status
      expect(row[1]).toBe(formatSheetDate(app.createdAt)); // B: date
      expect(row[2]).toBe("123456");                  // C: TG ID
      expect(row[3]).toBe("student_ua");              // D: username
      expect(row[4]).toBe("Україна");                 // E: delivery type
      expect(row[5]).toBe("Курс 1");                  // F: single course title
      expect(row[6]).toBe("Іван Петренко");            // G: name UA
      expect(row[7]).toBe("Ivan Petrenko");            // H: name EN
      expect(row[8]).toBe("Київ");                    // I: city
      expect(row[9]).toBe("Відділення №1");            // J: branch
      expect(row[10]).toBe("");                        // K: recipient name
      expect(row[11]).toBe("");                        // L: recipient phone/email
      expect(row[12]).toBe(3);                         // M: screenshots
      expect(row[13]).toBe(10);                        // N: score
      expect(row[14]).toBe("Чудовий курс!");           // O: feedback
      expect(row[15]).toBe("Ні");                      // P: BPR (per-course)
      expect(row[16]).toBe("");                        // Q: admin link (null → "")
      expect(row[17]).toBe("на перевірці");            // R: status duplicate
      expect(row[18]).toBe("Електронний");             // S: certificateFormat
    });

    it("reflects per-course BPR and certificateFormat correctly", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
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

      expect(row[15]).toBe("Так");           // P: BPR true
      expect(row[18]).toBe("Фізичний");      // S: physical
    });

    it("produces separate rows for two courses in the same application", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
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
      expect(row1[15]).toBe("Ні");
      expect(row1[18]).toBe("Електронний");

      expect(row2[5]).toBe("Курс 2");
      expect(row2[15]).toBe("Так");
      expect(row2[18]).toBe("Електронний і фізичний");

      // Application-level fields are the same on both rows.
      expect(row1[2]).toBe(row2[2]); // TG ID
      expect(row1[6]).toBe(row2[6]); // name UA
    });

    it("handles null/empty optional fields", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
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
      expect(row[12]).toBe(0);  // screenshots default to 0
      expect(row[13]).toBe(""); // score null
      expect(row[14]).toBe(""); // feedback null
      expect(row[16]).toBe(""); // admin link null
    });

    it("handles abroad delivery mode with no details", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
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
      expect(row[8]).toBe("за кордон"); // I: fallback abroad label
      expect(row[9]).toBe(""); // J: no branch for abroad
      expect(row[11]).toBe(""); // L: no phone/email
    });

    it("formats recipient contact column for abroad electronic delivery", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
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
        deliveryEmail: "student@example.com",
      };
      const row = applicationCourseToRowValues(app, makeCourse(), null);
      expect(row[11]).toBe("Email: student@example.com");
    });

    it("finds duplicate rows for the same admin application link", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
        courses: [],
        createdAt: new Date("2026-03-19T12:00:00Z"),
        deliveryMode: "ua",
        status: "approved",
        telegramUserId: "123456",
        telegramUsername: "student_ua",
        studentNameUa: "Іван Петренко",
        studentNameEn: "Ivan Petrenko",
        deliveryCity: "Київ",
        deliveryBranch: "Відділення №1",
        score: 10,
        feedbackText: "Чудовий курс!",
      };
      const course = makeCourse();
      const adminUrl = "https://example.com/applications/app-1";
      const currentRow = applicationCourseToRowValues(app, course, adminUrl);
      const staleDuplicate = [...currentRow];
      staleDuplicate[0] = "на перевірці";
      staleDuplicate[17] = "на перевірці";

      const matches = findMatchingCourseRowNumbers(
        [
          currentRow,
          ["інша заявка"],
          staleDuplicate,
        ],
        app,
        course,
        adminUrl,
        { requireAdminLink: true },
      );

      expect(matches).toEqual([2, 4]);
    });

    it("does not match a duplicate row with another application admin link when strict link matching is required", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
        courses: [],
        createdAt: new Date("2026-03-19T12:00:00Z"),
        deliveryMode: "ua",
        status: "approved",
        telegramUserId: "123456",
        telegramUsername: "student_ua",
        studentNameUa: "Іван Петренко",
        studentNameEn: "Ivan Petrenko",
        deliveryCity: "Київ",
        deliveryBranch: "Відділення №1",
        score: 10,
        feedbackText: null,
      };
      const course = makeCourse();
      const wrongLinkRow = applicationCourseToRowValues(
        app,
        course,
        "https://example.com/applications/another-app",
      );

      const matches = findMatchingCourseRowNumbers(
        [wrongLinkRow],
        app,
        course,
        "https://example.com/applications/app-1",
        { requireAdminLink: true },
      );

      expect(matches).toEqual([]);
    });

    it("finds rows shifted to the right by Google Sheets append detection", () => {
      const app: ApplicationForSync = {
        ...NULL_DELIVERY_FIELDS,
        courses: [],
        createdAt: new Date("2026-03-19T12:00:00Z"),
        deliveryMode: "none",
        status: "approved",
        telegramUserId: "123456",
        telegramUsername: null,
        studentNameUa: "Іван Петренко",
        studentNameEn: "Ivan Petrenko",
        deliveryCity: null,
        deliveryBranch: null,
        score: null,
        feedbackText: null,
      };
      const shiftedRow = [
        "",
        "",
        "",
        ...applicationCourseToRowValues(app, makeCourse(), null),
      ];

      const matches = findMatchingCourseRowNumbers([shiftedRow], app, makeCourse(), null);

      expect(matches).toEqual([2]);
    });
  });

  describe("parseUpdatedRange", () => {
    it("parses updated ranges that start at column A", () => {
      expect(parseUpdatedRange("'School'!A43:S43")).toEqual({
        startColumn: "A",
        endColumn: "S",
        rowNumber: 43,
      });
    });

    it("parses shifted updated ranges and keeps the real row number", () => {
      expect(parseUpdatedRange("'School'!P43:AH43")).toEqual({
        startColumn: "P",
        endColumn: "AH",
        rowNumber: 43,
      });
    });

    it("returns null for invalid updated ranges", () => {
      expect(parseUpdatedRange("School")).toBeNull();
    });
  });
});
