import {
  BUCKETS,
  CHART_COLORS,
  COLUMN_KINDS,
  FILTER_OPS,
  GRID_COLUMNS,
  MAX_GROUP_LIMIT,
  MAX_SERIES,
  MAX_SPLIT_LIMIT,
  SERIES_KEY_RE,
  WIDGET_HEIGHTS,
  WIDGET_TYPES,
  type WidgetQuery,
} from "@reclit/dashboard-engine";
import { z } from "zod";
import { idInput, workspaceIdInput } from "../../common/schema";

// Single source of truth for the dashboard shapes. The vocabularies (types,
// variants, buckets, filter operators) come from @reclit/dashboard-engine so
// the API stores exactly what the browser can run. Like the spreadsheet, the
// wire vocabulary is lowercase ("bar", "md") and the database enum is its
// uppercase mirror; the 1:1 case mapping lives here.
//
// These schemas are *structural*. Whether a query makes sense for its widget
// — groupBy required, formulas aggregate, columns exist — is the engine's
// `validateWidget`, run by the service against the sheet.

export const widgetTypeWire = z.enum(WIDGET_TYPES);
export type WidgetTypeWire = z.infer<typeof widgetTypeWire>;
export type WidgetTypeDb = Uppercase<WidgetTypeWire>;
export const toDbWidgetType = (type: WidgetTypeWire): WidgetTypeDb =>
  type.toUpperCase() as WidgetTypeDb;
export const toWireWidgetType = (type: string): WidgetTypeWire =>
  type.toLowerCase() as WidgetTypeWire;

export const widgetHeightWire = z.enum(WIDGET_HEIGHTS);
export type WidgetHeightWire = z.infer<typeof widgetHeightWire>;
export type WidgetHeightDb = Uppercase<WidgetHeightWire>;
export const toDbWidgetHeight = (height: WidgetHeightWire): WidgetHeightDb =>
  height.toUpperCase() as WidgetHeightDb;
export const toWireWidgetHeight = (height: string): WidgetHeightWire =>
  height.toLowerCase() as WidgetHeightWire;

/* ------------------------------------------------------------------ query */

const columnName = z.string().trim().min(1).max(200);
const formula = z.string().trim().min(1, "A formula is required").max(1000);
const seriesKey = z
  .string()
  .max(50)
  .regex(SERIES_KEY_RE, "A series key is an identifier: letters, digits, _ -");
const label = z.string().trim().max(200);
const scalar = z.union([
  z.string().max(1000),
  z.number().finite(),
  z.boolean(),
]);
const scalarList = z
  .array(z.union([z.string().max(1000), z.number().finite()]))
  .max(100);

export const widgetFilterSchema = z
  .object({
    column: columnName,
    op: z.enum(FILTER_OPS),
    value: z.union([scalar, scalarList]).optional(),
  })
  .superRefine((filter, ctx) => {
    const blankTest = filter.op === "isEmpty" || filter.op === "notEmpty";
    if (!blankTest && filter.value === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `${filter.op} needs a value`,
      });
    }
    if (filter.op === "in" && !Array.isArray(filter.value)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "in takes an array of values",
      });
    }
    if (filter.op !== "in" && Array.isArray(filter.value)) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `${filter.op} takes one value, not an array`,
      });
    }
  });

export const widgetGroupBySchema = z.object({
  column: columnName,
  bucket: z.enum(BUCKETS).default("none"),
});

export const widgetSplitBySchema = z.object({
  column: columnName,
  bucket: z.enum(BUCKETS).optional(),
  limit: z.number().int().min(1).max(MAX_SPLIT_LIMIT).optional(),
});

export const widgetSeriesSpecSchema = z.object({
  key: seriesKey,
  label,
  formula,
  color: z.enum(CHART_COLORS).optional(),
  decimals: z.number().int().min(0).max(6).optional(),
  prefix: z.string().max(10).optional(),
  suffix: z.string().max(10).optional(),
  kind: z.enum(COLUMN_KINDS).optional(),
  detailKey: seriesKey.optional(),
});

