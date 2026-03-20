export type TelegramUser = {
  id: number;
  username?: string;
};

export type TelegramMessage = {
  message_id: number;
  /** Кілька медіа в одному повідомленні користувача (альбом) — однаковий id у всіх частинах. */
  /** Telegram Bot API: media_group_id is a String. */
  media_group_id?: string;
  from?: TelegramUser;
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    // Telegram payload may omit these for some photo items; we don't use them anyway.
    width?: number;
    height?: number;
    file_size?: number;
  }>;
  /** Докази, надіслані як файл (не «фото») — зберігаємо file_id для каналу/БД */
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
  };
  video?: {
    file_id: string;
    file_unique_id?: string;
  };
  animation?: {
    file_id: string;
    file_unique_id?: string;
  };
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
    };
  };
};

export type TelegramUpdate = {
  update_id: bigint;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramIncoming = {
  updateId: bigint;
  chatId: string;
  telegramUserId: string;
  telegramUsername: string | null;
  text: string | null;
  callbackData: string | null;
  /** Повідомлення з інлайн-клавіатури (для deleteMessage при перелистуванні списків) */
  callbackMessageId: number | null;
  screenshotFileId: string | null;
  /** Якщо користувач надіслав альбом — однаковий id для всіх частин (інакше null). */
  mediaGroupId: string | null;
  /** Внутрішньо: кілька file_id з одного альбому за один прохід діалогу. */
  batchedScreenshotFileIds?: string[];
  updateType: "message" | "callback_query";
  raw: TelegramUpdate;
};

export type DialogCourseState = {
  courseId: string;
  title: string;
  certificateType: "electronic" | "physical" | "both";
  daysToSend: number;
  reviewLink: string | null;
  bprEnabled: boolean;
  bprSpecialtyCheckLink: string | null;
  bprTestLink: string | null;
  requirementsText: string;
  selectedFormat?: "electronic" | "physical" | "both";
};

export type Q7SubStep =
  | "delivery_format_choice"
  | "ua_abroad_choice"
  | "ua_city_input"
  | "ua_city_select"
  | "ua_branch_number_input"
  | "ua_branch_select"
  | "abroad_choice"
  | "abroad_address";

export type DialogState = {
  started: boolean;
  selectedCourses: DialogCourseState[];
  screenshotFileIds: string[];
  studentNameUa?: string;
  studentNameEn?: string;
  deliveryMode?: "none" | "ua" | "abroad";
  deliveryCity?: string;
  deliveryBranch?: string;
  deliveryAddress?: string;
  deliveryCountry?: string;
  deliveryPhone?: string;
  deliveryEmail?: string;
  score?: number;
  feedbackText?: string;
  q7SubStep?: Q7SubStep;
  q7CityRef?: string;
  q7CityQuery?: string;
  /** Сторінка списку міст (пошук Нової Пошти), з 0 */
  q7CityPage?: number;
  /** Запит користувача для пошуку відділення/поштомату (зазвичай це номер) */
  q7WarehouseQuery?: string;
  /** Нумерація з 0 для списку відділень Нової Пошти */
  q7WarehousePage?: number;
};

