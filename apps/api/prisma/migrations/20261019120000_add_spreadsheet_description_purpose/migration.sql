-- The onboarding wizard's AI description of a sheet and its short label
-- (docs/plans/033-ai-onboarding-wizard.md). Both nullable: sheets created
-- outside onboarding have neither.
ALTER TABLE "Spreadsheet" ADD COLUMN "description" TEXT;
ALTER TABLE "Spreadsheet" ADD COLUMN "purpose" TEXT;
