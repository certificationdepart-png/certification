/** Ukrainian labels; omit `timeZone` so the environment uses local TZ (browser or Node). */
export const UK_LOCALE = "uk-UA" as const;

/**
 * Human-friendly Ukrainian style, e.g. `Чт 23 Лют' 26, 23:43`:
 * short weekday (capitalized), day, short month with trailing `'`, 2-digit year, optional time.
 */
const UK_WEEKDAY_DATE_YEAR: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "2-digit",
};

const UK_TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

function toDate(value: string | Date | number): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

/** "лют." → "Лют'" */
function monthTokenForDisplay(raw: string): string {
  const base = raw.replace(/\.+$/, "").trim();
  if (!base) return raw;
  return base.charAt(0).toUpperCase() + base.slice(1) + "'";
}

function capitalizeAbbrev(raw: string): string {
  if (!raw) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatUkWeekdayDateYear(d: Date): string {
  const fmt = new Intl.DateTimeFormat(UK_LOCALE, UK_WEEKDAY_DATE_YEAR);
  const parts = fmt.formatToParts(d);
  const wd = capitalizeAbbrev(pickPart(parts, "weekday"));
  const day = pickPart(parts, "day");
  const month = monthTokenForDisplay(pickPart(parts, "month"));
  const year = pickPart(parts, "year");
  return `${wd} ${day} ${month} ${year}`;
}

/** Date only, e.g. Чт 23 Лют' 26 (in the local timezone). */
export function formatDate(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return "—";
  return formatUkWeekdayDateYear(d);
}

/** Date and time, e.g. Чт 23 Лют' 26, 23:43 (in the local timezone). */
export function formatDateTime(value: string | Date | number): string {
  const d = toDate(value);
  if (!d) return "—";
  const tf = new Intl.DateTimeFormat(UK_LOCALE, UK_TIME);
  const tp = tf.formatToParts(d);
  const hour = pickPart(tp, "hour");
  const minute = pickPart(tp, "minute");
  return `${formatUkWeekdayDateYear(d)}, ${hour}:${minute}`;
}
