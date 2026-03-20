import { SessionStep, type CertificateFormat, type Prisma } from "@prisma/client";

import { resolvePublicAppBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { routes } from "@/lib/routes";
import { AppError } from "@/services/errors";
import type { TelegramClient } from "@/services/telegram/telegram-client";
import type {
  DialogCourseState,
  DialogState,
  Q7SubStep,
  TelegramIncoming,
} from "@/services/telegram/types";
import {
  sendChatProofWithFallbacks,
  type SendMessageInput,
} from "@/services/telegram/telegram-client";
import type { TelegramInlineKeyboardButton } from "@/services/telegram/telegram-client";
import { enqueueSyncJob, upsertApplicationRow } from "@/services/google-sheets-sync.service";
import type { NovaPoshtaCity, NovaPoshtaWarehouse } from "@/services/nova-poshta.service";
import { searchCities, getWarehouses } from "@/services/nova-poshta.service";
import { revealSchoolCredentials } from "@/services/schools.service";

type SchoolContext = {
  id: string;
  schoolKey: string;
  telegramChatId: string;
  telegramBotToken: string;
};

type DialogProcessInput = {
  school: SchoolContext;
  incoming: TelegramIncoming;
  telegramClient: TelegramClient;
};

const TEMPLATE_FALLBACKS: Record<string, string> = {
  q1_start: "Щоб ввести дані для отримання сертифікату натисніть «Старт» (кнопка нижче).",
  q2_course_intro:
    "Вітаємо Вас із закінченням навчання!\n\nПідкажіть, будь ласка, з якого курсу бажаєте отримати сертифікат?",
  q3_requirements:
    "Що потрібно для отримання Ваших документів:\n\n{{requirements_text}}\n\nНадішліть скрін, будь ласка. Після кожного скріну можете надіслати ще один або натиснути «Далі».",
  q4_certificate_type:
    "Дуже радіємо, що Ви пройшли цей шлях разом із нами 🥹\n\nОберіть формат сертифіката 👇",
  q4_bpr_question:
    "Підкажіть, будь ласка, чи потрібне Вам нарахування балів БПР?\n\n<i>для нарахування балів БПР важливо, щоб медична освіта та поточна посада входили до переліку спеціальностей, затверджених МОЗ 👉 <a href=\"{{bpr_specialty_check_link}}\">ознайомитися</a></i>\n\nОзнайомтесь з переліком спеціальностей за посиланням. Якщо Ваша спеціальність є в списку, я напишу подальші дії 🤗",
  q4_bpr_test:
    "Пройдіть, будь ласка, тест для нарахування балів БПР👩‍💻 👉 <a href=\"{{bpr_test_link}}\">пройти тест</a>\n\nПісля проходження тестування електронний сертифікат про нарахування балів БПР надішлемо Вам у Telegram протягом 21 дня📩",
  q5_name_ua: "Введіть Ваше ПІБ українською мовою.",
  q6_name_en: "Введіть Ваше ім'я та прізвище англійською мовою.",
  q7_delivery:
    "Оберіть формат доставки:",
  q8_score:
    "Щиро дякуємо, що обрали нашу школу 🥹\n\nНаскільки ймовірно, що ви будете рекомендувати наше навчання?\n\nОберіть оцінку від 1 до 10 ⭐ (кнопки нижче).",
  q9_feedback:
    "Наша команда працює 24/7, аби наше навчання було якісним та професійним — і тут нам дуже важливий ваш зворотний зв'язок та ваша думка, аби покращувати якість навчання та давати саме ті знання, які допоможуть нашим студентам досягати поставлених цілей.\n\nЯкі у Вас враження від курсу?\nЧим навчання було корисним для Вас?\n\n📌 Можна пропустити (кнопка нижче).",
  q10_confirmation:
    "Уважно перевірте введені дані 👇\n\nДалі в повідомленні — зведення ваших відповідей.\n\nЯкщо все вірно, натисніть «Надіслати»; щоб скасувати й почати спочатку — «Видалити».",
  q11_finish:
    "Ваші дані для отримання сертифікату з курсу / сертифікатів з курсів\n«{{course_name}}»\nприйняті в обробку.\n\nПісля перевірки інформації ви отримаєте відповідь.",
  processing_followup: "Будь ласка, очікуйте повідомлення протягом доби. 😊",
  review_site_invite:
    "Будемо вдячні, якщо ви залишите свій відгук також на незалежному сайті 👉 {{review_link}}\n\nВаш досвід може стати корисним і надихнути інших 🫶",
};

function isStartCommand(value: string | null): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "старт" || v === "start";
}

/** Telegram /start або /start@BotName (опційно аргументи після пробілу) — скидання діалогу. */
function isSlashStartCommand(value: string | null): boolean {
  if (!value) return false;
  const first = value.trim().split(/\s+/)[0] ?? "";
  return /^\/start(?:@[A-Za-z0-9_]+)?$/i.test(first);
}

const Q1_START_REPLY_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [[{ text: "Старт", callback_data: "старт" }]],
};

/** Питання 3 (work-scope): після скріну — «Далі» інлайн. */
const Q3_NEXT_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [[{ text: "➡️ Далі", callback_data: "q3_next" }]],
};

/** Питання 4: формат сертифіката (docs/work-scope.md). */
const Q4_CERT_FORMAT_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [
    [{ text: "📄 Електронний", callback_data: "cert_elec" }],
    [{ text: "📦 Фізичний", callback_data: "cert_phys" }],
    [{ text: "📦+📄 Обидва", callback_data: "cert_both" }],
  ],
};

/** Після п.4 (work-scope): можна обрати кілька курсів */
const Q4_AFTER_FORMAT_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [
    [{ text: "➕ Обрати ще курс", callback_data: "q4_add_course" }],
    [{ text: "➡️ Перейти далі", callback_data: "q4_continue" }],
  ],
};

const Q7_DELIVERY_FORMAT_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [
    [{ text: "📄 Електронний", callback_data: "q7_delivery_electronic" }],
    [{ text: "📦 Фізичний", callback_data: "q7_delivery_physical" }],
  ],
};

const Q7_UA_ABROAD_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [
    [{ text: "🇺🇦 По Україні", callback_data: "q7_ua" }],
    [{ text: "🌍 За кордон", callback_data: "q7_abroad" }],
  ],
};

const Q4_BPR_YESNO_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [
    [{ text: "Так", callback_data: "q4_bpr_yes" }],
    [{ text: "Ні", callback_data: "q4_bpr_no" }],
  ],
};

/** Питання 8: оцінка 1–10 (зірочки на кнопках). */
function scoreReplyMarkup(): NonNullable<SendMessageInput["replyMarkup"]> {
  // Telegram inline keyboard doesn't support "button spanning", so we approximate
  // the "bigger 10" by putting it as a single button row (wider than 3-per-row).
  const toBtn = (n: number) => ({
    text: `${n}⭐`,
    callback_data: `rate_${n}`,
  });

  const row1 = [1, 2, 3].map(toBtn);
  const row2 = [4, 5, 6].map(toBtn);
  const row3 = [7, 8, 9].map(toBtn);
  const row10 = [10].map(toBtn);

  return { inline_keyboard: [row1, row2, row3, row10] };
}

/** Питання 9: можна пропустити (work-scope). */
const Q9_SKIP_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [[{ text: "⏭️ Пропустити", callback_data: "q9_skip" }]],
};

/** Питання 10: Надіслати / Видалити. */
const Q10_CONFIRM_MARKUP: NonNullable<SendMessageInput["replyMarkup"]> = {
  inline_keyboard: [
    [{ text: "✅ Надіслати", callback_data: "q10_send" }],
    [{ text: "🗑️ Видалити", callback_data: "q10_delete" }],
  ],
};

function isQ3Done(replyValue: string | null): boolean {
  if (!replyValue) return false;
  if (replyValue === "q3_next") return true;
  return replyValue.toLowerCase() === "далі";
}

function coursesAreElectronicOnly(courses: DialogCourseState[]): boolean {
  return (
    courses.length > 0 &&
    // Respect any already chosen `selectedFormat` (e.g. user selected "physical/both"),
    // otherwise the bot can overwrite the user's choice when adding more courses.
    courses.every((c) => normalizeCertFormatToEn(c.selectedFormat ?? c.certificateType) === "electronic")
  );
}

function normalizeCertFormatToEn(value: string | undefined): "electronic" | "physical" | "both" | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;

  // Canonical english
  if (v === "electronic" || v === "electronic-only") return "electronic";
  if (v === "physical" || v === "physical-only") return "physical";
  if (v === "both") return "both";

  // Ukrainian variants (from course/certificateType column)
  if (v.includes("фізич")) return "physical";
  if (v.includes("електрон")) {
    // if it also contains physical bits, treat as "both"
    if (v.includes("фізич")) return "both";
    return "electronic";
  }
  if (v.includes("обидв") || v.includes("разом")) return "both";

  return null;
}

