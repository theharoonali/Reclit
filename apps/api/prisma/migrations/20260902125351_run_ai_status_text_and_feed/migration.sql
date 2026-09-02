-- RunAi.status: enum -> free text (uppercase), preserving existing rows.
-- Known values stay PENDING | RUNNING | COMPLETED | FAILED; any other word is a
-- custom working stage (ANALYZING, ...). COMPLETED and FAILED are terminal.
ALTER TABLE "RunAi" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RunAi" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "RunAi" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- DropEnum
DROP TYPE "RunAiStatus";

-- spreadsheetId: the sheet half of the scoped cellId "<sheetId>.cell.<r>.<c>",
-- denormalised so the live feed and the snapshot query filter through an index.
ALTER TABLE "RunAi" ADD COLUMN "spreadsheetId" TEXT;
UPDATE "RunAi" SET "spreadsheetId" = split_part("cellId", '.cell.', 1);
ALTER TABLE "RunAi" ALTER COLUMN "spreadsheetId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RunAi_spreadsheetId_updatedAt_idx" ON "RunAi"("spreadsheetId", "updatedAt");

-- One working run per cell. Rows that predate this rule: keep the newest
-- non-terminal run per cell, mark any older duplicate FAILED so the index can
-- be built.
UPDATE "RunAi" SET "status" = 'FAILED'
WHERE "status" NOT IN ('COMPLETED', 'FAILED')
  AND "id" NOT IN (
    SELECT DISTINCT ON ("cellId") "id" FROM "RunAi"
    WHERE "status" NOT IN ('COMPLETED', 'FAILED')
    ORDER BY "cellId", "createdAt" DESC
  );

CREATE UNIQUE INDEX "RunAi_active_cell_key" ON "RunAi"("cellId")
  WHERE "status" NOT IN ('COMPLETED', 'FAILED');

-- Change feed: every insert/update publishes the row id on `run_ai_changed`.
-- Only the id travels (NOTIFY payloads cap at 8000 bytes; `result` can exceed
-- it); the listener re-reads the row. See modules/run-ai/run-ai.feed.ts.
CREATE OR REPLACE FUNCTION run_ai_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('run_ai_changed', NEW."id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER run_ai_notify
AFTER INSERT OR UPDATE ON "RunAi"
FOR EACH ROW EXECUTE FUNCTION run_ai_notify();
