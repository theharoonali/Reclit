/**
 * The spreadsheet the public form fills. Hardcoded until the dashboard grows
 * per-spreadsheet routing — /ai-spreadsheet itself always loads the newest
 * sheet, so there is nothing yet to derive this from.
 */
export const POPULATE_FORM_SPREADSHEET_ID =
  "772aaebb-96f0-48cf-a1ad-ae22121ff6a1";

/** Path of the public form for one spreadsheet. */
export const formPath = (spreadsheetId: string) => `/form/${spreadsheetId}`;
