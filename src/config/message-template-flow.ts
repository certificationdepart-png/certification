import { DEFAULT_MESSAGE_TEMPLATES } from "@/services/template-defaults";

export type TemplatePhase = "dialog" | "manager";

export type TemplateVariableHint = { key: string; label: string };

export type MessageTemplateFlowItem = {
  code: string;
  phase: TemplatePhase;
  /** Порядок у сценарії (1…N). */
  step: number;
  title: string;
  summary: string;
  variables: TemplateVariableHint[];
};

/**
 * Порядок і зміст шаблонів у сценарії бота та після дій менеджера.
 * Коди мають збігатися з тим, що очікує `telegram-dialog.service` / `telegram-notification.service`.
 */
export const MESSAGE_TEMPLATE_FLOW: MessageTemplateFlowItem[] = [
  {
    code: "q1_start",
    phase: "dialog",
    step: 1,
    title: "Початок діалогу",
    summary: "Перше запрошення: студент натискає «Старт», щоб подати заявку на сертифікат.",
    variables: [],
  },
  {
    code: "q2_course_intro",
    phase: "dialog",
    step: 2,
    title: "Вибір курсу",
    summary: "Після старту — запит, з якого курсу потрібен сертифікат (далі кнопки зі списку курсів школи).",
    variables: [],
  },
  {
    code: "q3_requirements",
    phase: "dialog",
    step: 3,
    title: "Вимоги та скріншоти",
    summary: "Текст про те, які роботи/скріни потрібні. Підставляється текст вимог з обраного курсу.",
    variables: [{ key: "requirements_text", label: "Текст вимог з курсу (з адмінки)" }],
  },
  {
    code: "q4_certificate_type",
    phase: "dialog",
    step: 4,
    title: "Формат сертифіката",
    summary: "Після скрінів — вибір електронний / фізичний / обидва (за типом курсу).",
    variables: [],
  },
  {
    code: "q5_name_ua",
    phase: "dialog",
    step: 5,
    title: "ПІБ українською",
    summary: "Збір повного імені українською.",
    variables: [],
  },
  {
    code: "q6_name_en",
    phase: "dialog",
    step: 6,
    title: "Ім’я англійською",
    summary: "Збір імені латиницею для документів.",
    variables: [],
  },
  {
    code: "q7_delivery",
    phase: "dialog",
    step: 7,
    title: "Доставка (Нова Пошта)",
    summary: "Питання «куди відправити», якщо обрано фізичний або змішаний формат. Далі бот показує тільки кнопки 🇺🇦 / 🌍 (без додаткового тексту).",
    variables: [],
  },
  {
    code: "q8_score",
    phase: "dialog",
    step: 8,
    title: "Оцінка рекомендації (1–10)",
    summary: "Після доставки або якщо доставка не потрібна — скільки ймовірно порекомендує навчання.",
    variables: [],
  },
  {
    code: "q9_feedback",
    phase: "dialog",
    step: 9,
    title: "Відгук (можна пропустити)",
    summary: "Враження від курсу; студент може відповісти коротко або пропустити.",
    variables: [],
  },
  {
    code: "q10_confirmation",
    phase: "dialog",
    step: 10,
    title: "Перевірка перед відправкою",
    summary:
      "Перший абзац з шаблону; далі бот автоматично додає зведення всіх відповідей (курси, скріни, ПІБ, доставка, оцінка, відгук). Кнопки «Надіслати» / «Видалити».",
    variables: [],
  },
  {
    code: "q11_finish",
    phase: "dialog",
    step: 11,
    title: "Заявку прийнято",
    summary: "Підтвердження після відправки в чат школи. Підставляються назви курсів.",
    variables: [{ key: "course_name", label: "Назви обраних курсів через кому" }],
  },
  {
    code: "processing_followup",
    phase: "dialog",
    step: 12,
    title: "Очікування відповіді",
    summary: "Окреме коротке повідомлення після q11 (протягом доби).",
    variables: [],
  },
  {
    code: "review_site_invite",
    phase: "dialog",
    step: 13,
    title: "Запрошення на відгук (оцінка 10)",
    summary: "Лише якщо оцінка 10 і в курсу задано посилання на відгуки. Підставляється {{review_link}}.",
    variables: [{ key: "review_link", label: "URL з поля курсу «Посилання на відгук»" }],
  },
  {
    code: "after_confirmation",
    phase: "manager",
    step: 1,
    title: "Після перевірки менеджером",
    summary: "Окреме повідомлення в Telegram студенту, коли заявку схвалено (галочка/статус). Тут згадується термін з курсу.",
    variables: [
      { key: "name", label: "ПІБ українською з заявки" },
      { key: "days", label: "Кількість днів (max по курсах заявки)" },
    ],
  },
  {
    code: "nova_poshta_warning",
    phase: "manager",
    step: 2,
    title: "Попередження про Нову Пошту",
    summary: "Друге повідомлення після схвалення, якщо доставка по Україні (НП) — про відповідальність перевізника.",
    variables: [],
  },
];

export const KNOWN_TEMPLATE_CODES = new Set(MESSAGE_TEMPLATE_FLOW.map((f) => f.code));

export function getSuggestedDefault(code: string) {
  return DEFAULT_MESSAGE_TEMPLATES.find((t) => t.code === code);
}
