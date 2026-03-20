import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleTelegramWebhook } from "@/services/telegram/telegram-webhook.service";
import { processTelegramDialog } from "@/services/telegram/telegram-dialog.service";
import * as dialogModule from "@/services/telegram/telegram-dialog.service";

const {
  mockGetSchoolWebhookContext,
  mockRegisterIncomingUpdate,
  prismaMock,
} = vi.hoisted(() => ({
  mockGetSchoolWebhookContext: vi.fn(),
  mockRegisterIncomingUpdate: vi.fn(),
  prismaMock: {
    telegramUpdateLog: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    userSession: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    messageTemplate: {
      findUnique: vi.fn(),
    },
    course: {
      findFirst: vi.fn(),
    },
    application: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/services/schools.service", () => ({
  getSchoolWebhookContext: mockGetSchoolWebhookContext,
}));

vi.mock("@/services/telegram/telegram-idempotency.service", () => ({
  registerIncomingUpdate: mockRegisterIncomingUpdate,
}));

vi.mock("@/services/google-sheets-sync.service", () => ({
  enqueueSyncJob: vi.fn().mockResolvedValue(undefined),
  upsertApplicationRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

describe("stage3 webhook integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSchoolWebhookContext.mockResolvedValue({
      id: "school-1",
      schoolKey: "demo_school",
      telegramChatId: "-100",
      telegramBotToken: "bot-token",
    });
    mockRegisterIncomingUpdate.mockResolvedValue({ isDuplicate: false });
  });

  it("happy path: accepts incoming update and processes it", async () => {
    const spy = vi.spyOn(dialogModule, "processTelegramDialog").mockResolvedValue(undefined);
    const result = await handleTelegramWebhook({
      schoolKey: "demo_school",
      payload: {
        update_id: 10001,
        message: {
          message_id: 1,
          text: "Старт",
          chat: { id: 111, type: "private" },
          from: { id: 222, username: "student" },
        },
      },
    });

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(mockRegisterIncomingUpdate).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("duplicate replay: returns safe no-op without processing", async () => {
    mockRegisterIncomingUpdate.mockResolvedValueOnce({ isDuplicate: true });

    const spy = vi.spyOn(dialogModule, "processTelegramDialog").mockResolvedValue(undefined);
    const result = await handleTelegramWebhook({
      schoolKey: "demo_school",
      payload: {
        update_id: 10002,
        message: {
          message_id: 2,
          text: "Старт",
          chat: { id: 111, type: "private" },
          from: { id: 222, username: "student" },
        },
      },
    });

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("on dialog failure, deletes idempotency row so Telegram retry can reprocess", async () => {
    const err = new Error("db fail");
    const spy = vi.spyOn(dialogModule, "processTelegramDialog").mockRejectedValue(err);
    await expect(
      handleTelegramWebhook({
        schoolKey: "demo_school",
        payload: {
          update_id: 10099,
          message: {
            message_id: 1,
            text: "Старт",
            chat: { id: 111, type: "private" },
            from: { id: 222 },
          },
        },
      }),
    ).rejects.toThrow("db fail");
    expect(prismaMock.telegramUpdateLog.deleteMany).toHaveBeenCalledWith({
      where: { schoolId: "school-1", updateId: BigInt(10099) },
    });
    spy.mockRestore();
  });

  it("maps edited_message to message so edits do not 500", async () => {
    const spy = vi.spyOn(dialogModule, "processTelegramDialog").mockResolvedValue(undefined);
    const result = await handleTelegramWebhook({
      schoolKey: "demo_school",
      payload: {
        update_id: 10003,
        edited_message: {
          message_id: 3,
          text: "далі",
          chat: { id: 111, type: "private" },
          from: { id: 222 },
        },
      },
    });

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("ignores service updates (e.g. channel_post) with 200", async () => {
    const spy = vi.spyOn(dialogModule, "processTelegramDialog").mockResolvedValue(undefined);
    const result = await handleTelegramWebhook({
      schoolKey: "demo_school",
      payload: {
        update_id: 10004,
        channel_post: {
          message_id: 1,
          chat: { id: -100123, type: "channel" },
          text: "hello",
        },
      },
    });

    expect(result).toEqual({ ok: true, ignored: true });
    expect(mockRegisterIncomingUpdate).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("media album: coalesces multiple photo updates into one dialog call", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(dialogModule, "processTelegramDialog").mockResolvedValue(undefined);
    const basePhoto = [
      { file_id: "Fx1", file_unique_id: "Ux1", width: 100, height: 100 },
    ];
    const p1 = handleTelegramWebhook({
      schoolKey: "demo_school",
      payload: {
        update_id: 20001,
        message: {
          message_id: 10,
          media_group_id: "999",
          chat: { id: 111, type: "private" },
          from: { id: 222 },
          photo: basePhoto,
        },
      },
    });
    const p2 = handleTelegramWebhook({
      schoolKey: "demo_school",
      payload: {
        update_id: 20002,
        message: {
          message_id: 11,
          media_group_id: "999",
          chat: { id: 111, type: "private" },
          from: { id: 222 },
          photo: [{ file_id: "Fx2", file_unique_id: "Ux2", width: 100, height: 100 }],
        },
      },
    });

    expect(spy).not.toHaveBeenCalled();
    // Telegram media-group coalescing window is >= 1500ms.
    await vi.advanceTimersByTimeAsync(1600);
    await Promise.all([p1, p2]);

    expect(mockRegisterIncomingUpdate).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        incoming: expect.objectContaining({
          batchedScreenshotFileIds: expect.arrayContaining(["Fx1", "Fx2"]),
          screenshotFileId: null,
        }),
      }),
    );

    spy.mockRestore();
    vi.useRealTimers();
  });
});

describe("stage3 dialog branches", () => {
  const school = {
    id: "school-1",
    schoolKey: "demo_school",
    telegramChatId: "-100",
    telegramBotToken: "bot-token",
  };
  const telegramClient = {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    sendPhoto: vi.fn().mockResolvedValue(undefined),
    sendDocument: vi.fn().mockResolvedValue(undefined),
    sendMediaGroup: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.messageTemplate.findUnique.mockResolvedValue(null);
    prismaMock.course.findFirst.mockResolvedValue(null);
    prismaMock.application.create.mockResolvedValue({
      id: "app-1",
      studentNameUa: "Ім'я",
      studentNameEn: "Name",
      score: 10,
      feedbackText: "ok",
      courses: [{ course: { title: "Course A" } }],
    });
  });

  it("skipped review branch transitions q9 -> q10", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q9_feedback",
      state: {
        started: true,
        selectedCourses: [],
        screenshotFileIds: [],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(1),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: null,
        callbackData: "q9_skip",
        callbackMessageId: 1,
        screenshotFileId: null,
        mediaGroupId: null,
        updateType: "callback_query",
        raw: {
          update_id: BigInt(1),
          callback_query: {
            id: "cb1",
            data: "q9_skip",
            from: { id: 222 },
            message: { message_id: 1, chat: { id: 111, type: "private" } },
          },
        },
      },
    });

    expect(prismaMock.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStep: "q10_confirmation",
        }),
      }),
    );
  });

  it("physical certificate branch supports UA delivery", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q7_delivery",
      state: {
        started: true,
        selectedCourses: [{ courseId: "c1", title: "Course A", certificateType: "physical" }],
        q7SubStep: "ua_abroad_choice",
        screenshotFileIds: [],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(2),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: "🇺🇦 По Україні",
        callbackData: null,
        callbackMessageId: null,
        screenshotFileId: null,
        mediaGroupId: null,
        updateType: "message",
        raw: {
          update_id: BigInt(2),
          message: {
            message_id: 2,
            chat: { id: 111, type: "private" },
            text: "🇺🇦 По Україні",
            from: { id: 222 },
          },
        },
      },
    });

    expect(prismaMock.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: expect.objectContaining({
            deliveryMode: "ua",
            q7SubStep: "ua_city_input",
          }),
        }),
      }),
    );
  });

  it("physical certificate branch supports abroad delivery", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q7_delivery",
      state: {
        started: true,
        selectedCourses: [{ courseId: "c1", title: "Course A", certificateType: "physical" }],
        q7SubStep: "ua_abroad_choice",
        screenshotFileIds: [],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(3),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: "🌍 За кордон",
        callbackData: null,
        callbackMessageId: null,
        screenshotFileId: null,
        mediaGroupId: null,
        updateType: "message",
        raw: {
          update_id: BigInt(3),
          message: {
            message_id: 3,
            chat: { id: 111, type: "private" },
            text: "🌍 За кордон",
            from: { id: 222 },
          },
        },
      },
    });

    expect(prismaMock.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: expect.objectContaining({
            deliveryMode: "abroad",
            q7SubStep: "abroad_address",
          }),
        }),
      }),
    );
  });

  it("q4_certificate_type with BPR enabled transitions to q4_bpr_question", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q4_certificate_type",
      state: {
        started: true,
        selectedCourses: [
          {
            courseId: "c1",
            title: "Course A",
            certificateType: "electronic",
            bprEnabled: true,
            bprSpecialtyCheckLink: "https://spec.example",
            bprTestLink: "https://test.example",
          },
        ],
        screenshotFileIds: [],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(10),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: null,
        callbackData: "cert_elec",
        callbackMessageId: 1,
        screenshotFileId: null,
        mediaGroupId: null,
        updateType: "callback_query",
        raw: {
          update_id: BigInt(10),
          callback_query: {
            id: "cb1",
            data: "cert_elec",
            from: { id: 222 },
            message: { message_id: 1, chat: { id: 111, type: "private" } },
          },
        },
      },
    });

    expect(prismaMock.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStep: "q4_bpr_question",
        }),
      }),
    );

    expect(telegramClient.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegramClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("нарахування балів БПР"),
        replyMarkup: {
          inline_keyboard: [
            [{ text: "Так", callback_data: "q4_bpr_yes" }],
            [{ text: "Ні", callback_data: "q4_bpr_no" }],
          ],
        },
      }),
    );
  });

  it("q4_bpr_question: Так sends q4_bpr_test then q4_add_more_courses", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q4_bpr_question",
      state: {
        started: true,
        selectedCourses: [
          {
            courseId: "c1",
            title: "Course A",
            certificateType: "electronic",
            bprEnabled: true,
            bprSpecialtyCheckLink: "https://spec.example",
            bprTestLink: "https://test.example",
          },
        ],
        screenshotFileIds: [],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(11),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: null,
        callbackData: "q4_bpr_yes",
        callbackMessageId: 1,
        screenshotFileId: null,
        mediaGroupId: null,
        updateType: "callback_query",
        raw: {
          update_id: BigInt(11),
          callback_query: {
            id: "cb1",
            data: "q4_bpr_yes",
            from: { id: 222 },
            message: { message_id: 1, chat: { id: 111, type: "private" } },
          },
        },
      },
    });

    expect(prismaMock.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStep: "q4_add_more_courses",
        }),
      }),
    );

    expect(telegramClient.sendMessage).toHaveBeenCalledTimes(2);
    const calls = telegramClient.sendMessage.mock.calls.map((c) => c[0]);

    expect(calls[0].text).toContain("Пройдіть, будь ласка, тест");
    expect(calls[0].text).toContain("https://test.example");

    expect(calls[1].text).toBe("Можна обрати сертифікати з кількох курсів. Оберіть дію:");
    expect(calls[1].replyMarkup).toEqual({
      inline_keyboard: [
        [{ text: "➕ Обрати ще курс", callback_data: "q4_add_course" }],
        [{ text: "➡️ Перейти далі", callback_data: "q4_continue" }],
      ],
    });
  });

  it("q4_bpr_question: Ні skips q4_bpr_test and goes to q4_add_more_courses", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q4_bpr_question",
      state: {
        started: true,
        selectedCourses: [
          {
            courseId: "c1",
            title: "Course A",
            certificateType: "electronic",
            bprEnabled: true,
            bprSpecialtyCheckLink: "https://spec.example",
            bprTestLink: "https://test.example",
          },
        ],
        screenshotFileIds: [],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(12),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: null,
        callbackData: "q4_bpr_no",
        callbackMessageId: 1,
        screenshotFileId: null,
        mediaGroupId: null,
        updateType: "callback_query",
        raw: {
          update_id: BigInt(12),
          callback_query: {
            id: "cb1",
            data: "q4_bpr_no",
            from: { id: 222 },
            message: { message_id: 1, chat: { id: 111, type: "private" } },
          },
        },
      },
    });

    expect(telegramClient.sendMessage).toHaveBeenCalledTimes(1);
    const calls = telegramClient.sendMessage.mock.calls.map((c) => c[0]);
    expect(calls[0].text).toBe("Можна обрати сертифікати з кількох курсів. Оберіть дію:");
    expect(calls[0].replyMarkup).toEqual({
      inline_keyboard: [
        [{ text: "➕ Обрати ще курс", callback_data: "q4_add_course" }],
        [{ text: "➡️ Перейти далі", callback_data: "q4_continue" }],
      ],
    });
  });

  it("q3_screenshots electronic-only shortcut leads to q4_bpr_question when last course has BPR enabled", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q3_screenshots",
      state: {
        started: true,
        selectedCourses: [
          {
            courseId: "c1",
            title: "Course A",
            certificateType: "electronic",
            bprEnabled: true,
            bprSpecialtyCheckLink: "https://spec.example",
            bprTestLink: "https://test.example",
          },
        ],
        screenshotFileIds: [],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(13),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: null,
        callbackData: "q3_next",
        callbackMessageId: 1,
        screenshotFileId: null,
        mediaGroupId: null,
        updateType: "callback_query",
        raw: {
          update_id: BigInt(13),
          callback_query: {
            id: "cb1",
            data: "q3_next",
            from: { id: 222 },
            message: { message_id: 1, chat: { id: 111, type: "private" } },
          },
        },
      },
    });

    expect(prismaMock.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStep: "q4_bpr_question",
        }),
      }),
    );

    expect(telegramClient.sendMessage).toHaveBeenCalledTimes(1);
    const calls = telegramClient.sendMessage.mock.calls.map((c) => c[0]);
    expect(calls[0].text).toContain("нарахування балів БПР");
    expect(calls[0].text).toContain("https://spec.example");
  });
});

