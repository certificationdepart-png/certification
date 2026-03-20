import type { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { prisma } from "@/lib/db";
import { AppError, NotFoundError } from "@/services/errors";
import {
  type TemplateCreateInput,
  type TemplateUpdateInput,
  templateCreateSchema,
  templateUpdateSchema,
} from "@/services/validation";

function mapPrismaError(error: unknown): never {
  if ((error as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
    throw new AppError("Код шаблону має бути унікальним у межах школи", 409, "unique_violation");
  }
  if (error instanceof ZodError) {
    throw new AppError(error.issues.map((i) => i.message).join("; "), 400, "validation_error");
  }
  throw error;
}

export async function listTemplatesBySchool(schoolId: string) {
  return prisma.messageTemplate.findMany({
    where: { schoolId },
    orderBy: { code: "asc" },
  });
}

export async function createTemplate(input: TemplateCreateInput) {
  try {
    const parsed = templateCreateSchema.parse(input);
    return prisma.messageTemplate.create({
      data: {
        schoolId: parsed.schoolId,
        code: parsed.code.toLowerCase(),
        text: parsed.text,
        description: parsed.description || null,
      },
    });
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function updateTemplate(id: string, schoolId: string, input: TemplateUpdateInput) {
  try {
    const parsed = templateUpdateSchema.parse(input);
    const existing = await prisma.messageTemplate.findFirst({
      where: { id, schoolId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Шаблон не знайдено");
    }
    return prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(parsed.code !== undefined ? { code: parsed.code.toLowerCase() } : {}),
        ...(parsed.text !== undefined ? { text: parsed.text } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description || null } : {}),
      },
    });
  } catch (error) {
    mapPrismaError(error);
  }
}

export async function deleteTemplate(id: string, schoolId: string) {
  const existing = await prisma.messageTemplate.findFirst({
    where: { id, schoolId },
    select: { id: true },
  });
  if (!existing) {
    throw new NotFoundError("Шаблон не знайдено");
  }
  await prisma.messageTemplate.delete({ where: { id } });
  return { ok: true };
}
