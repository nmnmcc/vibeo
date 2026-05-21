import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const JobStatus = pgEnum("render_job_status", ["working", "failed", "succeed"]);

export const jobs = pgTable(
  "render_jobs",
  {
    id: uuid().primaryKey(),
    status: JobStatus().notNull().default("working"),

    input: text().notNull(),
    constraints: jsonb(),

    stdout: text("stdout").notNull().default(""),
    stderr: text("stderr").notNull().default(""),
    output: text(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index().on(table.status), index().on(table.createdAt)],
);
