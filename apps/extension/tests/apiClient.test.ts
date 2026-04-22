import { describe, expect, it, mock } from "bun:test"
import { sendEstimates } from "../src/lib/apiClient"

describe("sendEstimates", () => {
  it("POST al endpoint /estimates con el body serializado", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 200 }))
    globalThis.fetch = fetchMock as typeof fetch
    const result = await sendEstimates("http://localhost:3000", "NVDA", {
      source: "tikr",
      years: [{ fiscalYearEnd: "2027-01-31", salesGrowth: 0.45 }],
    })
    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe("http://localhost:3000/companies/NVDA/estimates")
  })
})
