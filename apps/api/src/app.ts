import { sql } from "drizzle-orm"
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { Hono } from "hono"
import { createCompanyRoutes } from "@/modules/company/routes"

export const createApp = (db: BunSQLiteDatabase) => {
  const app = new Hono()

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : "internal"
    return c.json({ success: false, error: message }, 500)
  })

  app.get("/health", (c) => {
    const start = performance.now()
    let dbStatus: "ok" | "error" = "ok"
    try {
      db.run(sql`SELECT 1`)
    } catch {
      dbStatus = "error"
    }
    const responseTimeMs = performance.now() - start

    return c.json({
      status: "ok",
      db: {
        status: dbStatus,
        responseTimeMs,
      },
    })
  })

  app.route("/", createCompanyRoutes(db))

  return app
}

export type AppType = ReturnType<typeof createApp>
