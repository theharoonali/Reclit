-- Add the onboarding flag to User (docs/plans/027-onboarding.md). New users
-- start at false and land on /onboarding; a user who already owns a workspace
-- has effectively onboarded, so the backfill sets them to true.
ALTER TABLE "User" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" u SET "onboardingCompleted" = true
WHERE EXISTS (SELECT 1 FROM "Workspace" w WHERE w."ownerId" = u."id");
