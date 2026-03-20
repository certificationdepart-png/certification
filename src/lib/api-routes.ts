export const apiRoutes = {
  health: "/api/health",
  metrics: "/api/metrics",
  telegramWebhook: "/api/telegram/webhook",
  telegramVerifyBot: "/api/telegram/verify-bot",

  courses: "/api/courses",
  courseById: (id: string) => `/api/courses/${id}`,

  schools: "/api/schools",
  schoolById: (id: string) => `/api/schools/${id}`,
  schoolsSyncAll: (id: string) => `/api/schools/${id}/sync-all`,

  messageTemplates: "/api/message-templates",
  messageTemplateById: (id: string) => `/api/message-templates/${id}`,

  applications: "/api/applications",
  applicationById: (id: string) => `/api/applications/${id}`,
  applicationChatHistory: (id: string) => `/api/applications/${id}/chat-history`,
  applicationScreenshotsImage: (applicationId: string, screenshotId: string) =>
    `/api/applications/${applicationId}/screenshots/${screenshotId}/image`,

  syncJobs: "/api/sync/jobs",
  syncJobById: (id: string) => `/api/sync/jobs/${id}`,
  syncJobRetry: (id: string) => `/api/sync/jobs/${id}/retry`,

  processSyncJobsCron: "/api/cron/process-sync-jobs",
} as const;

