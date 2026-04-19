import { describe, expect, it } from "bun:test"
import { createApp } from "@/app"
import { createDb } from "@/db"

describe("GET /health", () => {
  it("responde 200 con status ok y estado de la DB", async () => {
    const app = createApp(createDb(":memory:"))

    const res = await app.request("/health")
    const body = (await res.json()) as {
      status: string
      db: { status: string; responseTimeMs: number }
    }

    expect(res.status).toBe(200)
    expect(body.status).toBe("ok")
    expect(body.db.status).toBe("ok")
    expect(typeof body.db.responseTimeMs).toBe("number")
    expect(body.db.responseTimeMs).toBeGreaterThanOrEqual(0)
  })
})
