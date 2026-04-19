import { describe, expect, it } from "bun:test"
import { sql } from "drizzle-orm"
import { createDb } from "@/db"

describe("createDb", () => {
  it("crea una conexión en memoria y ejecuta SELECT 1 sin errores", () => {
    const db = createDb(":memory:")

    expect(() => db.run(sql`SELECT 1`)).not.toThrow()
  })
})