function parseCertFormatReply(replyValue: string): "electronic" | "physical" | "both" | null {
  if (replyValue === "cert_elec") return "electronic";
  if (replyValue === "cert_phys") return "physical";
  if (replyValue === "cert_both") return "both";
  const value = replyValue.toLowerCase();
  if (value.includes("обидва") || value === "both") return "both";
  if (value.includes("фіз") || value === "physical") return "physical";
  if (value.includes("елект") || value === "electronic") return "electronic";
  return null;
}

function normalizeCertFormatForEnComparison(
  value: string | undefined,
): "electronic" | "physical" | "both" | null {
  return normalizeCertFormatToEn(value);
}

function parseRecommendationScore(replyValue: string | null): number | null {
  if (!replyValue) return null;
  const m = /^rate_(\d+)$/.exec(replyValue);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 10) return n;
  }
  const n = Number(replyValue);
  if (Number.isInteger(n) && n >= 1 && n <= 10) return n;
  return null;
}

const STEP_ORDER: SessionStep[] = [
  "q1_start",
  "q2_course",
  "q3_screenshots",
  "q4_certificate_type",
  "q4_bpr_question",
  "q4_add_more_courses",
  "q5_name_ua",
  "q6_name_en",
  "q7_delivery",
  "q8_score",
  "q9_feedback",
  "q10_confirmation",
  "q11_finish",
];

function nextStep(step: SessionStep): SessionStep {
  const index = STEP_ORDER.indexOf(step);
  if (index < 0 || index === STEP_ORDER.length - 1) {
    return "q11_finish";
  }
  return STEP_ORDER[index + 1];
}

function asDialogState(state: Prisma.JsonValue): DialogState {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { started: false, selectedCourses: [], screenshotFileIds: [] };
  }
  const typed = state as Partial<DialogState>;
  return {
    started: Boolean(typed.started),
    selectedCourses: Array.isArray(typed.selectedCourses) ? typed.selectedCourses : [],
    screenshotFileIds: Array.isArray(typed.screenshotFileIds) ? typed.screenshotFileIds : [],
    studentNameUa: typed.studentNameUa,
    studentNameEn: typed.studentNameEn,
    deliveryMode: typed.deliveryMode,
    deliveryCity: typed.deliveryCity,
    deliveryBranch: typed.deliveryBranch,
    deliveryAddress: typed.deliveryAddress,
    deliveryCountry: typed.deliveryCountry,
    deliveryPhone: typed.deliveryPhone,
    deliveryEmail: typed.deliveryEmail,
    score: typed.score,
    feedbackText: typed.feedbackText,
    q7SubStep: typed.q7SubStep as Q7SubStep | undefined,
    q7CityRef: typed.q7CityRef,
    q7CityQuery: typed.q7CityQuery,
    q7WarehouseQuery: typed.q7WarehouseQuery,
    q7CityPage: typeof typed.q7CityPage === "number" ? typed.q7CityPage : undefined,
    q7WarehousePage: typeof typed.q7WarehousePage === "number" ? typed.q7WarehousePage : undefined,
  };
}

const NP_CITY_PAGE_SIZE = 15;
const NP_CITY_BTN_TEXT_MAX = 60;

