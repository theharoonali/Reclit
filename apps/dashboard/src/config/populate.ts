/**
 * Path of the public form for one spreadsheet. The id in the URL is the
 * spreadsheet's own id — the populate page derives it from the active
 * workspace (`useWorkspace().activeWorkspace.spreadsheetId`).
 */
export const formPath = (spreadsheetId: string) => `/form/${spreadsheetId}`;