export const widgetQuerySchema = z.object({
  filters: z.array(widgetFilterSchema).max(20).default([]),
  groupBy: widgetGroupBySchema.nullable().default(null),
  splitBy: widgetSplitBySchema.optional(),
  series: z.array(widgetSeriesSpecSchema).min(1).max(MAX_SERIES),
  sort: z
    .object({
      by: z.string().min(1).max(50),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
  limit: z.number().int().min(1).max(MAX_GROUP_LIMIT).optional(),
  compare: z.object({ formula, label }).optional(),
  footer: z.string().trim().max(200).optional(),
});

/**
 * The parsed query *is* the engine's `WidgetQuery` — this identity is where
 * the typecheck proves the zod shape and the engine type never drift.
 */
export const toWidgetQuery = (
  query: z.infer<typeof widgetQuerySchema>,
): WidgetQuery => query;

/* ---------------------------------------------------------------- outputs */

export const dashboardWidgetSchema = z.object({
  id: z.string(),
  dashboardId: z.string(),
  spreadsheetId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: widgetTypeWire,
  variant: z.string(),
  row: z.number().int(),
  column: z.number().int(),
  sort: z.number().int(),
  height: widgetHeightWire,
  query: widgetQuerySchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** The one dashboard of a workspace, widgets ordered by (row, sort). */
export const dashboardDetailSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  /** null → the page's default title / subtitle. */
  title: z.string().nullable(),
  description: z.string().nullable(),
  widgets: z.array(dashboardWidgetSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;
export type DashboardDetail = z.infer<typeof dashboardDetailSchema>;

/* ----------------------------------------------------------------- inputs */

/** Shared with the assistant; lives in `src/common/schema.ts`, re-exported for the router. */
export { workspaceIdInput };

/**
 * Undefaulted on purpose, so `updateWidgetInput` can be built from them
 * without a partial update silently resetting `variant` or `height`
 * (the `updateColumnInput` precedent in spreadsheet.schema.ts).
 */
const widgetFields = {
  spreadsheetId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(1000).nullable(),
  type: widgetTypeWire,
  variant: z.string().trim().min(1).max(50),
  row: z.number().int().min(0).max(100),
  column: z.number().int().min(1).max(GRID_COLUMNS),
  sort: z.number().int().min(0).max(100),
  height: widgetHeightWire,
  query: widgetQuerySchema,
};

/** One widget as written. `spreadsheetId` defaults to the workspace's sheet. */
export const widgetInputSchema = z.object({
  ...widgetFields,
  spreadsheetId: widgetFields.spreadsheetId.optional(),
  description: widgetFields.description.default(null),
  variant: widgetFields.variant.default("default"),
  height: widgetFields.height.default("md"),
});

const title = z.string().trim().min(1).max(200).nullable();
const description = z.string().trim().min(1).max(1000).nullable();

/** The whole dashboard at once — what an LLM writes. Creates it when missing. */
export const replaceDashboardInput = workspaceIdInput.extend({
  title: title.optional(),
  description: description.optional(),
  widgets: z.array(widgetInputSchema).max(50),
});

/** `null` clears a field; omitted leaves it alone. */
export const updateDashboardInput = workspaceIdInput.extend({
  title: title.optional(),
  description: description.optional(),
});

export const createWidgetInput = widgetInputSchema.extend(
  workspaceIdInput.shape,
);

export const updateWidgetInput = z
  .object(widgetFields)
  .partial()
  .extend(idInput.shape);

export type WidgetInput = z.infer<typeof widgetInputSchema>;
export type ReplaceDashboardInput = z.infer<typeof replaceDashboardInput>;
export type UpdateDashboardInput = z.infer<typeof updateDashboardInput>;
export type CreateWidgetInput = z.infer<typeof createWidgetInput>;
export type UpdateWidgetInput = z.infer<typeof updateWidgetInput>;
