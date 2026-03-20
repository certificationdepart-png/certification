import type { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { prisma } from "@/lib/db";
import { AppError, NotFoundError } from "@/services/errors";
import {
  type CourseCreateInput,
  type CourseUpdateInput,
  courseCreateSchema,
  courseUpdateSchema,
} from "@/services/validation";

function mapPrismaError(error: unknown): never {
  if ((error as Prisma.PrismaClientKnownRequestError)?.code === "P2003") {
    throw new AppError("Невірне посилання на школу", 400, "invalid_school_id");
  }
  if (error instanceof ZodError) {
    throw new AppError(error.issues.map((i) => i.message).join("; "), 400, "validation_error");
  }
  throw error;
}

export async function listCoursesBySchool(schoolId: string) {
  return prisma.course.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCourse(input: CourseCreateInput) {
  try {
    const parsed = courseCreateSchema.parse(input);
    return prisma.course.create({
      data: {
        schoolId: parsed.schoolId,
        title: parsed.title,
        certificateType: parsed.certificateType,
        daysToSend: parsed.daysToSend,
        reviewLink: parsed.reviewLink || null,
        bprEnabled: parsed.bprEnabled,
        bprSpecialtyCheckLink: parsed.bprSpecialtyCheckLink?.trim() ? parsed.bprSpecialtyCheckLink.trim() : null,
        bprTestLink: parsed.bprTestLink?.trim() ? parsed.bprTestLink.trim() : null,
        requirementsText: parsed.requirementsText,
      },
    });
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function updateCourse(id: string, schoolId: string, input: CourseUpdateInput) {
  try {
    const parsed = courseUpdateSchema.parse(input);
    const existing = await prisma.course.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Курс не знайдено");
    }
    return prisma.course.update({
      where: { id },
      data: {
        ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        ...(parsed.certificateType !== undefined ? { certificateType: parsed.certificateType } : {}),
        ...(parsed.daysToSend !== undefined ? { daysToSend: parsed.daysToSend } : {}),
        ...(parsed.reviewLink !== undefined ? { reviewLink: parsed.reviewLink || null } : {}),
        ...(parsed.bprEnabled !== undefined ? { bprEnabled: parsed.bprEnabled } : {}),
        ...(parsed.bprSpecialtyCheckLink !== undefined
          ? { bprSpecialtyCheckLink: parsed.bprSpecialtyCheckLink.trim() ? parsed.bprSpecialtyCheckLink.trim() : null }
          : {}),
        ...(parsed.bprTestLink !== undefined
          ? { bprTestLink: parsed.bprTestLink.trim() ? parsed.bprTestLink.trim() : null }
          : {}),
        ...(parsed.requirementsText !== undefined ? { requirementsText: parsed.requirementsText } : {}),
      },
    });
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function deleteCourse(id: string, schoolId: string) {
  const existing = await prisma.course.findFirst({
    where: { id, schoolId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("Курс не знайдено");
  }
  await prisma.course.delete({ where: { id } });
  return { ok: true };
}
