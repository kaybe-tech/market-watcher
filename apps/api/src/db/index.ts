import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"

export const createDb = (path: string) => drizzle(new Database(path))

export const db = createDb(process.env.DATABASE_PATH ?? "market-watcher.db")
