import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
const configured = process.env.DB_PATH || './data/helpdesk.sqlite';
const dbPath = path.isAbsolute(configured) ? configured : path.resolve(repoRoot, configured);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
// Additive schema upgrades keep existing local databases compatible with new comment visibility.
const commentColumns = db.prepare('PRAGMA table_info(comments)').all().map((column) => column.name);
if (!commentColumns.includes('kind')) db.exec("ALTER TABLE comments ADD COLUMN kind TEXT NOT NULL DEFAULT 'reply' CHECK(kind IN ('reply','internal_note','resolution'))");
export { dbPath };
