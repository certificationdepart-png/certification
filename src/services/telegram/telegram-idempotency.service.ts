import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

type RegisterResult = {
  isDuplicate: boolean;
};

type RegisterInput = {
  schoolId: string;
  updateId: bigint;
  chatId: string;
  telegramUserId: string;
  updateType: string;
  payload: unknown;
};

export async function registerIncomingUpdate(input: RegisterInput): Promise<RegisterResult> {
  try {
    await prisma.telegramUpdateLog.create({
      data: {
        schoolId: input.schoolId,
        updateId: input.updateId,
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        updateType: input.updateType,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return { isDuplicate: false };
  } catch (error) {
    if ((error as Prisma.PrismaClientKnownRequestError)?.code === "P2002") {
      return { isDuplicate: true };
    }
    throw error;
  }
}

