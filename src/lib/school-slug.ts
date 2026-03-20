import { randomBytes } from "node:crypto";

/**
 * URL-safe slug from display name (ASCII + decomposed Latin). Falls back to random if empty.
 */
export function slugifySchoolName(name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (ascii.length >= 2) {
    return ascii;
  }
  return `school-${randomBytes(4).toString("hex")}`;
}
