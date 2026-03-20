import { z } from "zod";

import { applicationStatusEnum } from "@/services/validation";

export const idParamSchema = z.object({
  id: z.string().trim().min(1, "Параметр id є обов'язковим"),
});

export const schoolIdQuerySchema = z.object({
  schoolId: z.string().trim().min(1, "Параметр schoolId є обов'язковим"),
});

export function parseSchoolIdFromRequest(request: Request) {
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  return schoolIdQuerySchema.parse({ schoolId }).schoolId;
}

export const optionalSchoolIdQuerySchema = z.object({
  schoolId: z.string().trim().min(1).optional(),
});

export function parseOptionalSchoolIdFromRequest(request: Request): string | undefined {
  const schoolId = new URL(request.url).searchParams.get("schoolId");
  const parsed = optionalSchoolIdQuerySchema.safeParse({ schoolId });
  return parsed.success && parsed.data.schoolId ? parsed.data.schoolId : undefined;
}

export const applicationsListQuerySchema = z.object({
  schoolId: z.string().trim().min(1).optional(),
  status: z.union([applicationStatusEnum, z.array(applicationStatusEnum)]).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1, "Сторінка має бути не менше 1").default(1),
  pageSize: z.coerce.number().int().min(1, "Розмір сторінки має бути не менше 1").max(100, "Максимум 100 записів на сторінку").default(20),
});

export const applicationScreenshotParamsSchema = z.object({
  id: z.string().trim().min(1, "ID заявки є обов'язковим"),
  screenshotId: z.string().trim().min(1, "ID скріншота є обов'язковим"),
});

export function parseApplicationsListQuery(request: Request) {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  let status: z.infer<typeof applicationStatusEnum>[] | undefined;
  if (statusParam) {
    const arr = statusParam.includes(",") ? statusParam.split(",").map((s) => s.trim()) : [statusParam];
    status = arr.filter(Boolean) as z.infer<typeof applicationStatusEnum>[];
  }
  return applicationsListQuerySchema.parse({
    schoolId: url.searchParams.get("schoolId") ?? undefined,
    status: status?.length ? status : undefined,
    search: url.searchParams.get("search") ?? undefined,
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "20",
  });
}
