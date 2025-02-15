// src/db/schema.ts
import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

// Define the 'projects' table
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  image: text("image").notNull(),
  date: integer("date", { mode: "timestamp" }).notNull(), // Store dates as timestamps
  userEmail: text("user_email").notNull().references(() => users.email), // Foreign key to users
});

// Define the 'users' table
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  isActive: integer("is_active", { mode: "boolean" }).default(true), // Boolean as 0 or 1
});