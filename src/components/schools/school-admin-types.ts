export type SchoolOption = { id: string; name: string };

export type CourseRow = {
  id: string;
  schoolId: string;
  title: string;
  certificateType: string;
  daysToSend: number;
  reviewLink: string | null;
  bprEnabled: boolean;
  bprSpecialtyCheckLink: string | null;
  bprTestLink: string | null;
  requirementsText: string;
};

export type TemplateRow = {
  id: string;
  schoolId: string;
  code: string;
  text: string;
  description: string | null;
};

/** Per-school counts of Google Sheets sync jobs (SyncJob by status). */
export type SchoolSyncQueueStats = {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
};

export type SchoolListRow = {
  id: string;
  name: string;
  slug: string;
  schoolKey: string;
  telegramChatId: string;
  googleSheetId: string;
  googleSheetUrl: string | null;
  secretEncryptionKeyVer: number;
  createdAt: string;
  updatedAt: string;
  hasTelegramBotToken: boolean;
  hasNovaPoshtaApiKey: boolean;
  syncStats: SchoolSyncQueueStats;
};
