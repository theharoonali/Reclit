import { evaluateAggregate, evaluateRow } from "../formula/evaluate";
import { type ParsedFormula, parseFormula } from "../formula/parser";
import { type RowScope, toNumber, toText, type Value } from "../formula/values";
import {
  type BoundRow,
  bindSheet,
  normalizeName,
  type SheetFrame,
  type SheetPayloadLike,
} from "../sheet";
import { validateWidget } from "../validate";
import {
  CATEGORY_KEY,
  CHART_COLORS,
  type ChartColor,
  DEFAULT_GROUP_LIMIT,
  DEFAULT_SPLIT_LIMIT,
  DEFAULT_TABLE_LIMIT,
  MAX_GROUP_LIMIT,
  MAX_SPLIT_LIMIT,
  ROW_ID_KEY,
  TOTAL_KEY,
  VALUE_KEY,
  type WidgetData,
  type WidgetQuery,
  type WidgetRecord,
  type WidgetResult,
  type WidgetSeries,
  type WidgetSeriesSpec,
  type WidgetSort,
  type WidgetSpec,
  type WidgetValue,
} from "../widget";
import { applyFilters } from "./filter";
import { compareOrder, type Group, partition } from "./group";

/**
 * Runs one widget's query over a sheet and shapes the result the way the
 * renderers expect (`WidgetData`). Never throws: a query that cannot run
 * reports its issues, so a card shows what is wrong instead of a chart that
 * is blank or a page that is broken.
 *
 * Shapes by widget:
 * - stat / radial(stacked|text): one record, every series an aggregate over
 *   all filtered rows.
 * - table without groupBy: one record per row, row-level formulas.
 * - everything else: one record per group (`category` = the group's label),
 *   every series an aggregate over the group; pie / radial(default) turn the
 *   groups into slices with minted keys (`k0`, `k1`, …) because a key becomes
 *   a CSS variable name downstream, and a category is free text.
 * - `splitBy` pivots: the top split values become the series (`s0`, `s1`, …).
 */

type Compiled = { spec: WidgetSeriesSpec; formula: ParsedFormula };
type Entry = { group: Group; record: WidgetRecord };

const scopesOf = (rows: readonly BoundRow[]): RowScope[] =>
  rows.map((row) => row.scope);

const colorAt = (index: number): ChartColor =>
  CHART_COLORS[index % CHART_COLORS.length] as ChartColor;

function toOutput(value: Value, decimals?: number): WidgetValue {
  if (value === null) return null;
  if (typeof value === "number") {
    if (decimals === undefined) return value;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
  return toText(value);
}

function toSeries(spec: WidgetSeriesSpec, index: number): WidgetSeries {
  const series: WidgetSeries = {
    key: spec.key,
    label: spec.label,
    color: spec.color ?? colorAt(index),
  };
  if (spec.prefix !== undefined) series.prefix = spec.prefix;
  if (spec.suffix !== undefined) series.suffix = spec.suffix;
  if (spec.kind !== undefined) series.kind = spec.kind;
  if (spec.detailKey !== undefined) series.detailKey = spec.detailKey;
  return series;
}

/**
 * Nulls sort last whichever way the sort runs; numbers numerically,
 * everything else as text.
 */
function compareValues(
  a: WidgetValue,
  b: WidgetValue,
  direction: 1 | -1,
): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") {
    return direction * (a - b);
  }
  const x = String(a);
  const y = String(b);
  return direction * (x < y ? -1 : x > y ? 1 : 0);
}

const directionOf = (sort: WidgetSort): 1 | -1 =>
  sort.direction === "desc" ? -1 : 1;

function sortEntries(entries: Entry[], sort: WidgetSort): Entry[] {
  const direction = directionOf(sort);
  const by = sort.by;
  return [...entries].sort((a, b) =>
    by === CATEGORY_KEY
      ? direction * compareOrder(a.group.order, b.group.order)
      : compareValues(a.record[by] ?? null, b.record[by] ?? null, direction),
  );
}

const groupLimit = (query: WidgetQuery) =>
  Math.min(query.limit ?? DEFAULT_GROUP_LIMIT, MAX_GROUP_LIMIT);

/** The sheet's own spelling of a column name, for a label. */
const displayName = (frame: SheetFrame, column: string) =>
  frame.columnByName.get(normalizeName(column))?.name ?? column;

/** Every series over every group — the grouped charts' core. */
function computeEntries(series: Compiled[], groups: Group[]): Entry[] {
  return groups.map((group) => {
    const scopes = scopesOf(group.rows);
    const record: WidgetRecord = {};
    for (const item of series) {
      record[item.spec.key] = toOutput(
        evaluateAggregate(item.formula.ast, scopes),
        item.spec.decimals,
      );
    }
    return { group, record };
  });
}

