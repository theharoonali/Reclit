-- CreateTable
CREATE TABLE "RunAiSession" (
    "id" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunAiSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunAiSession_spreadsheetId_idx" ON "RunAiSession"("spreadsheetId");

-- One open session per sheet.
CREATE UNIQUE INDEX "RunAiSession_open_sheet_key" ON "RunAiSession"("spreadsheetId")
  WHERE "status" = 'OPEN';

-- Every change publishes the session id, so open streams learn about a close
-- made by any process. See modules/run-ai/run-ai.feed.ts.
CREATE OR REPLACE FUNCTION run_ai_session_notify() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('run_ai_session_changed', NEW."id");
  RETURN NEW;
END;
$$;

CREATE TRIGGER run_ai_session_notify
AFTER INSERT OR UPDATE ON "RunAiSession"
FOR EACH ROW EXECUTE FUNCTION run_ai_session_notify();
