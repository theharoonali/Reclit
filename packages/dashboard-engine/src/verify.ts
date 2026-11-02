import { tryParseFormula } from "./formula/parser";
import { checkLayout, type LayoutIssue, toRows } from "./layout";
import type { ColumnProfile } from "./profile";
import { runWidget } from "./query/run";
import { normalizeName, type SheetPayloadLike } from "./sheet";
import { validateWidget } from "./validate";
import {
  canonicalQuery,
  countedColumn,
  formulasOf,
  groupKeyOf,
  nonMeasureAggregate,
  type Profiles,
} from "./verify-query";
import {
  CATEGORY_KEY,
  GRID_COLUMNS,
  VALUE_KEY,
  type WidgetData,
  type WidgetSpec,
  type WidgetValue,
} from "./widget";

/**
 * Judges a generated dashboard the way a reviewer would: every card is run
 * over the sheet and its *result* is checked — empty, one bar, a pie of
 * twenty slices, a flat line, a sum over an id column, the same chart twice.
 * `validateWidget` says whether a query *can* run; this says whether the card
 * is worth showing. The issues go back into the generator's prompt, so the
 * messages are short English sentences, not UI copy. Never throws.
 */

export const VERIFY_ISSUE_CODES = [
  "QUERY_INVALID",
  "EMPTY_RESULT",
  "SINGLE_GROUP",
  "ALL_NULL",
  "TOO_MANY_SLICES",
  "TOO_MANY_CATEGORIES",
  "LONG_LABELS",
  "CONSTANT_SERIES",
  "NON_MEASURE_AGGREGATE",
  "ID_COUNT_STAT",
  "DUPLICATE_CARD",
] as const;
export type VerifyIssueCode = (typeof VERIFY_ISSUE_CODES)[number];

/** An `error` must be fixed; a `warn` is a chart that reads badly. */
export type VerifySeverity = "error" | "warn";

/** A generated card: the spec plus its title and width. */
export type VerifyCard = WidgetSpec & { name: string; column: number };

export type VerifyIssue = {
  code: VerifyIssueCode;
  severity: VerifySeverity;
  /** The card's position in the input. */
  cardIndex: number;
  cardName: string;
  message: string;
  /** The offending column, label or card, for the caller's own message. */
  detail?: string;
};

export const MAX_PIE_SLICES = 6;
export const MAX_RADAR_AXES = 8;
/** A category label longer than this crowds a bar's x-axis. */
export const MAX_LABEL_CHARS = 14;
/** Categories a bar/line/area fits, by the card's width (12 = full row). */
export const MAX_CATEGORIES_BY_SPAN: Readonly<Record<"6" | "12", number>> = {
  "6": 8,
  "12": 16,
};

/** What an earlier card looked like, for the duplicate check. */
type Seen = {
  index: number;
  name: string;
  type: string;
  canonical: string;
  groupKey: string;
  formulas: string;
};

const isSlices = (card: WidgetSpec) =>
  card.type === "pie" || (card.type === "radial" && card.variant === "default");

/** Bar (default/stacked), line and area: the charts with a labelled x-axis. */
const hasAxis = (card: WidgetSpec) =>
  card.type === "line" ||
  card.type === "area" ||
  (card.type === "bar" && card.variant !== "horizontal");

/**
 * The figures a result carries, as record fields with a label for a message:
 * a slice chart keeps its one measure under `value`; a grouped table's
 * leading `category` column is a label, not a figure.
 */
function measuresOf(
  card: VerifyCard,
  data: WidgetData,
): { key: string; label: string }[] {
  if (isSlices(card)) {
    return [
      {
        key: data.valueKey ?? VALUE_KEY,
        label: card.query.series[0]?.label ?? VALUE_KEY,
      },
    ];
  }
  return data.series
    .filter((series) => series.key !== CATEGORY_KEY)
    .map(({ key, label }) => ({ key, label }));
}

const longestLabel = (rows: readonly Record<string, WidgetValue>[]): string =>
  rows.reduce((longest, row) => {
    const label = String(row[CATEGORY_KEY] ?? "");
    return label.length > longest.length ? label : longest;
  }, "");

/** The label of the first measure whose non-null values are all one value. */
function constantSeries(
  measures: readonly { key: string; label: string }[],
  rows: readonly Record<string, WidgetValue>[],
): string | null {
  for (const measure of measures) {
    const values = rows
      .map((row) => row[measure.key] ?? null)
      .filter((value) => value !== null);
    if (values.length > 0 && values.every((value) => value === values[0])) {
      return measure.label;
    }
  }
  return null;
}