/** "+12%" against a non-zero base, "+12" otherwise; null without both figures. */
function describeDelta(
  value: number | null,
  base: number | null,
): { trend: "up" | "down"; text: string } | null {
  if (value === null || base === null) return null;
  const delta = value - base;
  const trend = delta >= 0 ? "up" : "down";
  const sign = delta >= 0 ? "+" : "-";
  if (base !== 0) {
    const percent = Math.round((Math.abs(delta) / Math.abs(base)) * 100);
    return { trend, text: `${sign}${percent}%` };
  }
  return { trend, text: `${sign}${Math.round(Math.abs(delta) * 100) / 100}` };
}

function single(
  spec: WidgetSpec,
  series: Compiled[],
  first: Compiled,
  rows: BoundRow[],
): WidgetData {
  const scopes = scopesOf(rows);
  const record: WidgetRecord = {};
  for (const item of series) {
    record[item.spec.key] = toOutput(
      evaluateAggregate(item.formula.ast, scopes),
      item.spec.decimals,
    );
  }
  const query = spec.query;

  if (spec.type === "stat") {
    const data: WidgetData = {
      valueKey: first.spec.key,
      // Every series, headline included: the renderer formats the headline
      // from its series (prefix, suffix) and lists the others beside it.
      series: series.map((item, index) => toSeries(item.spec, index)),
      rows: [record],
    };
    if (query.compare) {
      const base = toNumber(
        evaluateAggregate(parseFormula(query.compare.formula).ast, scopes),
      );
      const delta = describeDelta(
        toNumber(record[first.spec.key] ?? null),
        base,
      );
      if (delta) {
        data.trend = delta.trend;
        data.footer = `${delta.text} ${query.compare.label}`.trim();
      }
    } else if (query.footer !== undefined) {
      data.footer = query.footer;
    }
    return data;
  }

  // radial stacked / text: the caption under the centre figure is the
  // category; `text` also colours its one ring by it.
  record[CATEGORY_KEY] = spec.variant === "text" ? first.spec.key : "";
  return {
    categoryKey: CATEGORY_KEY,
    valueKey: first.spec.key,
    series: series.map((item, index) => toSeries(item.spec, index)),
    rows: [record],
    ...(query.footer !== undefined ? { footer: query.footer } : {}),
  };
}

function rowTable(
  query: WidgetQuery,
  series: Compiled[],
  rows: BoundRow[],
): WidgetData {
  let records = rows.map((row) => {
    const record: WidgetRecord = { [ROW_ID_KEY]: row.id };
    for (const item of series) {
      record[item.spec.key] = toOutput(
        evaluateRow(item.formula.ast, row.scope),
        item.spec.decimals,
      );
    }
    return record;
  });
  if (query.sort) {
    const direction = directionOf(query.sort);
    const by = query.sort.by;
    records =
      by === CATEGORY_KEY
        ? direction === 1
          ? records
          : [...records].reverse()
        : [...records].sort((a, b) =>
            compareValues(a[by] ?? null, b[by] ?? null, direction),
          );
  }
  const limit = Math.min(query.limit ?? DEFAULT_TABLE_LIMIT, MAX_GROUP_LIMIT);
  return {
    categoryKey: ROW_ID_KEY,
    series: series.map((item, index) => toSeries(item.spec, index)),
    rows: records.slice(0, limit),
    ...(query.footer !== undefined ? { footer: query.footer } : {}),
  };
}

function grouped(
  spec: WidgetSpec,
  series: Compiled[],
  first: Compiled,
  groups: Group[],
  frame: SheetFrame,
  chronological: boolean,
): WidgetData {
  const query = spec.query;
  const slices =
    spec.type === "pie" ||
    (spec.type === "radial" && spec.variant === "default");
  const defaultSort: WidgetSort = chronological
    ? { by: CATEGORY_KEY, direction: "asc" }
    : { by: first.spec.key, direction: "desc" };
  const entries = sortEntries(
    computeEntries(series, groups),
    query.sort ?? defaultSort,
  ).slice(0, groupLimit(query));

  if (slices) {
    return {
      categoryKey: CATEGORY_KEY,
      valueKey: VALUE_KEY,
      series: entries.map((entry, index) => ({
        key: `k${index}`,
        label: entry.group.label,
        color: colorAt(index),
      })),
      rows: entries.map((entry, index) => ({
        [CATEGORY_KEY]: `k${index}`,
        [VALUE_KEY]: entry.record[first.spec.key] ?? null,
      })),
      ...(query.footer !== undefined ? { footer: query.footer } : {}),
    };
  }

  const outSeries = series.map((item, index) => toSeries(item.spec, index));
  if (spec.type === "table" && query.groupBy) {
    outSeries.unshift({
      key: CATEGORY_KEY,
      label: displayName(frame, query.groupBy.column),
    });
  }
  return {
    categoryKey: CATEGORY_KEY,
    series: outSeries,
    rows: entries.map((entry) => ({
      [CATEGORY_KEY]: entry.group.label,
      ...entry.record,
    })),
    ...(query.footer !== undefined ? { footer: query.footer } : {}),
  };
}

