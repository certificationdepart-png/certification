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

  it("media album: keeps same media_group_id isolated across different chats", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(dialogModule, "processTelegramDialog").mockResolvedValue(undefined);
    const p1 = handleTelegramWebhook({
      schoolKey: "demo_school",
      payload: {
        update_id: 20101,
        message: {
          message_id: 10,
          media_group_id: "same-album-id",
          chat: { id: 111, type: "private" },
          from: { id: 222 },
          photo: [{ file_id: "chat-111-photo", file_unique_id: "u-111", width: 100, height: 100 }],
        },
      },
    });
    const p2 = handleTelegramWebhook({
      schoolKey: "demo_school",
      payload: {
        update_id: 20102,
        message: {
          message_id: 11,
          media_group_id: "same-album-id",
          chat: { id: 333, type: "private" },
          from: { id: 444 },
          photo: [{ file_id: "chat-333-photo", file_unique_id: "u-333", width: 100, height: 100 }],
        },
      },
    });

    await vi.advanceTimersByTimeAsync(1600);
    await Promise.all([p1, p2]);

    expect(spy).toHaveBeenCalledTimes(2);
    const calls = spy.mock.calls.map((call) => call[0].incoming);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chatId: "111",
          batchedScreenshotFileIds: ["chat-111-photo"],
        }),
        expect.objectContaining({
          chatId: "333",
          batchedScreenshotFileIds: ["chat-333-photo"],
        }),
      ]),
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
    editMessageText: vi.fn().mockResolvedValue(undefined),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userSession.findUniqueOrThrow.mockResolvedValue({
      state: { started: true, selectedCourses: [], screenshotFileIds: [] },
    });
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

  it("slash /new resets session and returns q1_start prompt", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q6_name_en",
      state: {
        started: true,
        selectedCourses: [{ courseId: "c1", title: "Course A", certificateType: "electronic" }],
        screenshotFileIds: ["f1"],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(14),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: "/new",
        callbackData: null,
        callbackMessageId: null,
        screenshotFileId: null,
        mediaGroupId: null,
        updateType: "message",
        raw: {
          update_id: BigInt(14),
          message: {
            message_id: 14,
            text: "/new",
            chat: { id: 111, type: "private" },
            from: { id: 222 },
          },
        },
      },
    });

    expect(prismaMock.userSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        currentStep: "q1_start",
        state: {
          started: false,
          selectedCourses: [],
          screenshotFileIds: [],
        },
      },
    });
    expect(telegramClient.sendMessage).toHaveBeenCalledTimes(1);
    expect(telegramClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "111",
        text: expect.stringContaining("Щоб ввести дані для отримання сертифікату"),
      }),
    );
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
            q7SubStep: "ua_recipient_name",
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
            q7SubStep: "abroad_choice",
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

  it("q3_screenshots preserves screenshots already saved by another Telegram update", async () => {
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q3_screenshots",
      state: {
        started: true,
        selectedCourses: [{ courseId: "c1", title: "Course A", certificateType: "physical" }],
        screenshotFileIds: [],
      },
    });
    prismaMock.userSession.findUniqueOrThrow.mockResolvedValue({
      state: {
        started: true,
        selectedCourses: [{ courseId: "c1", title: "Course A", certificateType: "physical" }],
        screenshotFileIds: ["existing-photo"],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(15),
        chatId: "111",
        telegramUserId: "222",
        telegramUsername: "student",
        text: null,
        callbackData: null,
        callbackMessageId: null,
        screenshotFileId: "new-photo",
        mediaGroupId: null,
        updateType: "message",
        raw: {
          update_id: BigInt(15),
          message: {
            message_id: 15,
            chat: { id: 111, type: "private" },
            from: { id: 222 },
            photo: [{ file_id: "new-photo", file_unique_id: "u-new", width: 100, height: 100 }],
          },
        },
      },
    });

    expect(prismaMock.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: expect.objectContaining({
            screenshotFileIds: ["existing-photo", "new-photo"],
          }),
        }),
      }),
    );
  });

  it("q9_feedback renders confirmation summary from latest screenshots, not stale session snapshot", async () => {
    const baseState = {
      started: true,
      selectedCourses: [{ courseId: "c1", title: "Course A", certificateType: "electronic" }],
      screenshotFileIds: [],
      studentNameUa: "Ім'я",
      studentNameEn: "Name",
      deliveryMode: "none",
      score: 10,
    };
    prismaMock.userSession.upsert.mockResolvedValue({
      id: "session-1",
      currentStep: "q9_feedback",
      state: baseState,
    });
    prismaMock.userSession.findUniqueOrThrow.mockResolvedValue({
      state: {
        ...baseState,
        screenshotFileIds: ["photo-1", "photo-2"],
      },
    });

    await processTelegramDialog({
      school,
      telegramClient,
      incoming: {
        updateId: BigInt(16),
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
          update_id: BigInt(16),
          callback_query: {
            id: "cb1",
            data: "q9_skip",
            from: { id: 222 },
            message: { message_id: 1, chat: { id: 111, type: "private" } },
          },
        },
      },
    });

    const messages = telegramClient.sendMessage.mock.calls.map((call) => call[0].text);
    expect(messages.some((text) => text.includes("📎 Скрінів надіслано: 2"))).toBe(true);
  });

  it("q10_send creates parallel applications with screenshots isolated per session", async () => {
    const sessionStates = {
      "session-a": {
        started: true,
        selectedCourses: [{ courseId: "c1", title: "Course A", certificateType: "electronic" }],
        screenshotFileIds: ["a-photo-1", "a-photo-2"],
        studentNameUa: "Студент А",
        studentNameEn: "Student A",
        deliveryMode: "none",
        score: 10,
        feedbackText: "",
      },
      "session-b": {
        started: true,
        selectedCourses: [{ courseId: "c1", title: "Course A", certificateType: "electronic" }],
        screenshotFileIds: ["b-photo-1"],
        studentNameUa: "Студент Б",
        studentNameEn: "Student B",
        deliveryMode: "none",
        score: 9,
        feedbackText: "",
      },
    };
    prismaMock.userSession.upsert.mockImplementation(async (args: { where: { schoolId_chatId: { chatId: string } } }) => {
      const chatId = args.where.schoolId_chatId.chatId;
      return {
        id: chatId === "111" ? "session-a" : "session-b",
        currentStep: "q10_confirmation",
        state: { started: true, selectedCourses: [], screenshotFileIds: [] },
      };
    });
    prismaMock.userSession.findUniqueOrThrow.mockImplementation(async (args: { where: { id: keyof typeof sessionStates } }) => ({
      state: sessionStates[args.where.id],
    }));
    prismaMock.application.create.mockImplementation(async (args: { data: { chatId: string; screenshots: { create: Array<{ fileId: string; sortOrder: number }> } } }) => ({
      id: `app-${args.data.chatId}`,
      studentNameUa: args.data.chatId === "111" ? "Студент А" : "Студент Б",
      studentNameEn: args.data.chatId === "111" ? "Student A" : "Student B",
      score: args.data.chatId === "111" ? 10 : 9,
      feedbackText: "",
      courses: [{ course: { title: "Course A" } }],
      screenshots: args.data.screenshots.create.map((item) => ({ fileId: item.fileId })),
    }));

    await Promise.all([
      processTelegramDialog({
        school,
        telegramClient,
        incoming: {
          updateId: BigInt(17),
          chatId: "111",
          telegramUserId: "222",
          telegramUsername: "student_a",
          text: null,
          callbackData: "q10_send",
          callbackMessageId: 1,
          screenshotFileId: null,
          mediaGroupId: null,
          updateType: "callback_query",
          raw: {
            update_id: BigInt(17),
            callback_query: {
              id: "cb-a",
              data: "q10_send",
              from: { id: 222 },
              message: { message_id: 1, chat: { id: 111, type: "private" } },
            },
          },
        },
      }),
      processTelegramDialog({
        school,
        telegramClient,
        incoming: {
          updateId: BigInt(18),
          chatId: "333",
          telegramUserId: "444",
          telegramUsername: "student_b",
          text: null,
          callbackData: "q10_send",
          callbackMessageId: 1,
          screenshotFileId: null,
          mediaGroupId: null,
          updateType: "callback_query",
          raw: {
            update_id: BigInt(18),
            callback_query: {
              id: "cb-b",
              data: "q10_send",
              from: { id: 444 },
              message: { message_id: 1, chat: { id: 333, type: "private" } },
            },
          },
        },
      }),
    ]);

    const createCalls = prismaMock.application.create.mock.calls.map((call) => call[0].data);
    const appA = createCalls.find((data) => data.chatId === "111");
    const appB = createCalls.find((data) => data.chatId === "333");

    expect(appA?.screenshots.create.map((item: { fileId: string }) => item.fileId)).toEqual([
      "a-photo-1",
      "a-photo-2",
    ]);
    expect(appB?.screenshots.create.map((item: { fileId: string }) => item.fileId)).toEqual(["b-photo-1"]);
  });
});
