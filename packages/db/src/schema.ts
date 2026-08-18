import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Example table — replace with your real schema, then run:
//   bunx drizzle-kit generate   (from packages/db)
export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});
