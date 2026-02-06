import Database from "better-sqlite3";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, "chess-prep.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");

    // Run schema
    const schemaPath = join(process.cwd(), "src", "lib", "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");
    _db.exec(schema);
  }
  return _db;
}
