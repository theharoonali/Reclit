import { tryParseFormula } from "./formula/parser";
import { type ColumnMeta, normalizeName } from "./sheet";
import {
  CATEGORY_KEY,
  MAX_SERIES,
  type QueryIssue,
  type QueryIssueCode,
  RESERVED_SERIES_KEYS,
  SERIES_KEY_RE,
  TOTAL_KEY,
  WIDGET_VARIANTS,
  type WidgetSpec,
  type WidgetType,
} from "./widget";

/**
 * Every semantic rule a widget query must satisfy, in one place: the API runs
 * this before storing a widget (so an LLM gets a precise error to fix), and
 * the browser runs it before computing (so a column renamed after the widget
 * was written shows as an issue inside that card, not a blank chart).
 *
 * The structural rules — field types, ranges, key uniqueness at the zod level
 * — belong to the API schema; this is about meaning.
 */

type Rules = {
  groupBy: "required" | "forbidden" | "optional";
  series: readonly [min: number, max: number];
  /** Whether `splitBy` (a pivot) is allowed. */
  split: boolean;
  /** Whether `compare` is allowed (stat only). */
  compare: boolean;
};

const CHART: Rules = {
  groupBy: "required",
  series: [1, MAX_SERIES],
  split: true,
  compare: false,
};
const SLICES: Rules = {
  groupBy: "required",
  series: [1, 1],
  split: false,
  compare: false,
};

function rulesFor(type: WidgetType, variant: string): Rules {
  switch (type) {
    case "stat":
      return {
        groupBy: "forbidden",
        series: [1, 4],
        split: false,
        compare: true,
      };
    case "pie":
      return SLICES;
    case "radial":
      if (variant === "stacked") {
        return {
          groupBy: "forbidden",
          series: [1, 5],
          split: false,
          compare: false,
        };
      }
      if (variant === "text") {
        return {
          groupBy: "forbidden",
          series: [1, 1],
          split: false,
          compare: false,
        };
      }
      return SLICES;
    case "table":
      return { ...CHART, groupBy: "optional" };
    default:
      return CHART;
  }
}

