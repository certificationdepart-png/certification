/** Extract spreadsheet ID from a Google Sheets URL. */
export function parseGoogleSpreadsheetIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.endsWith("google.com") && !u.hostname.endsWith("googleusercontent.com")) {
      return null;
    }
    const m = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}
