import { z } from "zod";

import { parseGoogleSpreadsheetIdFromUrl } from "@/lib/google-spreadsheet";

const templateCodeRegex = /^[a-z0-9_:-]{2,80}$/i;

const googleSheetSpreadsheetUrl = z
  .string()
  .trim()
  .min(1, "Посилання на Google Таблицю обов'язкове")
  .url("Невірний формат URL")
  .refine(
    (url) => parseGoogleSpreadsheetIdFromUrl(url) !== null,
    "Вкажіть посилання на таблицю виду https://docs.google.com/spreadsheets/d/...",
  );

/** Admin create: slug, schoolKey, and spreadsheet ID are generated server-side from name + URL. */
export const schoolCreateSchema = z.object({
  name: z.string().trim().min(2, "Назва має містити щонайменше 2 символи"),
  telegramChatId: z.string().trim().min(2, "ID чату Telegram є обов'язковим"),
  telegramBotToken: z.string().trim().min(5, "Токен бота Telegram є обов'язковим"),
  novaPoshtaApiKey: z.string().trim().min(5, "API ключ Нової пошти є обов'язковим"),
  googleSheetUrl: googleSheetSpreadsheetUrl,
});

export const schoolUpdateSchema = z.object({
  name: z.string().trim().min(2, "Назва має містити щонайменше 2 символи").optional(),
  telegramChatId: z.string().trim().min(2, "ID чату Telegram є обов'язковим").optional(),
  telegramBotToken: z.string().trim().min(5).optional(),
  novaPoshtaApiKey: z.string().trim().min(5).optional(),
  /** Порожній рядок = не змінювати таблицю. */
  googleSheetUrl: z.union([z.literal(""), googleSheetSpreadsheetUrl]).optional(),
});

export const courseCreateSchemaBase = z.object({
  schoolId: z.string().trim().min(1, "Оберіть школу"),
  title: z.string().trim().min(2, "Назва курсу має містити щонайменше 2 символи"),
  certificateType: z.enum(["electronic", "physical", "both"]),
  daysToSend: z
    .number()
    .int()
    .min(0, "Термін (дні) не може бути від'ємним")
    .max(365, "Максимум 365 днів"),
  reviewLink: z.string().trim().url("Невірний формат посилання на відгук").optional().or(z.literal("")),
  requirementsText: z.string().trim().min(2, "Текст вимог є обов'язковим"),

  /** "Бали БПР" enabled for this course. */
  bprEnabled: z.boolean(),
  bprSpecialtyCheckLink: z
    .union([
      z.literal(""),
      z.string().trim().url("Невірний формат посилання для перевірки спеціальності"),
    ])
    .optional(),
  bprTestLink: z
    .union([
      z.literal(""),
      z.string().trim().url("Невірний формат посилання для тесту БПР"),
    ])
    .optional(),
});

export const courseCreateSchema = courseCreateSchemaBase.superRefine((data, ctx) => {
  if (!data.bprEnabled) return;

  const specialtyLink = data.bprSpecialtyCheckLink?.trim() ?? "";
  if (!specialtyLink) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bprSpecialtyCheckLink"],
      message: "Посилання для перевірки спеціальності є обов'язковим, коли увімкнено «Бали БПР».",
    });
  }

  const testLink = data.bprTestLink?.trim() ?? "";
  if (!testLink) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bprTestLink"],
      message: "Посилання для тесту є обов'язковим, коли увімкнено «Бали БПР».",
    });
  }
});

export const courseUpdateSchema = courseCreateSchemaBase
  .omit({ schoolId: true })
  .partial()
  .superRefine((data, ctx) => {
    if (data.bprEnabled !== true) return;

    const specialtyLink = data.bprSpecialtyCheckLink?.trim() ?? "";
    if (!specialtyLink) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bprSpecialtyCheckLink"],
        message: "Посилання для перевірки спеціальності є обов'язковим, коли увімкнено «Бали БПР».",
      });
    }

    const testLink = data.bprTestLink?.trim() ?? "";
    if (!testLink) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bprTestLink"],
        message: "Посилання для тесту є обов'язковим, коли увімкнено «Бали БПР».",
      });
    }
  });

export const templateCreateSchema = z.object({
  schoolId: z.string().trim().min(1, "Оберіть школу"),
  code: z.string().trim().regex(templateCodeRegex, "Невірний формат коду шаблону"),
  text: z.string().trim().min(1, "Текст шаблону є обов'язковим"),
  description: z.string().trim().optional().or(z.literal("")),
});

export const templateUpdateSchema = templateCreateSchema.omit({ schoolId: true }).partial();

export const applicationStatusEnum = z.enum(["new", "submitted", "approved", "rejected"]);
export const applicationUpdateSchema = z.object({
  status: applicationStatusEnum.optional(),
});

export type SchoolCreateInput = z.infer<typeof schoolCreateSchema>;
export type SchoolUpdateInput = z.infer<typeof schoolUpdateSchema>;
export type CourseCreateInput = z.infer<typeof courseCreateSchema>;
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;
