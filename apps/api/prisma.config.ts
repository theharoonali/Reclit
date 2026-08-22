import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL is loaded from apps/api/.env by dotenv (the Prisma CLI does not
// load it on its own).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
