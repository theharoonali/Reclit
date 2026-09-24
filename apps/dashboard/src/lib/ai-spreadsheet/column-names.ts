/**
 * Mirrors the backend's column-name rule (`SPREADSHEET_COLUMN_NAME_TAKEN`,
 * see the spreadsheet contract): a sheet's column names are unique, compared
 * trimmed and case-insensitively. The grid adds and renames columns
 * optimistically, so a name the server would refuse has to be refused here
 * first — otherwise the column appears, the request fails, and the two
 * disagree until a reload.
 *
 * `otherNames` are the names of every column *except* the one being edited —
 * a column may keep its own name.
 */
export function isColumnNameTaken(
  name: string,
  otherNames: readonly string[],
): boolean {
  const wanted = name.trim().toLowerCase();
  return (
    wanted !== "" &&
    otherNames.some((other) => other.trim().toLowerCase() === wanted)
  );
}
