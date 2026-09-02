-- DropTable
DROP TABLE "RunAiSession";


-- The trigger went with the table; its function does not.
DROP FUNCTION IF EXISTS run_ai_session_notify();
