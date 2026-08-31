-- Add the optional email column to User. Nullable: existing rows (the single
-- seeded user) simply have no email until one is saved from settings.
ALTER TABLE "User" ADD COLUMN "email" TEXT;