function pivot(
  spec: WidgetSpec,
  first: Compiled,
  groups: Group[],
  rows: BoundRow[],
  frame: SheetFrame,
  chronological: boolean,
): WidgetData {
  const query = spec.query;
  const splitBy = query.splitBy as NonNullable<WidgetQuery["splitBy"]>;
  const bucket = splitBy.bucket ?? "none";
  const limit = Math.min(splitBy.limit ?? DEFAULT_SPLIT_LIMIT, MAX_SPLIT_LIMIT);

  // The series: the top split values by the measure over all their rows —
  // or, for a date split, the first buckets in time.
  const splitChronological =
    bucket !== "none" || columnType(frame, splitBy.column) === "date";
  const ranked = partition(rows, splitBy.column, bucket)
    .map((split) => ({
      split,
      total:
        toNumber(evaluateAggregate(first.formula.ast, scopesOf(split.rows))) ??
        0,
    }))
    .sort((a, b) =>
      splitChronological
        ? compareOrder(a.split.order, b.split.order)
        : b.total - a.total,
    )
    .slice(0, limit);

  const splitIndex = new Map<string, number>();
  ranked.forEach(({ split }, index) => {
    for (const row of split.rows) splitIndex.set(row.id, index);
  });

  const entries: Entry[] = groups.map((group) => {
    const buckets: BoundRow[][] = ranked.map(() => []);
    for (const row of group.rows) {
      const index = splitIndex.get(row.id);
      if (index !== undefined) buckets[index]?.push(row);
    }
    const record: WidgetRecord = {};
    let total = 0;
    buckets.forEach((subset, index) => {
      const value = evaluateAggregate(first.formula.ast, scopesOf(subset));
      record[`s${index}`] = toOutput(value, first.spec.decimals);
      total += toNumber(value) ?? 0;
    });
    record[TOTAL_KEY] = total;
    return { group, record };
  });

  const requested = query.sort;
  const sort: WidgetSort = requested
    ? requested.by === first.spec.key
      ? { ...requested, by: TOTAL_KEY }
      : requested
    : chronological
      ? { by: CATEGORY_KEY, direction: "asc" }
      : { by: TOTAL_KEY, direction: "desc" };
  const sorted = sortEntries(entries, sort).slice(0, groupLimit(query));

  const outSeries: WidgetSeries[] = ranked.map(({ split }, index) => ({
    key: `s${index}`,
    label: split.label,
    color: colorAt(index),
  }));
  if (spec.type === "table" && query.groupBy) {
    outSeries.unshift({
      key: CATEGORY_KEY,
      label: displayName(frame, query.groupBy.column),
    });
  }
  return {
    categoryKey: CATEGORY_KEY,
    series: outSeries,
    rows: sorted.map(({ group, record }) => {
      const { [TOTAL_KEY]: _total, ...values } = record;
      return { [CATEGORY_KEY]: group.label, ...values };
    }),
    ...(query.footer !== undefined ? { footer: query.footer } : {}),
  };
}

const columnType = (frame: SheetFrame, column: string) =>
  frame.columnByName.get(normalizeName(column))?.type;

export function runWidget(
  spec: WidgetSpec,
  payload: SheetPayloadLike,
): WidgetResult {
  const frame = bindSheet(payload);
  const issues = validateWidget(spec, frame.columns);
  if (issues.length > 0) return { ok: false, issues };

  const query = spec.query;
  const series: Compiled[] = query.series.map((item) => ({
    spec: item,
    formula: parseFormula(item.formula),
  }));
  // Validation guarantees at least one series.
  const first = series[0] as Compiled;
  const rows = applyFilters(frame.rows, query.filters);

  if (query.groupBy === null) {
    return {
      ok: true,
      data:
        spec.type === "table"
          ? rowTable(query, series, rows)
          : single(spec, series, first, rows),
    };
  }

  const groups = partition(rows, query.groupBy.column, query.groupBy.bucket);
  const chronological =
    query.groupBy.bucket !== "none" ||
    columnType(frame, query.groupBy.column) === "date";
  return {
    ok: true,
    data: query.splitBy
      ? pivot(spec, first, groups, rows, frame, chronological)
      : grouped(spec, series, first, groups, frame, chronological),
  };
}
