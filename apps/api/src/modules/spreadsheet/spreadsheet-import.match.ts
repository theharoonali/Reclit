// Column-name matching for imports, heuristic only: no model call, so the same
// file always lands the same way. Pure: no prisma, no NestJS, no I/O.
//
// Used twice: to merge a Word document's tables into one grid
// (`unionTables`), and to map that grid's columns onto the sheet's existing
// ones (`matchColumns`). Matching is deliberately conservative — a missed
// match only costs an extra column the user can delete, while a wrong one
// pours data into the wrong column.

const THRESHOLD = 0.85;

/**
 * Names that mean the same column, in compact form (see `compact`). A pair in
 * the same group scores just below an exact match, so an exact match still
 * wins when both are on offer.
 */
const SYNONYMS: string[][] = [
  ["email", "emailaddress", "mail", "emailid", "mailid"],
  [
    "phone",
    "phonenumber",
    "phoneno",
    "tel",
    "telephone",
    "mobile",
    "mobilenumber",
    "mobileno",
    "contactnumber",
    "contactno",
    "cellphone",
  ],
  ["name", "fullname"],
  ["firstname", "givenname", "fname"],
  ["lastname", "surname", "familyname", "lname"],
  ["company", "companyname", "organisation", "organization", "org"],
  ["website", "websiteurl", "url", "site", "homepage", "web"],
  ["address", "streetaddress"],
  ["zip", "zipcode", "postcode", "postalcode"],
  ["dob", "dateofbirth", "birthdate", "birthday"],
  ["qty", "quantity"],
  ["sno", "srno", "serialno", "serialnumber", "slno"],
];

const GROUP = new Map<string, number>(
  SYNONYMS.flatMap((group, index) => group.map((name) => [name, index])),
);

/** Lowercase word tokens, each singular. */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token !== "")
    .map(singular);
}

/** "addresses" → "address", "boxes" → "box", "names" → "name"; "status" stays. */
function singular(token: string): string {
  if (token.length <= 3 || !token.endsWith("s")) return token;
  if (/(ss|x|ch|sh)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("ss") || token.endsWith("us")) return token;
  return token.slice(0, -1);
}

const compact = (tokens: string[]) => tokens.join("");

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** 0..1. 1 means the same column; anything under 0.85 is no match. */
export function similarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const ca = compact(ta);
  const cb = compact(tb);
  if (ca === "" || cb === "") return 0;
  if (ca === cb) return 1;

  // "Address 1" and "Address 2" are siblings, never the same column.
  const digits = (text: string) => text.replace(/\D/g, "");
  if (digits(ca) !== digits(cb)) return 0;

  const ga = GROUP.get(ca);
  if (ga !== undefined && ga === GROUP.get(cb)) return 0.95;

  const sa = new Set(ta);
  const sb = new Set(tb);
  const shared = [...sa].filter((token) => sb.has(token)).length;
  const jaccard = shared / new Set([...ta, ...tb]).size;
  // Edit distance only means something on names long enough to have typos.
  const edit =
    Math.min(ca.length, cb.length) >= 5
      ? 1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length)
      : 0;
  return Math.max(jaccard, edit);
}

/**
 * One-to-one: each source column maps to at most one target and no target
 * takes two sources. The best-scoring pairs claim first, so an exact match is
 * never stolen by a fuzzy one. Returns the target index per source, or null.
 */
export function matchColumns(
  sources: string[],
  targets: string[],
): (number | null)[] {
  const pairs: { source: number; target: number; score: number }[] = [];
  for (const [source, sourceName] of sources.entries()) {
    for (const [target, targetName] of targets.entries()) {
      const score = similarity(sourceName, targetName);
      if (score >= THRESHOLD) pairs.push({ source, target, score });
    }
  }
  pairs.sort(
    (x, y) => y.score - x.score || x.source - y.source || x.target - y.target,
  );

  const result: (number | null)[] = sources.map(() => null);
  const claimed = new Set<number>();
  for (const { source, target } of pairs) {
    if (result[source] !== null || claimed.has(target)) continue;
    result[source] = target;
    claimed.add(target);
  }
  return result;
}

/** The header's width: up to its last named cell. */
function headerWidth(header: string[]): number {
  let width = 0;
  for (const [index, cell] of header.entries()) {
    if (cell.trim() !== "") width = index + 1;
  }
  return width;
}

const rowKey = (row: string[]) =>
  row.map((cell) => compact(nameTokens(cell))).join("\u0000");

/**
 * Many tables in, one grid out (header as row 0). The first table's header
 * sets the columns; each later table's columns land on the most similar
 * existing one, or are appended when nothing matches. A row that repeats its
 * table's header — Word repeats it after every page break — is dropped.
 *
 * Rows keep document order. A table that only adds columns the previous
 * tables of its group did not fill, with the same number of rows, continues
 * those rows instead of starting new ones: a document that repeats "Name, Age"
 * then "Phone, City" per person yields one row per person, not a staircase of
 * half-empty rows. A table that repeats a column already filled starts the
 * next group.
 */
export function unionTables(tables: string[][][]): string[][] {
  const header: string[] = [];
  const rows: string[][] = [];
  // The rows the current group of tables is filling, and the columns it has.
  let group: string[][] = [];
  const groupColumns = new Set<number>();

  for (const table of tables) {
    const own = (table[0] ?? []).map((cell) => cell.trim());
    const width = headerWidth(own);
    const names = own
      .slice(0, width)
      .map((name, index) => name || `Column ${index + 1}`);
    const matched = matchColumns(names, header);
    const position = names.map((name, index) => {
      const hit = matched[index];
      if (hit !== null && hit !== undefined) return hit;
      header.push(name);
      return header.length - 1;
    });

    const repeat = rowKey(own.slice(0, width));
    const data = table
      .slice(1)
      .map((row) => row.slice(0, width).map((cell) => cell.trim()))
      .filter((cells) => rowKey(cells) !== repeat);

    const continues =
      group.length > 0 &&
      group.length === data.length &&
      position.every((target) => !groupColumns.has(target));
    if (!continues) {
      group = data.map(() => []);
      rows.push(...group);
      groupColumns.clear();
    }
    for (const [rowIndex, cells] of data.entries()) {
      const out = group[rowIndex] ?? [];
      for (const [index, target] of position.entries()) {
        out[target] = cells[index] ?? "";
      }
    }
    for (const target of position) groupColumns.add(target);
  }

  return [header, ...rows.map((row) => header.map((_, i) => row[i] ?? ""))];
}
