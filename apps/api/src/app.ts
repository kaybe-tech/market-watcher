import { sql } from "drizzle-orm"
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { createCompanyRoutes } from "@/modules/company/routes"

export const createApp = (db: BunSQLiteDatabase) => {
  const app = new Hono()

  const DEV_WEBAPP_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ]
  const configuredOrigins = (process.env.ALLOWED_WEBAPP_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
  const allowedOrigins = new Set([...DEV_WEBAPP_ORIGINS, ...configuredOrigins])

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (origin?.startsWith("chrome-extension://")) return origin
        if (origin && allowedOrigins.has(origin)) return origin
        return null
      },
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  )

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
