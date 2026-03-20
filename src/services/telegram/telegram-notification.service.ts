import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { createTelegramClientWithLogging } from "@/services/telegram/telegram-client-with-logging";

const AFTER_CONFIRMATION_FALLBACK =
  "Доброго дня, {{name}} 🫶\n\nДані для отримання сертифіката перевірено та прийнято ✅\nОчікуйте оформлення та відправку Ваших документів протягом {{days}} днів ✉️";
const NOVA_POSHTA_WARNING_FALLBACK =
  "☝️ Відповідальність за стан документів під час доставки несе Нова пошта.\n\nУ разі пошкодження, будь ласка, оформіть акт у відділенні та надішліть нам його фото — ми здійснимо повторне відправлення 💌\n\nПовторне відправлення можливе й без акту, однак акт необхідний для компенсації за очікування та незручності 📦";

async function getTemplateText(schoolId: string, code: string, fallback: string): Promise<string> {
  const template = await prisma.messageTemplate.findUnique({
    where: { schoolId_code: { schoolId, code } },
    select: { text: true },
  });
  return template?.text ?? fallback;
}

function substituteVariables(text: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{{${key}}}`, String(value));
  }, text);
}

export async function sendConfirmationNotifications(
  applicationId: string,
): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      school: { select: { id: true, telegramBotTokenEnc: true } },
      courses: { include: { course: { select: { daysToSend: true } } } },
    },
  });

  if (!application) return;
  if (application.confirmationNotifiedAt) return;

  const botToken = decryptSecret(application.school.telegramBotTokenEnc);
  const telegramClient = createTelegramClientWithLogging(application.schoolId);
  const maxDays =
    application.courses.length > 0
      ? Math.max(...application.courses.map((ac) => ac.course.daysToSend))
      : 7;

  const afterConfirmationText = await getTemplateText(
    application.schoolId,
    "after_confirmation",
    AFTER_CONFIRMATION_FALLBACK,
  );
  const message1 = substituteVariables(afterConfirmationText, {
    name: application.studentNameUa,
    days: String(maxDays),
  });

  await telegramClient.sendMessage({
    botToken,
    chatId: application.chatId,
    text: message1,
  });

  if (application.deliveryMode === "ua") {
    const novaPoshtaText = await getTemplateText(
      application.schoolId,
      "nova_poshta_warning",
      NOVA_POSHTA_WARNING_FALLBACK,
    );
    await telegramClient.sendMessage({
      botToken,
      chatId: application.chatId,
      text: novaPoshtaText,
    });
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: { confirmationNotifiedAt: new Date() },
  });
}