export function verifyDashboard(
  cards: readonly VerifyCard[],
  payload: SheetPayloadLike,
  profile: readonly ColumnProfile[],
): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const profiles: Profiles = new Map(
    profile.map((column) => [normalizeName(column.name), column] as const),
  );
  const seen: Seen[] = [];

  cards.forEach((card, cardIndex) => {
    const issue = (
      code: VerifyIssueCode,
      severity: VerifySeverity,
      message: string,
      detail?: string,
    ) => {
      issues.push(
        detail === undefined
          ? { code, severity, cardIndex, cardName: card.name, message }
          : { code, severity, cardIndex, cardName: card.name, message, detail },
      );
    };
    const title = `Card "${card.name}"`;

    const invalid = validateWidget(card, payload.columns);
    if (invalid.length > 0) {
      const first = invalid[0]?.message ?? "invalid query";
      issue("QUERY_INVALID", "error", `${title} cannot run: ${first}`, first);
      return;
    }
    const result = runWidget(card, payload);
    if (!result.ok) {
      const first = result.issues[0]?.message ?? "invalid query";
      issue("QUERY_INVALID", "error", `${title} cannot run: ${first}`, first);
      return;
    }

    const { data } = result;
    const rows = data.rows;
    const grouped = card.query.groupBy !== null;
    const measures = measuresOf(card, data);

    if (rows.length === 0) {
      issue("EMPTY_RESULT", "error", `${title} returns no rows.`);
    } else {
      const allNull = rows.every((row) =>
        measures.every((measure) => (row[measure.key] ?? null) === null),
      );
      if (allNull) {
        issue("ALL_NULL", "error", `${title} computes only blank figures.`);
      }
      if (grouped && rows.length < 2) {
        issue("SINGLE_GROUP", "error", `${title} has only one group to chart.`);
      }
      if (isSlices(card) && rows.length > MAX_PIE_SLICES) {
        issue(
          "TOO_MANY_SLICES",
          "error",
          `${title} has ${rows.length} slices; a pie reads well up to ${MAX_PIE_SLICES}.`,
        );
      }
      if (card.type === "radar" && rows.length > MAX_RADAR_AXES) {
        issue(
          "TOO_MANY_SLICES",
          "error",
          `${title} has ${rows.length} axes; a radar reads well up to ${MAX_RADAR_AXES}.`,
        );
      }
      if (hasAxis(card)) {
        const span = card.column >= 12 ? "12" : "6";
        const max = MAX_CATEGORIES_BY_SPAN[span];
        if (rows.length > max) {
          issue(
            "TOO_MANY_CATEGORIES",
            "warn",
            `${title} has ${rows.length} categories; a ${span}-wide chart fits ${max}.`,
          );
        }
        const longest = longestLabel(rows);
        if (longest.length > MAX_LABEL_CHARS) {
          issue(
            "LONG_LABELS",
            "warn",
            `${title} has category labels over ${MAX_LABEL_CHARS} characters.`,
            longest,
          );
        }
      }
      if (grouped && rows.length >= 2) {
        const constant = constantSeries(measures, rows);
        if (constant !== null) {
          issue(
            "CONSTANT_SERIES",
            "warn",
            `${title} has a series with the same value in every group.`,
            constant,
          );
        }
      }
    }

    const formulas = [
      ...card.query.series.map((series) => series.formula),
      ...(card.query.compare ? [card.query.compare.formula] : []),
    ];
    for (const text of formulas) {
      const parsed = tryParseFormula(text);
      if (!parsed.ok) continue;
      const found = nonMeasureAggregate(parsed.formula.ast, profiles);
      if (found) {
        issue(
          "NON_MEASURE_AGGREGATE",
          "error",
          `${title} aggregates a column that is not a measure.`,
          `${found.name}({${found.profile.name}}): "${found.profile.name}" is ${found.profile.role === "identifier" ? "an" : "a"} ${found.profile.role} column`,
        );
        break;
      }
    }

    if (card.type === "stat" && card.query.series.length === 1) {
      const parsed = tryParseFormula(card.query.series[0]?.formula ?? "");
      const key = parsed.ok ? countedColumn(parsed.formula.ast) : null;
      const counted = key === null ? undefined : profiles.get(key);
      if (counted?.role === "identifier") {
        issue(
          "ID_COUNT_STAT",
          "error",
          `${title} counts an identifier column, which is just the row count.`,
          counted.name,
        );
      }
    }

    const current: Seen = {
      index: cardIndex,
      name: card.name,
      type: card.type,
      canonical: canonicalQuery(card.query),
      groupKey: groupKeyOf(card.query),
      formulas: formulasOf(card.query),
    };
    const earlier = seen.find(
      (other) =>
        (other.type === current.type &&
          other.canonical === current.canonical) ||
        (other.groupKey === current.groupKey &&
          other.formulas === current.formulas),
    );
    if (earlier) {
      issue(
        "DUPLICATE_CARD",
        "error",
        `${title} repeats card "${earlier.name}".`,
        earlier.name,
      );
    }
    seen.push(current);
  });

  return issues;
}

/* ----------------------------------------------------------------- layout */

export type LayoutFillIssue = {
  code: "ROW_UNDERFILLED" | LayoutIssue["code"];
  row: number;
  message: string;
};

/**
 * The grid rules plus the generator's own: every row fills its 12 columns.
 * `checkLayout`'s issue, if any, comes first, then one `ROW_UNDERFILLED` per
 * short row.
 */
export function verifyLayout(
  widgets: readonly { row: number; column: number; sort: number }[],
): LayoutFillIssue[] {
  const issues: LayoutFillIssue[] = [];
  const invalid = checkLayout(widgets);
  if (invalid) {
    issues.push({
      code: invalid.code,
      row: invalid.row,
      message: invalid.message,
    });
  }
  for (const { row, widgets: items } of toRows(widgets)) {
    const used = items.reduce((total, widget) => total + widget.column, 0);
    if (used < GRID_COLUMNS) {
      issues.push({
        code: "ROW_UNDERFILLED",
        row,
        message: `row ${row} fills ${used} of ${GRID_COLUMNS} columns`,
      });
    }
  }
  return issues;
}
