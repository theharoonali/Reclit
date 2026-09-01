-- Give Column a display position independent of "index", which is identity —
-- the pk suffix "<sheetId>.col.<index>" and the address in Cell.columnIndex —
-- and must never move.
--
-- Backfill densely rather than copying "index": removeColumn leaves permanent
-- index gaps, and the reorder shift assumes a contiguous 0..n-1 range per
-- sheet. ROW_NUMBER() - 1 collapses the gaps, so indexes 0, 2, 5 become
-- sortOrder 0, 1, 2.
ALTER TABLE "Column" ADD COLUMN "sortOrder" INTEGER;

UPDATE "Column" c
SET "sortOrder" = r.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "spreadsheetId" ORDER BY "index" ASC) - 1 AS rn
  FROM "Column"
) r
WHERE c."id" = r."id";

ALTER TABLE "Column" ALTER COLUMN "sortOrder" SET NOT NULL;

-- Deliberately NOT unique: a reorder shifts a whole band in one UPDATE, and a
-- Postgres unique index is checked per row mid-statement (and cannot be
-- deferred), so the shift would collide transiently. Contiguity is a service
-- invariant, not a database one.
CREATE INDEX "Column_spreadsheetId_sortOrder_idx" ON "Column"("spreadsheetId", "sortOrder");