export function validateWidget(
  spec: WidgetSpec,
  columns: readonly ColumnMeta[],
): QueryIssue[] {
  const issues: QueryIssue[] = [];
  const byName = new Map(
    columns.map((column) => [normalizeName(column.name), column] as const),
  );
  const query = spec.query;
  const rules = rulesFor(spec.type, spec.variant);

  const issue = (
    code: QueryIssueCode,
    path: (string | number)[],
    message: string,
    detail?: string,
  ) => {
    issues.push(
      detail === undefined
        ? { code, path, message }
        : { code, path, message, detail },
    );
  };

  const column = (
    name: string,
    path: (string | number)[],
  ): ColumnMeta | null => {
    const found = byName.get(normalizeName(name));
    if (!found) {
      issue(
        "UNKNOWN_COLUMN",
        path,
        `Column "${name}" is not in the sheet`,
        name,
      );
    }
    return found ?? null;
  };

  const variants: readonly string[] = WIDGET_VARIANTS[spec.type];
  if (!variants.includes(spec.variant)) {
    issue(
      "VARIANT",
      ["variant"],
      `"${spec.variant}" is not a ${spec.type} variant (${variants.join(", ")})`,
    );
  }

  query.filters.forEach((filter, index) => {
    column(filter.column, ["filters", index, "column"]);
  });

  const groupBy = query.groupBy;
  if (rules.groupBy === "required" && groupBy === null) {
    issue(
      "GROUP_BY_REQUIRED",
      ["groupBy"],
      `${spec.type} needs a groupBy column`,
    );
  }
  if (rules.groupBy === "forbidden" && groupBy !== null) {
    issue(
      "GROUP_BY_FORBIDDEN",
      ["groupBy"],
      `${spec.type} (${spec.variant}) takes no groupBy`,
    );
  }
  if (groupBy) {
    const found = column(groupBy.column, ["groupBy", "column"]);
    if (found && groupBy.bucket !== "none" && found.type !== "date") {
      issue(
        "BUCKET_NOT_DATE",
        ["groupBy", "bucket"],
        `Column "${groupBy.column}" is not a date column; it cannot be bucketed by ${groupBy.bucket}`,
        groupBy.column,
      );
    }
  }

  const splitBy = query.splitBy;
  if (splitBy) {
    if (!rules.split || groupBy === null) {
      issue(
        "SPLIT_BY_FORBIDDEN",
        ["splitBy"],
        `${spec.type} (${spec.variant}) cannot be split into series here`,
      );
    } else {
      const found = column(splitBy.column, ["splitBy", "column"]);
      const bucket = splitBy.bucket ?? "none";
      if (found && bucket !== "none" && found.type !== "date") {
        issue(
          "BUCKET_NOT_DATE",
          ["splitBy", "bucket"],
          `Column "${splitBy.column}" is not a date column; it cannot be bucketed by ${bucket}`,
          splitBy.column,
        );
      }
      if (query.series.length !== 1) {
        issue(
          "SERIES_COUNT",
          ["series"],
          "A split widget takes exactly one series",
        );
      }
    }
  }

  const [min, max] = rules.series;
  if (query.series.length < min || query.series.length > max) {
    issue(
      "SERIES_COUNT",
      ["series"],
      min === max
        ? `${spec.type} (${spec.variant}) takes exactly ${min} series`
        : `${spec.type} (${spec.variant}) takes ${min} to ${max} series`,
    );
  }

  const rowLevel = spec.type === "table" && groupBy === null;
  const keys = new Set<string>();
  const seriesKeys = query.series.map((series) => series.key);

  query.series.forEach((series, index) => {
    const path = ["series", index];
    if (
      !SERIES_KEY_RE.test(series.key) ||
      RESERVED_SERIES_KEYS.includes(series.key)
    ) {
      issue(
        "SERIES_KEY",
        [...path, "key"],
        `"${series.key}" is not a valid series key`,
      );
    } else if (keys.has(series.key)) {
      issue(
        "SERIES_KEY",
        [...path, "key"],
        `Series key "${series.key}" is used twice`,
      );
    }
    keys.add(series.key);

    const parsed = tryParseFormula(series.formula);
    if (!parsed.ok) {
      issue(
        "FORMULA_INVALID",
        [...path, "formula"],
        parsed.error.message,
        parsed.error.message,
      );
    } else {
      for (const name of parsed.formula.columns)
        column(name, [...path, "formula"]);
      if (rowLevel && parsed.formula.isAggregate) {
        issue(
          "ROW_LEVEL_REQUIRED",
          [...path, "formula"],
          "A table without groupBy lists rows: its formulas cannot aggregate",
        );
      }
      if (!rowLevel && !parsed.formula.isAggregate) {
        issue(
          "AGGREGATE_REQUIRED",
          [...path, "formula"],
          `Series "${series.key}" must aggregate (SUM, AVG, COUNT, …)`,
        );
      }
    }

    if (series.detailKey !== undefined) {
      if (
        series.detailKey === series.key ||
        !seriesKeys.includes(series.detailKey)
      ) {
        issue(
          "DETAIL_KEY",
          [...path, "detailKey"],
          `detailKey "${series.detailKey}" is not another series key`,
        );
      }
    }
  });

  if (query.sort) {
    const allowed =
      query.sort.by === CATEGORY_KEY ||
      (query.sort.by === TOTAL_KEY && splitBy !== undefined) ||
      seriesKeys.includes(query.sort.by);
    if (!allowed) {
      issue(
        "SORT_KEY",
        ["sort", "by"],
        `sort.by "${query.sort.by}" is neither "category" nor a series key`,
      );
    }
  }

  if (query.compare) {
    if (!rules.compare) {
      issue(
        "COMPARE_FORBIDDEN",
        ["compare"],
        "Only a stat widget takes a compare figure",
      );
    }
    const parsed = tryParseFormula(query.compare.formula);
    if (!parsed.ok) {
      issue(
        "FORMULA_INVALID",
        ["compare", "formula"],
        parsed.error.message,
        parsed.error.message,
      );
    } else {
      for (const name of parsed.formula.columns)
        column(name, ["compare", "formula"]);
      if (!parsed.formula.isAggregate) {
        issue(
          "AGGREGATE_REQUIRED",
          ["compare", "formula"],
          "The compare formula must aggregate (SUM, AVG, COUNT, …)",
        );
      }
    }
  }

  return issues;
}
