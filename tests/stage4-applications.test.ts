import { beforeEach, describe, expect, it, vi } from "vitest";

import { getApplicationById, listApplications, updateApplicationStatus } from "@/services/applications.service";
import { sendConfirmationNotifications } from "@/services/telegram/telegram-notification.service";

const prismaMock = vi.hoisted(() => ({
  application: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  applicationStatusHistory: {
    create: vi.fn(),
  },
  outboxEvent: {
    create: vi.fn(),
  },
  $transaction: vi.fn((ops: unknown[]) => {
    return Promise.all(ops as Promise<unknown>[]).then((results) => results);
  }),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

vi.mock("@/services/google-sheets-sync.service", () => ({
  enqueueSyncJob: vi.fn().mockResolvedValue(undefined),
  upsertApplicationRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/telegram/telegram-notification.service", () => ({
  sendConfirmationNotifications: vi.fn().mockResolvedValue(undefined),
}));

describe("applications.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listApplications", () => {
    it("returns paginated list with filters", async () => {
      const mockData = [
        {
          id: "app-1",
          studentNameUa: "Іван Петренко",
          studentNameEn: "Ivan Petrenko",
          status: "submitted",
          deliveryMode: "ua",
          score: 10,
          createdAt: new Date(),
          courses: [{ course: { title: "Курс 1" } }],
          _count: { screenshots: 2 },
        },
      ];
      prismaMock.application.findMany.mockResolvedValue(mockData);
      prismaMock.application.count.mockResolvedValue(1);

      const result = await listApplications({
        schoolId: "school-1",
        status: ["submitted"],
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(prismaMock.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { schoolId: "school-1", status: { in: ["submitted"] } },
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe("getApplicationById", () => {
    it("returns application when found", async () => {
      const mockApp = {
        id: "app-1",
        schoolId: "school-1",
        studentNameUa: "Іван",
        studentNameEn: "Ivan",
        school: { id: "school-1", name: "Школа", slug: "school" },
        courses: [],
        screenshots: [],
        statusHistory: [],
      };
      prismaMock.application.findFirst.mockResolvedValue(mockApp);

      const result = await getApplicationById("app-1");
      expect(result.id).toBe("app-1");
      expect(result.studentNameUa).toBe("Іван");
      expect(prismaMock.application.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: "app-1" }) }),
      );
    });

    it("throws NotFoundError when not found", async () => {
      prismaMock.application.findFirst.mockResolvedValue(null);

      await expect(getApplicationById("missing")).rejects.toThrow("Заявку не знайдено");
    });
  });

  describe("updateApplicationStatus", () => {
    it("updates status and creates history", async () => {
      const existing = {
        id: "app-1",
        status: "submitted",
        schoolId: "school-1",
      };
      const updated = {
        ...existing,
        status: "approved",
        managerCheckedAt: new Date(),
        courses: [],
        screenshots: [],
        school: {},
      };
      prismaMock.application.findFirst.mockResolvedValue(existing);
      prismaMock.application.update.mockResolvedValue(updated);
      prismaMock.applicationStatusHistory.create.mockResolvedValue({});

      const result = await updateApplicationStatus("app-1", "school-1", "approved", "user-1");

      expect(result.status).toBe("approved");
      expect(prismaMock.applicationStatusHistory.create).toHaveBeenCalledWith({
        data: {
          applicationId: "app-1",
          fromStatus: "submitted",
          toStatus: "approved",
          changedByUserId: "user-1",
        },
      });
      expect(sendConfirmationNotifications).toHaveBeenCalledWith("app-1");
    });

    it("does not send confirmation when rejecting", async () => {
      const existing = { id: "app-1", status: "submitted", schoolId: "school-1" };
      const updated = {
        ...existing,
        status: "rejected",
        courses: [],
        screenshots: [],
        school: {},
      };
      prismaMock.application.findFirst.mockResolvedValue(existing);
      prismaMock.application.update.mockResolvedValue(updated);
      prismaMock.applicationStatusHistory.create.mockResolvedValue({});

      await updateApplicationStatus("app-1", "school-1", "rejected", "user-1");

      expect(sendConfirmationNotifications).not.toHaveBeenCalled();
    });

    it("throws NotFoundError when application not found", async () => {
      prismaMock.application.findFirst.mockResolvedValue(null);

      await expect(
        updateApplicationStatus("missing", "school-1", "approved"),
      ).rejects.toThrow("Заявку не знайдено");
    });
  });

});
