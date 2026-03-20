import type { ApplicationStatus, DeliveryMode } from "@prisma/client";

export const STATUSES: ApplicationStatus[] = ["new", "submitted", "approved", "rejected"];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "Нова",
  submitted: "На перевірці",
  approved: "Підтверджено",
  rejected: "Відхилено",
};

/** Довгі пояснення для підказок (tooltip) у адмінці. */
export const STATUS_DESCRIPTIONS_UK: Record<ApplicationStatus, string> = {
  new: "Заявка на ранньому етапі: запис у системі щойно з’явився або ще оформлюється в боті. Менеджерська дія зазвичай не потрібна, доки клієнт не завершить діалог.",
  submitted:
    "Заявка на перевірці: клієнт завершив діалог у боті, дані в БД. Менеджер може підтвердити заявку («Підтверджено») або відхилити.",
  approved:
    "Заявку підтверджено остаточно: мають спрацювати шаблонні повідомлення клієнту (підтвердження, терміни тощо) за налаштуваннями школи.",
  rejected:
    "Заявку відхилено: сертифікат/відправка за цією заявкою не оформлюються. Причина зазвичай фіксується в комунікації з клієнтом окремо.",
};

/** Підказка для пункту «Усі статуси» у фільтрі. */
export const STATUS_FILTER_ALL_TOOLTIP_UK =
  "Показати заявки з будь-яким статусом — без обмеження за етапом обробки.";

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  none: "—",
  ua: "Україна",
  abroad: "За кордон",
};

