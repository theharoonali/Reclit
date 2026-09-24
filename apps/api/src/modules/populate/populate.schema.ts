import { z } from "zod";
import { idInput } from "../../common/schema";
import { runAiSchema } from "../run-ai/run-ai.schema";
import {
  cellValueSchema,
  columnTypeWire,
  sheetRowSchema,
} from "../spreadsheet/spreadsheet.schema";

// Populate = filling a sheet from outside the grid: the public form and the
// REST API share these shapes. Fields are addressed by column *name* — what a
// caller sees — never by index.

export const populateFieldSchema = z.object({
  name: z.string(),
  type: columnTypeWire,
  columnIndex: z.number().int(),
});

/** What a form needs to render: the sheet's name and its fillable columns. */
export const populateFormSchema = z.object({
  spreadsheet: z.object({ id: z.string(), name: z.string() }),
  fields: z.array(populateFieldSchema),
});

export const MAX_POPULATE_FIELDS = 256;

/** `null` entries write no cell; at least one entry must carry a value. */
export const populateSubmitInput = idInput.extend({
  fields: z
    .record(z.string().min(1).max(200), cellValueSchema)
    .refine((fields) => Object.keys(fields).length <= MAX_POPULATE_FIELDS, {
      message: `At most ${MAX_POPULATE_FIELDS} fields`,
    })
    .refine((fields) => Object.values(fields).some((value) => value !== null), {
      message: "At least one field needs a value",
    }),
});

/**
 * The saved row, the runs it started, and — when starting them failed — why.
 * `runError` never fails the submission: the row is already saved.
 */
export const populateSubmissionSchema = z.object({
  row: sheetRowSchema,
  runs: z.array(runAiSchema),
  runError: z.object({ code: z.string(), message: z.string() }).nullable(),
});

export type PopulateForm = z.infer<typeof populateFormSchema>;
export type PopulateSubmitInput = z.infer<typeof populateSubmitInput>;
export type PopulateSubmission = z.infer<typeof populateSubmissionSchema>;