function buildCityChoiceKeyboard(cities: NovaPoshtaCity[], page: number): TelegramInlineKeyboardButton[][] {
  const totalPages = Math.max(1, Math.ceil(cities.length / NP_CITY_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * NP_CITY_PAGE_SIZE;
  const slice = cities.slice(start, start + NP_CITY_PAGE_SIZE);
  const rows: TelegramInlineKeyboardButton[][] = slice.map((c) => {
    let label = c.name || c.ref;
    if (label.length > NP_CITY_BTN_TEXT_MAX) {
      label = `${label.slice(0, NP_CITY_BTN_TEXT_MAX - 1)}…`;
    }
    return [{ text: label, callback_data: `np_city:${c.ref}` }];
  });
  const navRow: TelegramInlineKeyboardButton[] = [];
  if (safePage > 0) {
    navRow.push({ text: "⬅️ Назад", callback_data: "np_city_prev" });
  }
  if (start + NP_CITY_PAGE_SIZE < cities.length) {
    navRow.push({ text: "➡️ Далі", callback_data: "np_city_next" });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }
  return rows;
}

// Telegram UI stays readable: show only a few variants per page.
const NP_WAREHOUSE_PAGE_SIZE = 3;
const NP_WH_BTN_TEXT_MAX = 60;

function buildWarehouseChoiceKeyboard(
  warehouses: NovaPoshtaWarehouse[],
  page: number,
): TelegramInlineKeyboardButton[][] {
  const totalPages = Math.max(1, Math.ceil(warehouses.length / NP_WAREHOUSE_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * NP_WAREHOUSE_PAGE_SIZE;
  const slice = warehouses.slice(start, start + NP_WAREHOUSE_PAGE_SIZE);
  const rows: TelegramInlineKeyboardButton[][] = slice.map((w) => {
    let label = w.description || w.ref;
    if (label.length > NP_WH_BTN_TEXT_MAX) {
      label = `${label.slice(0, NP_WH_BTN_TEXT_MAX - 1)}…`;
    }
    return [{ text: label, callback_data: `np_wh:${w.ref}` }];
  });
  const navRow: TelegramInlineKeyboardButton[] = [];
  if (safePage > 0) {
    navRow.push({ text: "⬅️ Назад", callback_data: "np_wh_prev" });
  }
  if (start + NP_WAREHOUSE_PAGE_SIZE < warehouses.length) {
    navRow.push({ text: "➡️ Далі", callback_data: "np_wh_next" });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }
  rows.push([{ text: "📝 Ввести інший номер", callback_data: "np_wh_requery" }]);
  rows.push([{ text: "🔙 Обрати інше місто", callback_data: "np_city_repick" }]);
  return rows;
}

function normalizeWarehouseNumberQuery(raw: string): {
  trimmed: string;
  digitsOnly: string;
  lower: string;
} {
  const trimmed = (raw ?? "").trim();
  const digitsOnly = trimmed.replace(/\D+/g, "");
  return { trimmed, digitsOnly, lower: trimmed.toLowerCase() };
}

function filterWarehousesByUserQuery(
  warehouses: NovaPoshtaWarehouse[],
  queryRaw: string,
): NovaPoshtaWarehouse[] {
  const { digitsOnly, lower, trimmed } = normalizeWarehouseNumberQuery(queryRaw);
  if (!trimmed) return [];

  if (digitsOnly) {
    return warehouses.filter((w) => {
      const wNum = w.number ? String(w.number).replace(/\D+/g, "") : "";
      const wDesc = String(w.description ?? "").toLowerCase();
      // Try matching by:
      // 1) exact/partial Number
      // 2) substring in description
      // This is intentionally tolerant because user may type parts.
      return (wNum && wNum.includes(digitsOnly)) || wDesc.includes(digitsOnly) || wDesc.includes(lower);
    });
  }

  // No digits: fallback to description/text match.
  return warehouses.filter((w) => {
    const wDesc = String(w.description ?? "").toLowerCase();
    const wNum = w.number ? String(w.number).toLowerCase() : "";
    return wDesc.includes(lower) || wNum.includes(lower);
  });
}

async function getTemplateText(schoolId: string, code: string, fallback: string): Promise<string> {
  const template = await prisma.messageTemplate.findUnique({
    where: { schoolId_code: { schoolId, code } },
    select: { text: true },
  });
  return template?.text ?? fallback;
}

function pickTextOrCallback(incoming: TelegramIncoming): string | null {
  const raw = incoming.text ?? incoming.callbackData ?? null;
  if (raw === null) return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/** Видалити повідомлення зі списком (callback) і надіслати нове — щоб не засмічувати чат при «Далі/Назад». */
async function replaceCallbackListMessage(
  telegramClient: TelegramClient,
  botToken: string,
  incoming: TelegramIncoming,
  next: { text: string; replyMarkup: NonNullable<SendMessageInput["replyMarkup"]> },
): Promise<void> {
  if (incoming.updateType === "callback_query" && incoming.callbackMessageId != null) {
    await telegramClient.deleteMessage({
      botToken,
      chatId: incoming.chatId,
      messageId: incoming.callbackMessageId,
    });
  }
  await telegramClient.sendMessage({
    botToken,
    chatId: incoming.chatId,
    text: next.text,
    replyMarkup: next.replyMarkup,
  });
}

async function sendTemplateMessage(
  school: SchoolContext,
  telegramClient: TelegramClient,
  chatId: string,
  templateCode: string,
  fallback: string,
  variables: Record<string, string> = {},
  replyMarkup?: SendMessageInput["replyMarkup"],
  parseMode?: SendMessageInput["parseMode"],
) {
  const template = await getTemplateText(school.id, templateCode, fallback);
  const resolvedText = Object.entries(variables).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{{${key}}}`, value);
  }, template);
  // Telegram API requires `text` to be non-empty; it rejects whitespace-only strings.
  // Keep this step "buttons only" by using an invisible char when needed.
  const text = resolvedText.trim().length === 0 ? "\u200B" : resolvedText;
  await telegramClient.sendMessage({
    botToken: school.telegramBotToken,
    chatId,
    text,
    replyMarkup,
    parseMode,
  });
}

async function loadCourseBySelection(schoolId: string, selection: string): Promise<DialogCourseState | null> {
  const s = selection.trim();
  if (!s) {
    return null;
  }
  const course = await prisma.course.findFirst({
    where: {
      schoolId,
      OR: [{ id: s }, { title: s }],
    },
    select: {
      id: true,
      title: true,
      certificateType: true,
      daysToSend: true,
      reviewLink: true,
      bprEnabled: true,
      bprSpecialtyCheckLink: true,
      bprTestLink: true,
      requirementsText: true,
    },
  });
  if (!course) {
    return null;
  }
  return {
    courseId: course.id,
    title: course.title,
    certificateType:
      normalizeCertFormatForEnComparison(course.certificateType) ?? (course.certificateType as DialogCourseState["certificateType"]),
    daysToSend: course.daysToSend,
    reviewLink: course.reviewLink,
    bprEnabled: course.bprEnabled,
    bprSpecialtyCheckLink: course.bprSpecialtyCheckLink,
    bprTestLink: course.bprTestLink,
    requirementsText: course.requirementsText,
  };
}

const MAX_COURSES_INLINE = 100;
const TELEGRAM_INLINE_BTN_TEXT_MAX = 64;

async function courseSelectionReplyMarkup(
  schoolId: string,
): Promise<{ replyMarkup: SendMessageInput["replyMarkup"] | undefined; courseCount: number }> {
  const courses = await prisma.course.findMany({
    where: { schoolId },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
    take: MAX_COURSES_INLINE,
  });
  if (courses.length === 0) {
    return { replyMarkup: undefined, courseCount: 0 };
  }
  return {
    replyMarkup: {
      inline_keyboard: courses.map((c) => [
        {
          text:
            c.title.length > TELEGRAM_INLINE_BTN_TEXT_MAX
              ? `${c.title.slice(0, TELEGRAM_INLINE_BTN_TEXT_MAX - 1)}…`
              : c.title,
          callback_data: c.id,
        },
      ]),
    },
    courseCount: courses.length,
  };
}

async function sendQ2CourseIntro(
  school: SchoolContext,
  telegramClient: TelegramClient,
  chatId: string,
) {
  const { replyMarkup, courseCount } = await courseSelectionReplyMarkup(school.id);
  await sendTemplateMessage(
    school,
    telegramClient,
    chatId,
    "q2_course_intro",
    TEMPLATE_FALLBACKS.q2_course_intro,
    {},
    replyMarkup,
  );
  if (courseCount === 0) {
    await telegramClient.sendMessage({
      botToken: school.telegramBotToken,
      chatId,
      text: "Наразі немає доступних курсів у цій школі. Зверніться до адміністратора.",
    });
  }
}

async function finalizeApplication(
  school: SchoolContext,
  sessionId: string,
  chatId: string,
  telegramUserId: string,
  telegramUsername: string | null,
  dialogState: DialogState,
) {
  if (!dialogState.studentNameUa || !dialogState.studentNameEn) {
    throw new AppError("Відсутні обов'язкові дані ПІБ", 400, "missing_names");
  }
  if (!dialogState.selectedCourses.length) {
    throw new AppError("Не обрано жодного курсу", 400, "missing_courses");
  }

  const created = await prisma.application.create({
    data: {
      schoolId: school.id,
      sessionId,
      telegramUserId,
      telegramUsername: telegramUsername ?? undefined,
      chatId,
      studentNameUa: dialogState.studentNameUa,
      studentNameEn: dialogState.studentNameEn,
      deliveryMode: dialogState.deliveryMode ?? "none",
      deliveryCity: dialogState.deliveryCity,
      deliveryBranch: dialogState.deliveryBranch,
      deliveryAddress: dialogState.deliveryAddress,
      deliveryCountry: dialogState.deliveryCountry,
      deliveryPhone: dialogState.deliveryPhone,
      deliveryEmail: dialogState.deliveryEmail,
      score: dialogState.score,
      feedbackText: dialogState.feedbackText,
      status: "submitted",
      courses: {
        create: dialogState.selectedCourses.map((course) => ({
          courseId: course.courseId,
          certificateFormat: (course.selectedFormat ?? course.certificateType) as CertificateFormat,
          // User choice stored during q4_bpr_question.
          bprRequired: course.bprEnabled,
        })),
      },
      screenshots: {
        create: dialogState.screenshotFileIds.map((fileId, index) => ({
          fileId,
          sortOrder: index,
        })),
      },
    },
    include: {
      courses: {
        include: {
          course: {
            select: {
              title: true,
            },
          },
        },
      },
      screenshots: {
        orderBy: { sortOrder: "asc" },
        select: { fileId: true },
      },
    },
  });

  try {
    await enqueueSyncJob(school.id, created.id);
    // Best-effort immediate write to keep Google Sheets in near real-time.
    // If it fails (missing credentials / Sheets error), we still keep the queued job.
    try {
      await upsertApplicationRow(school.id, created.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Realtime Google Sheets upsert failed", {
        schoolId: school.id,
        applicationId: created.id,
        message,
      });
    }
  } catch {
    // Sync may fail if GOOGLE_SERVICE_ACCOUNT_JSON is not configured
  }

  return created;
}

const TELEGRAM_SAFE_MESSAGE_LEN = 3900;

function formatCertFormatUk(f: string | undefined): string {
  const v = (f ?? "").toLowerCase();
  if (v === "electronic") return "електронний";
  if (v === "physical") return "фізичний";
  if (v === "both") return "електронний + фізичний";
  return f?.trim() ? f : "—";
}

/** Зведення відповідей для кроку підтвердження (work-scope п.10). */
function buildUserConfirmationSummary(state: DialogState): string {
  const lines: string[] = [];

  if (state.selectedCourses.length > 0) {
    lines.push("📚 Курси:");
    for (const c of state.selectedCourses) {
      const fmt = formatCertFormatUk(c.selectedFormat ?? c.certificateType);
      const bprMark = c.bprEnabled ? " (БПР)" : "";
      lines.push(`  • ${c.title} — ${fmt}${bprMark}`);
    }
  } else {
    lines.push("📚 Курси: —");
  }

  lines.push(`📎 Скрінів надіслано: ${state.screenshotFileIds.length}`);
  lines.push(`👤 ПІБ (українською): ${state.studentNameUa?.trim() || "—"}`);
  lines.push(`👤 ПІБ (англійською): ${state.studentNameEn?.trim() || "—"}`);

  const anyBprEnabled = state.selectedCourses.some((c) => c.bprEnabled);
  lines.push(`🧮 БПР: ${anyBprEnabled ? "потрібне" : "не потрібне"}`);
  if (anyBprEnabled) {
    for (const c of state.selectedCourses) {
      if (!c.bprEnabled) continue;
      const specLink = c.bprSpecialtyCheckLink?.trim() || "—";
      const testLink = c.bprTestLink?.trim() || "—";
      // Keep URLs as plain text; Telegram will wrap if needed.
      lines.push(`   • ${c.title}: перевірка спец — ${specLink}; тест — ${testLink}`);
    }
  }

  const mode = state.deliveryMode ?? "none";
  if (mode === "ua") {
    lines.push("📦 Доставка: по Україні (Нова Пошта)");
    lines.push(`   Місто: ${state.deliveryCity?.trim() || "—"}`);
    lines.push(`   Відділення: ${state.deliveryBranch?.trim() || "—"}`);
  } else if (mode === "abroad") {
    lines.push("📦 Доставка: за кордон");
    const addr = state.deliveryAddress?.trim();
    if (addr) {
      lines.push(`   Дані для ТТН / адреса:\n${addr}`);
    }
    const city = state.deliveryCity?.trim();
    const country = state.deliveryCountry?.trim();
    const phone = state.deliveryPhone?.trim();
    const email = state.deliveryEmail?.trim();
    if (city && city !== "—") lines.push(`   Місто: ${city}`);
    if (country && country !== "—") lines.push(`   Країна: ${country}`);
    if (phone && phone !== "—") lines.push(`   Телефон: ${phone}`);
    if (email && email !== "—") lines.push(`   Email: ${email}`);
  } else {
    lines.push("📦 Доставка: не потрібна (лише електронний сертифікат або не застосовується)");
  }

  lines.push(`⭐ Оцінка (1–10): ${state.score != null ? String(state.score) : "—"}`);
  const fb = state.feedbackText?.trim();
  lines.push(`💬 Відгук: ${fb ? fb : "не вказано (пропущено)"}`);

  return lines.join("\n");
}

async function buildQ10ConfirmationBodyText(
  schoolId: string,
  dialogState: DialogState,
): Promise<string> {
  const intro = await getTemplateText(schoolId, "q10_confirmation", TEMPLATE_FALLBACKS.q10_confirmation);
  const summary = buildUserConfirmationSummary(dialogState);
  return `${intro.trim()}\n\n────────────\n${summary}`;
}

async function formatQ10ConfirmationBody(schoolId: string, dialogState: DialogState): Promise<string> {
  let text = await buildQ10ConfirmationBodyText(schoolId, dialogState);
  if (text.length > TELEGRAM_SAFE_MESSAGE_LEN) {
    text = `${text.slice(0, TELEGRAM_SAFE_MESSAGE_LEN - 20)}\n\n… (текст обрізано)`;
  }
  return text;
}

/** Текст як у q10 + файли-скріни в канал школи (school.telegramChatId). */
async function sendNewApplicationDigestToSchoolChannel(
  school: SchoolContext,
  telegramClient: TelegramClient,
  application: { id: string; screenshots: Array<{ fileId: string }> },
  dialogState: DialogState,
  meta: { telegramUserId: string; telegramUsername: string | null; chatId: string },
): Promise<void> {
  const bodyUnbounded = await buildQ10ConfirmationBodyText(school.id, dialogState);
  const userLine =
    meta.telegramUsername != null && meta.telegramUsername.trim().length > 0
      ? `@${meta.telegramUsername.trim()} (id ${meta.telegramUserId})`
      : `id ${meta.telegramUserId}`;
  const header = "✅ Нова заявка (користувач підтвердив у боті)";
  const baseUrl = resolvePublicAppBaseUrl();
  const adminUrl = baseUrl ? `${baseUrl}${routes.admin.applicationDetail(application.id)}` : null;
  if (adminUrl === null) {
    logger.warn("telegram.channel_digest_no_public_app_url", {
      applicationId: application.id,
      schoolId: school.id,
    });
  }
  const metaLines: string[] = [];
  if (adminUrl) {
    metaLines.push(`🔗 Відкрити в адмінці: ${adminUrl}`);
  }
  metaLines.push(`Заявка: ${application.id}`);
  metaLines.push(`Користувач: ${userLine}`);
  metaLines.push(`Чат: ${meta.chatId}`);
  const prefix = `${header}\n\n${metaLines.join("\n")}\n\n────────────\n\n`;
  const maxBody = TELEGRAM_SAFE_MESSAGE_LEN - prefix.length - 32;
  const truncNote = "\n\n… (текст обрізано)";
  let bodyForChannel: string;
  if (bodyUnbounded.length <= maxBody) {
    bodyForChannel = bodyUnbounded;
  } else {
    const sliceBudget = Math.max(0, maxBody - truncNote.length);
    bodyForChannel =
      sliceBudget > 0 ? `${bodyUnbounded.slice(0, sliceBudget)}${truncNote}` : truncNote.replace(/^\n+/, "");
  }
  const full = `${prefix}${bodyForChannel}`;
  try {
    await telegramClient.sendMessage({
      botToken: school.telegramBotToken,
      chatId: school.telegramChatId,
      text: full,
      ...(adminUrl
        ? {
            replyMarkup: {
              inline_keyboard: [[{ text: "Відкрити заявку в адмінці", url: adminUrl }]],
            },
          }
        : {}),
    });
  } catch (e) {
    logger.error("telegram.channel_digest_header_send_failed", {
      applicationId: application.id,
      schoolId: school.id,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const ids = application.screenshots.map((s) => s.fileId).filter((id) => id.length > 0);
  if (ids.length === 0 && dialogState.screenshotFileIds.length > 0) {
    logger.warn("telegram.channel_digest_screenshots_mismatch", {
      applicationId: application.id,
      sessionFileCount: dialogState.screenshotFileIds.length,
    });
  }
  // Combine screenshots into albums to avoid sending one message per image.
  // Telegram allows sendMediaGroup with 2-10 items; for 1 item we keep the old fallback.
  if (ids.length === 1) {
    await sendChatProofWithFallbacks(telegramClient, fetch, {
      botToken: school.telegramBotToken,
      chatId: school.telegramChatId,
      fileId: ids[0]!,
      caption: `📎 Доказ 1/1`,
    });
  } else if (ids.length > 1) {
    const MAX_PER_ALBUM = 10;
    const total = ids.length;
    for (let start = 0; start < ids.length; start += MAX_PER_ALBUM) {
      const chunk = ids.slice(start, start + MAX_PER_ALBUM);
      const media = chunk.map((fileId, idx) => ({
        type: "photo" as const,
        media: fileId!,
        // Keep captions only on the first item to avoid noisy multi-caption albums.
        caption: idx === 0 ? `📎 Доказ ${start + 1}/${total}` : undefined,
      }));

      try {
        await telegramClient.sendMediaGroup({
          botToken: school.telegramBotToken,
          chatId: school.telegramChatId,
          media,
        });
      } catch {
        // If some file_ids aren't compatible as "photo" in media group (or Telegram rejects),
        // fall back to the previous robust per-file logic.
        for (let i = 0; i < chunk.length; i++) {
          await sendChatProofWithFallbacks(telegramClient, fetch, {
            botToken: school.telegramBotToken,
            chatId: school.telegramChatId,
            fileId: chunk[i]!,
            caption: `📎 Доказ ${start + i + 1}/${total}`,
          });
        }
      }
    }
  }
}

async function sendQ10ConfirmationPrompt(
  school: SchoolContext,
  telegramClient: TelegramClient,
  chatId: string,
  dialogState: DialogState,
  options: { attachScreenshots?: boolean } = {},
) {
  const { attachScreenshots = false } = options;

  if (attachScreenshots) {
    const ids = [...new Set(dialogState.screenshotFileIds)].filter((id) => id.length > 0);
    if (ids.length === 1) {
      // Альбом неможливо відправити з 1 елементом, тому використовуємо sendPhoto/sendDocument фолбек.
      await sendChatProofWithFallbacks(telegramClient, fetch, {
        botToken: school.telegramBotToken,
        chatId,
        fileId: ids[0]!,
        caption: `📎 Скрін для заявки 1/1`,
      });
    } else if (ids.length > 1) {
      // sendMediaGroup дозволяє від 2 до 10 елементів.
      const MAX_PER_ALBUM = 10;
      const total = ids.length;
      for (let start = 0; start < ids.length; start += MAX_PER_ALBUM) {
        const chunk = ids.slice(start, start + MAX_PER_ALBUM);
        const media = chunk.map((fileId, idx) => ({
          type: "photo" as const,
          media: fileId!,
          // Капшен ставимо лише на перший елемент, щоб не спамити.
          caption: idx === 0 ? `📎 Скрін для заявки ${start + 1}/${total}` : undefined,
        }));

        try {
          await telegramClient.sendMediaGroup({
            botToken: school.telegramBotToken,
            chatId,
            media,
          });
        } catch (e) {
          // Якщо по якійсь причині альбом не відправився (типи медіа/помилка Telegram),
          // фолбекнемо на відправку по одному.
          for (let i = 0; i < chunk.length; i++) {
            await sendChatProofWithFallbacks(telegramClient, fetch, {
              botToken: school.telegramBotToken,
              chatId,
              fileId: chunk[i]!,
              caption: `📎 Скрін для заявки ${start + i + 1}/${total}`,
            });
          }
        }
      }
    }
  }

  const text = await formatQ10ConfirmationBody(school.id, dialogState);
  await telegramClient.sendMessage({
    botToken: school.telegramBotToken,
    chatId,
    text,
    replyMarkup: Q10_CONFIRM_MARKUP,
  });
}

/** Повідомлення після прийому заявки + за work-scope при оцінці 10 — запрошення на відгук за посиланням курсу. */
async function sendApplicationSubmittedFollowups(
  school: SchoolContext,
  telegramClient: TelegramClient,
  chatId: string,
  dialogState: DialogState,
) {
  const wait = await getTemplateText(
    school.id,
    "processing_followup",
    TEMPLATE_FALLBACKS.processing_followup,
  );
  await telegramClient.sendMessage({
    botToken: school.telegramBotToken,
    chatId,
    text: wait.trim(),
  });
  if (dialogState.score === 10) {
    const reviewLink =
      dialogState.selectedCourses.map((c) => c.reviewLink).find((u) => u && String(u).trim().length > 0) ?? "";
    if (reviewLink) {
      const tpl = await getTemplateText(
        school.id,
        "review_site_invite",
        TEMPLATE_FALLBACKS.review_site_invite,
      );
      const text = tpl.replaceAll("{{review_link}}", String(reviewLink).trim());
      await telegramClient.sendMessage({
        botToken: school.telegramBotToken,
        chatId,
        text: text.trim(),
      });
    }
  }
}

export async function processTelegramDialog(input: DialogProcessInput) {
  const { school, incoming, telegramClient } = input;

  const session = await prisma.userSession.upsert({
    where: {
      schoolId_chatId: {
        schoolId: school.id,
        chatId: incoming.chatId,
      },
    },
    update: {
      telegramUserId: incoming.telegramUserId,
      telegramUsername: incoming.telegramUsername ?? undefined,
    },
    create: {
      schoolId: school.id,
      chatId: incoming.chatId,
      telegramUserId: incoming.telegramUserId,
      telegramUsername: incoming.telegramUsername ?? undefined,
      state: {
        started: false,
        selectedCourses: [],
        screenshotFileIds: [],
      },
    },
  });

  const state = asDialogState(session.state);
  const replyValue = pickTextOrCallback(incoming);

  if (incoming.updateType === "message" && isSlashStartCommand(replyValue)) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        currentStep: "q1_start",
        state: {
          started: false,
          selectedCourses: [],
          screenshotFileIds: [],
        },
      },
    });
    await sendTemplateMessage(
      school,
      telegramClient,
      incoming.chatId,
      "q1_start",
      TEMPLATE_FALLBACKS.q1_start,
      {},
      Q1_START_REPLY_MARKUP,
    );
    return;
  }

  switch (session.currentStep) {
    case "q1_start": {
      if (!isStartCommand(replyValue)) {
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q1_start",
          TEMPLATE_FALLBACKS.q1_start,
          {},
          Q1_START_REPLY_MARKUP,
        );
        return;
      }
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: "q2_course",
          state: { ...state, started: true },
        },
      });
      await sendQ2CourseIntro(school, telegramClient, incoming.chatId);
      return;
    }
    case "q2_course": {
      if (!replyValue) {
        await sendQ2CourseIntro(school, telegramClient, incoming.chatId);
        return;
      }

      /** Старе повідомлення з кнопкою «Старт» лишається в чаті; повторний тиск шле callback_data «старт», а не id курсу. */
      if (isStartCommand(replyValue)) {
        await sendQ2CourseIntro(school, telegramClient, incoming.chatId);
        return;
      }

      const course = await loadCourseBySelection(school.id, replyValue);
      if (!course) {
        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: "Курс не знайдено. Оберіть кнопкою нижче або надішліть точну назву курсу.",
        });
        await sendQ2CourseIntro(school, telegramClient, incoming.chatId);
        return;
      }
      if (state.selectedCourses.some((c) => c.courseId === course.courseId)) {
        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: "Цей курс уже додано до заявки. Оберіть інший курс або поверніться до кроку «Перейти далі».",
        });
        await sendQ2CourseIntro(school, telegramClient, incoming.chatId);
        return;
      }

      const nextState: DialogState = {
        ...state,
        selectedCourses: [...state.selectedCourses, course],
      };
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: "q3_screenshots",
          state: nextState as Prisma.InputJsonValue,
        },
      });

      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        "q3_requirements",
        TEMPLATE_FALLBACKS.q3_requirements,
        { requirements_text: course.requirementsText },
        Q3_NEXT_MARKUP,
      );
      return;
    }
    case "q3_screenshots": {
      const batch = incoming.batchedScreenshotFileIds ?? [];
      const single = incoming.screenshotFileId ? [incoming.screenshotFileId] : [];
      const additions = [...new Set([...batch, ...single])];
      if (additions.length > 0) {
        const updated: DialogState = {
          ...state,
          screenshotFileIds: [...state.screenshotFileIds, ...additions],
        };
        await prisma.userSession.update({
          where: { id: session.id },
          data: { state: updated as Prisma.InputJsonValue },
        });
        const n = additions.length;
        const text =
          n > 1
            ? `Збережено ${n} скрін(ів). Можете надіслати ще або натиснути «Далі».`
            : "Скрін збережено. Можете надіслати ще скрін або натиснути «Далі».";
        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text,
          replyMarkup: Q3_NEXT_MARKUP,
        });
        return;
      }

      if (!isQ3Done(replyValue)) {
        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: "Надішліть скрін виконаного завдання згідно з вимогами вище, або натисніть «Далі», коли все буде готово.",
          replyMarkup: Q3_NEXT_MARKUP,
        });
        return;
      }

      const pickedCourses = state.selectedCourses;
      if (coursesAreElectronicOnly(pickedCourses)) {
        // If user already selected a format for any course, do not overwrite it.
        const selectedCourses = pickedCourses.map((c) => ({
          ...c,
          selectedFormat: (c.selectedFormat ?? ("electronic" as const)) as DialogCourseState["selectedFormat"],
        }));
        const lastCourse = selectedCourses[selectedCourses.length - 1];
        if (lastCourse?.bprEnabled) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              currentStep: "q4_bpr_question",
              state: { ...state, selectedCourses } as Prisma.InputJsonValue,
            },
          });

          await sendTemplateMessage(
            school,
            telegramClient,
            incoming.chatId,
            "q4_bpr_question",
            TEMPLATE_FALLBACKS.q4_bpr_question,
            { bpr_specialty_check_link: lastCourse.bprSpecialtyCheckLink ?? "" },
            Q4_BPR_YESNO_MARKUP,
            "HTML",
          );
        } else {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              currentStep: "q4_add_more_courses",
              state: { ...state, selectedCourses } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Дуже радіємо, що Ви пройшли цей шлях разом із нами 🥹\n\nЗ цього курсу передбачено електронний сертифікат.\n\nМожна отримати сертифікати з кількох курсів — оберіть дію:",
            replyMarkup: Q4_AFTER_FORMAT_MARKUP,
          });
        }
        return;
      }

      await prisma.userSession.update({
        where: { id: session.id },
        data: { currentStep: "q4_certificate_type" },
      });
      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        "q4_certificate_type",
        TEMPLATE_FALLBACKS.q4_certificate_type,
        {},
        Q4_CERT_FORMAT_MARKUP,
      );
      return;
    }
    case "q4_certificate_type": {
      if (!replyValue) {
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q4_certificate_type",
          TEMPLATE_FALLBACKS.q4_certificate_type,
          {},
          Q4_CERT_FORMAT_MARKUP,
        );
        return;
      }
      const selectedFormat = parseCertFormatReply(replyValue);
      if (!selectedFormat) {
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q4_certificate_type",
          TEMPLATE_FALLBACKS.q4_certificate_type,
          {},
          Q4_CERT_FORMAT_MARKUP,
        );
        return;
      }

      const idxLast = state.selectedCourses.length - 1;
      const selectedCourses =
        idxLast >= 0
          ? state.selectedCourses.map((course, idx) =>
              idx === idxLast ? { ...course, selectedFormat } : course,
            )
          : state.selectedCourses;
      const lastCourse = selectedCourses[selectedCourses.length - 1];

      if (lastCourse?.bprEnabled) {
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            currentStep: "q4_bpr_question",
            state: { ...state, selectedCourses } as Prisma.InputJsonValue,
          },
        });

        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q4_bpr_question",
          TEMPLATE_FALLBACKS.q4_bpr_question,
          { bpr_specialty_check_link: lastCourse.bprSpecialtyCheckLink ?? "" },
          Q4_BPR_YESNO_MARKUP,
          "HTML",
        );
        return;
      }

      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: "q4_add_more_courses",
          state: { ...state, selectedCourses } as Prisma.InputJsonValue,
        },
      });
      await telegramClient.sendMessage({
        botToken: school.telegramBotToken,
        chatId: incoming.chatId,
        text: "Можна обрати сертифікати з кількох курсів. Оберіть дію:",
        replyMarkup: Q4_AFTER_FORMAT_MARKUP,
      });
      return;
    }
    case "q4_bpr_question": {
      const idxLast = state.selectedCourses.length - 1;
      const selectedCourses = [...state.selectedCourses];
      const lastCourse = idxLast >= 0 ? selectedCourses[idxLast] : undefined;

      if (!replyValue || !lastCourse) {
        if (!lastCourse) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: { currentStep: "q4_add_more_courses" },
          });
        }

        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q4_bpr_question",
          TEMPLATE_FALLBACKS.q4_bpr_question,
          { bpr_specialty_check_link: lastCourse?.bprSpecialtyCheckLink ?? "" },
          Q4_BPR_YESNO_MARKUP,
          "HTML",
        );
        return;
      }

      if (replyValue !== "q4_bpr_yes" && replyValue !== "q4_bpr_no") {
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q4_bpr_question",
          TEMPLATE_FALLBACKS.q4_bpr_question,
          { bpr_specialty_check_link: lastCourse.bprSpecialtyCheckLink ?? "" },
          Q4_BPR_YESNO_MARKUP,
          "HTML",
        );
        return;
      }

      if (replyValue === "q4_bpr_no") {
        // Persist user choice: "no" disables BPR for this selected course.
        if (idxLast >= 0 && selectedCourses[idxLast]) {
          selectedCourses[idxLast] = {
            ...selectedCourses[idxLast],
            bprEnabled: false,
            bprSpecialtyCheckLink: null,
            bprTestLink: null,
          };
        }
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            currentStep: "q4_add_more_courses",
            state: { ...state, selectedCourses } as Prisma.InputJsonValue,
          },
        });
        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: "Можна обрати сертифікати з кількох курсів. Оберіть дію:",
          replyMarkup: Q4_AFTER_FORMAT_MARKUP,
        });
        return;
      }

      // replyValue === "q4_bpr_yes"
      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        "q4_bpr_test",
        TEMPLATE_FALLBACKS.q4_bpr_test,
        { bpr_test_link: lastCourse.bprTestLink ?? "" },
        undefined,
        "HTML",
      );

      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: "q4_add_more_courses",
          state: { ...state, selectedCourses } as Prisma.InputJsonValue,
        },
      });

      await telegramClient.sendMessage({
        botToken: school.telegramBotToken,
        chatId: incoming.chatId,
        text: "Можна обрати сертифікати з кількох курсів. Оберіть дію:",
        replyMarkup: Q4_AFTER_FORMAT_MARKUP,
      });
      return;
    }
    case "q4_add_more_courses": {
      if (replyValue === "q4_add_course") {
        await prisma.userSession.update({
          where: { id: session.id },
          data: { currentStep: "q2_course" },
        });
        await sendQ2CourseIntro(school, telegramClient, incoming.chatId);
        return;
      }
      if (replyValue === "q4_continue") {
        await prisma.userSession.update({
          where: { id: session.id },
          data: { currentStep: "q5_name_ua" },
        });
        await sendTemplateMessage(school, telegramClient, incoming.chatId, "q5_name_ua", TEMPLATE_FALLBACKS.q5_name_ua);
        return;
      }
      await telegramClient.sendMessage({
        botToken: school.telegramBotToken,
        chatId: incoming.chatId,
        text: "Натисніть «Обрати ще курс», щоб додати курс, або «Перейти далі» для продовження опитування.",
        replyMarkup: Q4_AFTER_FORMAT_MARKUP,
      });
      return;
    }
    case "q5_name_ua": {
      if (!replyValue) {
        await sendTemplateMessage(school, telegramClient, incoming.chatId, "q5_name_ua", TEMPLATE_FALLBACKS.q5_name_ua);
        return;
      }
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: "q6_name_en",
          state: { ...state, studentNameUa: replyValue } as Prisma.InputJsonValue,
        },
      });
      await sendTemplateMessage(school, telegramClient, incoming.chatId, "q6_name_en", TEMPLATE_FALLBACKS.q6_name_en);
      return;
    }
    case "q6_name_en": {
      if (!replyValue) {
        await sendTemplateMessage(school, telegramClient, incoming.chatId, "q6_name_en", TEMPLATE_FALLBACKS.q6_name_en);
        return;
      }
      const needsDelivery = state.selectedCourses.some((course) => {
        const fmt = normalizeCertFormatForEnComparison(course.selectedFormat ?? course.certificateType);
        return fmt === "physical" || fmt === "both";
      });
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: needsDelivery ? "q7_delivery" : "q8_score",
          state: {
            ...state,
            studentNameEn: replyValue,
            deliveryMode: needsDelivery ? state.deliveryMode : "none",
          } as Prisma.InputJsonValue,
        },
      });
      const nextReplyMarkup: SendMessageInput["replyMarkup"] | undefined = needsDelivery
        ? {
            inline_keyboard: [
              [{ text: "📄 Електронний", callback_data: "q7_delivery_electronic" }],
              [{ text: "📦 Фізичний", callback_data: "q7_delivery_physical" }],
            ],
          }
        : scoreReplyMarkup();
      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        needsDelivery ? "q7_delivery" : "q8_score",
        needsDelivery ? TEMPLATE_FALLBACKS.q7_delivery : TEMPLATE_FALLBACKS.q8_score,
        {},
        nextReplyMarkup,
      );
      return;
    }
    case "q7_delivery": {
      const subStep = state.q7SubStep ?? "delivery_format_choice";

      // --- Delivery format: electronic / physical ---
      if (subStep === "delivery_format_choice") {
        const cb = replyValue ?? "";

        if (cb === "q7_delivery_electronic") {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              currentStep: "q8_score",
              state: {
                ...state,
                deliveryMode: "none",
                q7SubStep: undefined,
              } as Prisma.InputJsonValue,
            },
          });

          await sendTemplateMessage(
            school,
            telegramClient,
            incoming.chatId,
            "q8_score",
            TEMPLATE_FALLBACKS.q8_score,
            {},
            scoreReplyMarkup(),
          );
          return;
        }

        if (cb === "q7_delivery_physical") {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                deliveryMode: undefined,
                q7SubStep: "ua_abroad_choice",
              } as Prisma.InputJsonValue,
            },
          });

          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Доставка:",
            replyMarkup: Q7_UA_ABROAD_MARKUP,
          });
          return;
        }
      }

      // --- UA/Abroad choice ---
      if (subStep === "ua_abroad_choice") {
        const cb = replyValue ?? "";
        if (cb === "q7_ua") {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                deliveryMode: "ua",
                q7SubStep: "ua_city_input",
              } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Введіть назву міста для пошуку відділення Нової Пошти.",
          });
          return;
        }
        if (cb === "q7_abroad") {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                deliveryMode: "abroad",
                q7SubStep: "abroad_address",
              } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text:
              "Напишіть, будь ласка, такі дані для створення ТТН 📦 — наш менеджер зв'яжеться з вами:\n\n• ПІБ латиницею\n• Країна\n• Місто\n• Адреса / відділення\n• Телефон\n• Email\n\nМожна одним повідомленням.",
          });
          return;
        }
        // Fallback: treat text as ua/abroad
        const deliveryMode: "ua" | "abroad" =
          (replyValue ?? "").toLowerCase().includes("за") ||
          (replyValue ?? "").toLowerCase().includes("abroad")
            ? "abroad"
            : "ua";
        if (deliveryMode === "abroad") {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: { ...state, deliveryMode, q7SubStep: "abroad_address" } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text:
              "Напишіть, будь ласка, такі дані для створення ТТН 📦 — наш менеджер зв'яжеться з вами:\n\n• ПІБ латиницею\n• Країна\n• Місто\n• Адреса / відділення\n• Телефон\n• Email\n\nМожна одним повідомленням.",
          });
          return;
        }
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            state: {
              ...state,
              deliveryMode: "ua",
              q7SubStep: "ua_city_input",
            } as Prisma.InputJsonValue,
          },
        });
        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: "Введіть назву міста для пошуку відділення Нової Пошти.",
        });
        return;
      }

      // --- Abroad: Electronic/Physical ---
      if (subStep === "abroad_choice") {
        if (replyValue === "q7_abroad_electronic") {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              currentStep: "q8_score",
              state: {
                ...state,
                deliveryMode: "abroad",
                q7SubStep: undefined,
              } as Prisma.InputJsonValue,
            },
          });
          await sendTemplateMessage(
            school,
            telegramClient,
            incoming.chatId,
            "q8_score",
            TEMPLATE_FALLBACKS.q8_score,
            {},
            scoreReplyMarkup(),
          );
          return;
        }
        if (replyValue === "q7_abroad_physical") {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                q7SubStep: "abroad_address",
              } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text:
              "Напишіть, будь ласка, такі дані для створення ТТН 📦 — наш менеджер зв'яжеться з вами:\n\n• ПІБ латиницею\n• Країна\n• Місто\n• Адреса / відділення\n• Телефон\n• Email\n\nМожна одним повідомленням.",
          });
          return;
        }
      }

      // --- Abroad: collect address ---
      if (subStep === "abroad_address") {
        const addr = (replyValue ?? "").trim();
        if (!addr) {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Введіть адресні дані текстом.",
          });
          return;
        }
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            currentStep: "q8_score",
            state: {
              ...state,
              deliveryAddress: addr,
              deliveryCountry: "—",
              deliveryCity: "—",
              deliveryPhone: "—",
              deliveryEmail: "—",
              q7SubStep: undefined,
            } as Prisma.InputJsonValue,
          },
        });
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q8_score",
          TEMPLATE_FALLBACKS.q8_score,
          {},
          scoreReplyMarkup(),
        );
        return;
      }

      // --- UA: введення / уточнення міста текстом (не callback) → пошук у НП ---
      // Тільки message: інакше np_city_next тощо потрапляли б сюди як «текст» callback_data.
      if (
        (subStep === "ua_city_input" ||
          subStep === "ua_city_select" ||
          subStep === "ua_branch_select") &&
        incoming.updateType === "message"
      ) {
        const cityQuery = (replyValue ?? "").trim();
        if (!cityQuery) {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Введіть назву міста.",
          });
          return;
        }
        let npKey: string;
        try {
          const creds = await revealSchoolCredentials(school.id);
          npKey = creds.novaPoshtaApiKey ?? "";
        } catch {
          npKey = "";
        }
        if (!npKey) {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Пошук недоступний. Введіть місто та відділення вручну (наприклад: «Київ, відділення 1»):",
          });
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                q7SubStep: "ua_branch_select",
                deliveryCity: cityQuery,
                deliveryBranch: "(вручну)",
              } as Prisma.InputJsonValue,
            },
          });
          return;
        }
        try {
          const cities = await searchCities(npKey, cityQuery);
          if (cities.length === 0) {
            await telegramClient.sendMessage({
              botToken: school.telegramBotToken,
              chatId: incoming.chatId,
              text: "Міста не знайдено. Спробуйте інший запит.",
            });
            return;
          }
          const totalCityPages = Math.max(1, Math.ceil(cities.length / NP_CITY_PAGE_SIZE));
          const cityButtons = buildCityChoiceKeyboard(cities, 0);
          const clearingNpPick =
            subStep === "ua_city_select" || subStep === "ua_branch_select";
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                q7SubStep: "ua_city_select",
                q7CityQuery: cityQuery,
                q7CityPage: 0,
                ...(clearingNpPick
                  ? {
                      q7CityRef: undefined,
                      q7WarehousePage: undefined,
                      deliveryCity: undefined,
                      deliveryBranch: undefined,
                    }
                  : {}),
              } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: `Оберіть місто (стор. 1/${totalCityPages}):`,
            replyMarkup: { inline_keyboard: cityButtons },
          });
        } catch (err) {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Помилка пошуку. Спробуйте пізніше або введіть місто та відділення вручну.",
          });
        }
        return;
      }

      // --- UA: city list pages (np_city_next / np_city_prev before np_city:*) ---
      if (subStep === "ua_city_select" && (replyValue === "np_city_next" || replyValue === "np_city_prev")) {
        let npKey: string;
        try {
          const creds = await revealSchoolCredentials(school.id);
          npKey = creds.novaPoshtaApiKey ?? "";
        } catch {
          npKey = "";
        }
        const cityQuery = state.q7CityQuery;
        if (!npKey || !cityQuery) {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Не вдалося завантажити список міст. Введіть назву міста ще раз.",
          });
          return;
        }
        let cities: NovaPoshtaCity[];
        try {
          cities = await searchCities(npKey, cityQuery);
        } catch {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Помилка пошуку міста. Спробуйте пізніше.",
          });
          return;
        }
        if (cities.length === 0) {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Міста не знайдено. Спробуйте інший запит.",
          });
          return;
        }
        const totalCityPages = Math.max(1, Math.ceil(cities.length / NP_CITY_PAGE_SIZE));
        const lastCityPage = totalCityPages - 1;
        const curCity = Math.min(Math.max(0, state.q7CityPage ?? 0), lastCityPage);
        const newCityPage =
          replyValue === "np_city_next"
            ? Math.min(curCity + 1, lastCityPage)
            : Math.max(0, curCity - 1);
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            state: { ...state, q7CityPage: newCityPage } as Prisma.InputJsonValue,
          },
        });
        const cityButtons = buildCityChoiceKeyboard(cities, newCityPage);
        await replaceCallbackListMessage(telegramClient, school.telegramBotToken, incoming, {
          text: `Оберіть місто (стор. ${newCityPage + 1}/${totalCityPages}):`,
          replyMarkup: { inline_keyboard: cityButtons },
        });
        return;
      }

      // --- UA: city selected (callback np_city:Ref) → ask branch number ---
      // Дозволяємо ua_branch_select: натискання міста з попереднього повідомлення після зміни кроку.
      if (
        (subStep === "ua_city_select" || subStep === "ua_branch_select") &&
        replyValue?.startsWith("np_city:")
      ) {
        const cityRef = replyValue.slice("np_city:".length);
        let npKey: string;
        try {
          const creds = await revealSchoolCredentials(school.id);
          npKey = creds.novaPoshtaApiKey ?? "";
        } catch {
          npKey = "";
        }

        // Get city name from recent search cache (best-effort).
        let cityName = "—";
        if (npKey && state.q7CityQuery) {
          try {
            const cities = await searchCities(npKey, state.q7CityQuery);
            const c = cities.find((x) => x.ref === cityRef);
            if (c) cityName = c.name;
          } catch {
            /* ignore */
          }
        }

        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            state: {
              ...state,
              deliveryCity: cityName,
              q7CityRef: cityRef,
              q7SubStep: "ua_branch_number_input",
              q7CityPage: undefined,
              q7WarehousePage: undefined,
              q7WarehouseQuery: undefined,
              deliveryBranch: undefined,
            } as Prisma.InputJsonValue,
          },
        });

        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: "Введіть номер відділення чи поштомату (наприклад: `12345` або `№12345`).",
          replyMarkup: {
            inline_keyboard: [[{ text: "🔙 Обрати інше місто", callback_data: "np_city_repick" }]],
          },
        });
        return;
      }

      // --- UA: branch number input (message) → fetch + show filtered warehouses ---
      if (subStep === "ua_branch_number_input" && incoming.updateType === "message") {
        const queryRaw = replyValue ?? "";
        const query = queryRaw.trim();
        if (!query) {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Введіть номер відділення чи поштомату.",
          });
          return;
        }

        const cityRef = state.q7CityRef;
        if (!cityRef) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                q7SubStep: "ua_city_input",
                q7CityRef: undefined,
                q7WarehouseQuery: undefined,
                q7WarehousePage: undefined,
              } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Спочатку оберіть місто. Введіть назву міста.",
          });
          return;
        }

        let npKey: string;
        try {
          const creds = await revealSchoolCredentials(school.id);
          npKey = creds.novaPoshtaApiKey ?? "";
        } catch {
          npKey = "";
        }

        // Manual fallback when we don't have Nova Poshta credentials.
        if (!npKey) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              currentStep: "q8_score",
              state: {
                ...state,
                deliveryBranch: query,
                q7SubStep: undefined,
                q7CityRef: undefined,
                q7CityQuery: undefined,
                q7CityPage: undefined,
                q7WarehousePage: undefined,
                q7WarehouseQuery: undefined,
              } as Prisma.InputJsonValue,
            },
          });
          await sendTemplateMessage(
            school,
            telegramClient,
            incoming.chatId,
            "q8_score",
            TEMPLATE_FALLBACKS.q8_score,
            {},
            scoreReplyMarkup(),
          );
          return;
        }

        let warehouses: NovaPoshtaWarehouse[];
        try {
          warehouses = await getWarehouses(npKey, cityRef);
        } catch {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Помилка API Нової Пошти. Спробуйте пізніше або введіть інший номер.",
          });
          // Keep current substep so user can retry.
          await prisma.userSession.update({
            where: { id: session.id },
            data: { state: { ...state, q7WarehouseQuery: query } as Prisma.InputJsonValue },
          });
          return;
        }

        const filtered = filterWarehousesByUserQuery(warehouses, query);
        const totalPages = Math.max(1, Math.ceil(filtered.length / NP_WAREHOUSE_PAGE_SIZE));

        if (filtered.length === 0) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: { state: { ...state, q7WarehouseQuery: query } as Prisma.InputJsonValue },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: `Не знайдено відділень/поштоматів за запитом: "${query}". Спробуйте інший номер.`,
          });
          return;
        }

        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            state: {
              ...state,
              q7SubStep: "ua_branch_select",
              q7WarehouseQuery: query,
              q7WarehousePage: 0,
            } as Prisma.InputJsonValue,
          },
        });

        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: `Оберіть відділення чи поштомат (стор. 1/${totalPages}):`,
          replyMarkup: { inline_keyboard: buildWarehouseChoiceKeyboard(filtered, 0) },
        });
        return;
      }

      // --- UA: зі списку відділень — знову список міст (той самий пошуковий запит) ---
      if (
        (subStep === "ua_branch_select" || subStep === "ua_branch_number_input") &&
        replyValue === "np_city_repick"
      ) {
        let npKey: string;
        try {
          const creds = await revealSchoolCredentials(school.id);
          npKey = creds.novaPoshtaApiKey ?? "";
        } catch {
          npKey = "";
        }
        const cityQuery = state.q7CityQuery;
        if (!npKey || !cityQuery) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                q7SubStep: "ua_city_input",
                q7CityRef: undefined,
                q7WarehousePage: undefined,
              q7WarehouseQuery: undefined,
                q7CityPage: undefined,
                deliveryCity: undefined,
                deliveryBranch: undefined,
              } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Введіть назву міста для пошуку відділення ще раз.",
          });
          return;
        }
        let cities: NovaPoshtaCity[];
        try {
          cities = await searchCities(npKey, cityQuery);
        } catch {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Помилка пошуку міста. Спробуйте пізніше.",
          });
          return;
        }
        if (cities.length === 0) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                q7SubStep: "ua_city_input",
                q7CityRef: undefined,
                q7WarehousePage: undefined,
                q7CityPage: undefined,
                deliveryCity: undefined,
                deliveryBranch: undefined,
              } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Міста не знайдено. Введіть інший запит:",
          });
          return;
        }
        const totalCityPages = Math.max(1, Math.ceil(cities.length / NP_CITY_PAGE_SIZE));
        const cityButtons = buildCityChoiceKeyboard(cities, 0);
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            state: {
              ...state,
              q7SubStep: "ua_city_select",
              q7CityPage: 0,
              q7CityRef: undefined,
              q7WarehousePage: undefined,
              deliveryCity: undefined,
              deliveryBranch: undefined,
            } as Prisma.InputJsonValue,
          },
        });
        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: `Оберіть місто (стор. 1/${totalCityPages}):`,
          replyMarkup: { inline_keyboard: cityButtons },
        });
        return;
      }

      // --- UA: requery branch number (inline button) ---
      if (subStep === "ua_branch_select" && replyValue === "np_wh_requery") {
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            state: {
              ...state,
              q7SubStep: "ua_branch_number_input",
              q7WarehousePage: undefined,
            } as Prisma.InputJsonValue,
          },
        });
        await telegramClient.sendMessage({
          botToken: school.telegramBotToken,
          chatId: incoming.chatId,
          text: "Введіть номер відділення чи поштомату.",
        });
        return;
      }

      // --- UA: warehouse pages (np_wh_next / np_wh_prev must run before np_wh:*) ---
      if (subStep === "ua_branch_select" && (replyValue === "np_wh_next" || replyValue === "np_wh_prev")) {
        let npKey: string;
        try {
          const creds = await revealSchoolCredentials(school.id);
          npKey = creds.novaPoshtaApiKey ?? "";
        } catch {
          npKey = "";
        }
        const cityRef = state.q7CityRef;
        if (!npKey || !cityRef) {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Не вдалося завантажити відділення. Спробуйте обрати місто ще раз.",
          });
          return;
        }
        let warehouses: NovaPoshtaWarehouse[];
        try {
          warehouses = await getWarehouses(npKey, cityRef);
        } catch {
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Помилка API Нової Пошти. Спробуйте пізніше.",
          });
          return;
        }

        const filtered =
          state.q7WarehouseQuery && state.q7WarehouseQuery.trim().length > 0
            ? filterWarehousesByUserQuery(warehouses, state.q7WarehouseQuery)
            : warehouses;
        if (filtered.length === 0) {
          await prisma.userSession.update({
            where: { id: session.id },
            data: {
              state: {
                ...state,
                q7SubStep: "ua_branch_number_input",
                q7WarehousePage: undefined,
              } as Prisma.InputJsonValue,
            },
          });
          await telegramClient.sendMessage({
            botToken: school.telegramBotToken,
            chatId: incoming.chatId,
            text: "Не вдалося знайти відділення за попереднім номером. Введіть інший номер.",
          });
          return;
        }

        const totalPages = Math.max(1, Math.ceil(filtered.length / NP_WAREHOUSE_PAGE_SIZE));
        const lastPage = totalPages - 1;
        const cur = Math.min(Math.max(0, state.q7WarehousePage ?? 0), lastPage);
        const newPage =
          replyValue === "np_wh_next" ? Math.min(cur + 1, lastPage) : Math.max(0, cur - 1);
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            state: { ...state, q7WarehousePage: newPage } as Prisma.InputJsonValue,
          },
        });
        const buttons = buildWarehouseChoiceKeyboard(filtered, newPage);
        await replaceCallbackListMessage(telegramClient, school.telegramBotToken, incoming, {
          text: `Номер відділення Нової Пошти (стор. ${newPage + 1}/${totalPages}):`,
          replyMarkup: { inline_keyboard: buttons },
        });
        return;
      }

      // --- UA: branch selected (callback np_wh:Ref) → go to q8 ---
      if (subStep === "ua_branch_select" && replyValue?.startsWith("np_wh:")) {
        const whRef = replyValue.slice("np_wh:".length);
        let branchDesc = whRef;
        try {
          const creds = await revealSchoolCredentials(school.id);
          const npKey = creds.novaPoshtaApiKey ?? "";
          const cityRef = state.q7CityRef;
          if (npKey && cityRef) {
            const warehouses = await getWarehouses(npKey, cityRef);
            const wh = warehouses.find((w) => w.ref === whRef);
            if (wh) branchDesc = wh.description;
          }
        } catch {
          /* use ref */
        }
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            currentStep: "q8_score",
            state: {
              ...state,
              deliveryBranch: branchDesc,
              q7SubStep: undefined,
              q7CityRef: undefined,
              q7CityQuery: undefined,
              q7CityPage: undefined,
              q7WarehousePage: undefined,
              q7WarehouseQuery: undefined,
            } as Prisma.InputJsonValue,
          },
        });
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q8_score",
          TEMPLATE_FALLBACKS.q8_score,
          {},
          scoreReplyMarkup(),
        );
        return;
      }

      // Fallback: re-send q7 choice if no match
      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        "q7_delivery",
        TEMPLATE_FALLBACKS.q7_delivery,
        {},
        {
          inline_keyboard: [
            [{ text: "🇺🇦 По Україні", callback_data: "q7_ua" }],
            [{ text: "🌍 За кордон", callback_data: "q7_abroad" }],
          ],
        },
      );
      return;
    }
    case "q8_score": {
      // Score must come from the rating inline-buttons (callback_query).
      // If we accept arbitrary numeric text, we might accidentally set a score
      // even when the user didn't choose a rating.
      if (incoming.updateType !== "callback_query") {
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q8_score",
          TEMPLATE_FALLBACKS.q8_score,
          {},
          scoreReplyMarkup(),
        );
        return;
      }

      const score = parseRecommendationScore(replyValue);
      if (score === null) {
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q8_score",
          TEMPLATE_FALLBACKS.q8_score,
          {},
          scoreReplyMarkup(),
        );
        return;
      }

      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: "q9_feedback",
          state: { ...state, score } as Prisma.InputJsonValue,
        },
      });
      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        "q9_feedback",
        TEMPLATE_FALLBACKS.q9_feedback,
        {},
        Q9_SKIP_MARKUP,
      );
      return;
    }
    case "q9_feedback": {
      if (!replyValue) {
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q9_feedback",
          TEMPLATE_FALLBACKS.q9_feedback,
          {},
          Q9_SKIP_MARKUP,
        );
        return;
      }
      const feedbackText = replyValue === "q9_skip" ? "" : replyValue;
      const stateForQ10: DialogState = { ...state, feedbackText };
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: "q10_confirmation",
          state: stateForQ10 as Prisma.InputJsonValue,
        },
      });
      await sendQ10ConfirmationPrompt(school, telegramClient, incoming.chatId, stateForQ10, {
        attachScreenshots: true,
      });
      return;
    }
    case "q10_confirmation": {
      const lower = (replyValue ?? "").toLowerCase();
      if (replyValue === "q10_delete" || lower.includes("видалити")) {
        await prisma.userSession.update({
          where: { id: session.id },
          data: {
            currentStep: "q1_start",
            state: {
              started: false,
              selectedCourses: [],
              screenshotFileIds: [],
            },
          },
        });
        await sendTemplateMessage(
          school,
          telegramClient,
          incoming.chatId,
          "q1_start",
          TEMPLATE_FALLBACKS.q1_start,
          {},
          Q1_START_REPLY_MARKUP,
        );
        return;
      }
      if (replyValue !== "q10_send" && lower !== "надіслати") {
        await sendQ10ConfirmationPrompt(school, telegramClient, incoming.chatId, state, {
          attachScreenshots: false,
        });
        return;
      }

      const finalState = asDialogState(
        (
          await prisma.userSession.findUniqueOrThrow({
            where: { id: session.id },
            select: { state: true },
          })
        ).state,
      );
      const application = await finalizeApplication(
        school,
        session.id,
        incoming.chatId,
        incoming.telegramUserId,
        incoming.telegramUsername,
        finalState,
      );
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: "q11_finish",
        },
      });

      const courseName = application.courses.map((c) => c.course.title).join(", ");
      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        "q11_finish",
        TEMPLATE_FALLBACKS.q11_finish,
        { course_name: courseName },
      );
      await sendApplicationSubmittedFollowups(school, telegramClient, incoming.chatId, finalState);
      await sendNewApplicationDigestToSchoolChannel(school, telegramClient, application, finalState, {
        telegramUserId: incoming.telegramUserId,
        telegramUsername: incoming.telegramUsername,
        chatId: incoming.chatId,
      });
      return;
    }
    case "q11_finish": {
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          currentStep: nextStep("q11_finish"),
          state: { started: false, selectedCourses: [], screenshotFileIds: [] },
        },
      });
      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        "q1_start",
        TEMPLATE_FALLBACKS.q1_start,
        {},
        Q1_START_REPLY_MARKUP,
      );
      return;
    }
    default: {
      await sendTemplateMessage(
        school,
        telegramClient,
        incoming.chatId,
        "q1_start",
        TEMPLATE_FALLBACKS.q1_start,
        {},
        Q1_START_REPLY_MARKUP,
      );
    }
  }
}

