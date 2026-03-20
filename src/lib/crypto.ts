import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(env.DATA_ENCRYPTION_KEY, "utf8").digest();
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  // Legacy compatibility:
  // Some environments may have stored already-plaintext Telegram bot tokens in the
  // "*Enc" columns. Decryption would otherwise throw and break screenshot loading.
  //
  // Telegram bot tokens look like: "<digits>:<token-with-dashes>".
  // Encryption format used by this app is: "<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>"
  const parts = payload.split(":");
  if (parts.length === 2) {
    const [maybeBotId, maybeToken] = parts;
    const isTelegramToken =
      /^\d{4,20}$/.test(maybeBotId) && /^[A-Za-z0-9_-]{30,}$/.test(maybeToken);
    if (isTelegramToken) {
      return payload;
    }
  }

  const [ivPart, authTagPart, encryptedPart] = parts;

  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error("Некоректний формат зашифрованого значення");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivPart, "base64");
  const authTag = Buffer.from(authTagPart, "base64");
  const encrypted = Buffer.from(encryptedPart, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
