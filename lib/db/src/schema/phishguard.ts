import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const phishguardUsers = pgTable("phishguard_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const phishguardScans = pgTable("phishguard_scans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => phishguardUsers.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  riskScore: integer("risk_score").notNull(),
  classification: text("classification").notNull(),
  prediction: text("prediction").notNull(),
  riskLevel: text("risk_level").notNull(),
  features: text("features").notNull(),
  positiveIndicators: text("positive_indicators").notNull(),
  riskIndicators: text("risk_indicators").notNull(),
  recommendation: text("recommendation").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const phishguardQuizResults = pgTable("phishguard_quiz_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => phishguardUsers.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  percentage: integer("percentage").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PhishguardUser = typeof phishguardUsers.$inferSelect;
export type PhishguardScan = typeof phishguardScans.$inferSelect;