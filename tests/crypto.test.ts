import { describe, expect, it } from "vitest";

describe("crypto secrets", () => {
  it("encrypts and decrypts back to the same value", async () => {
    process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";
    process.env.AUTH_SECRET ??= "12345678901234567890123456789012";
    process.env.DATA_ENCRYPTION_KEY ??= "12345678901234567890123456789012";

    const { decryptSecret, encryptSecret } = await import("../src/lib/crypto");
    const source = "telegram-secret-token";
    const encrypted = encryptSecret(source);
    const decrypted = decryptSecret(encrypted);

    expect(encrypted).not.toEqual(source);
    expect(decrypted).toEqual(source);
  });
});
