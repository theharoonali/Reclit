-- The public form's "Enable output" flag (docs/plans/034-form-output.md):
-- when set, visitors of /form/<id> watch their row's AI columns fill in.
ALTER TABLE "Spreadsheet" ADD COLUMN "formOutputEnabled" BOOLEAN NOT NULL DEFAULT false;
