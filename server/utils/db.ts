import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as schema from '../database/schema';

// Ensure data directory exists
const dbPath = process.env.DB_PATH || 'data/db.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// Helper types
export type Account = typeof schema.accounts.$inferSelect;
export type NewAccount = typeof schema.accounts.$inferInsert;
export type Article = typeof schema.articles.$inferSelect;
export type NewArticle = typeof schema.articles.$inferInsert;
