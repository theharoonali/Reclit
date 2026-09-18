/**
 * Path of the public form for one spreadsheet. The id in the URL is the
 * spreadsheet's own id — the populate page derives it from the active
 * workspace (`useWorkspace().activeWorkspace.spreadsheetId`).
 */
export const formPath = (spreadsheetId: string) => `/form/${spreadsheetId}`;

/**
 * Path of the Populate API on the API origin (`API_BASE_URL`): `GET` answers
 * the fields, `POST` submits a row — the same submit the form performs.
 */
export const submitPath = (spreadsheetId: string) =>
  `/populate/${spreadsheetId}`;
