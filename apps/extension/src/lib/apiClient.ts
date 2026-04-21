export type IngestYear = {
  fiscalYearEnd: string
  incomeStatement?: Record<string, number>
  freeCashFlow?: Record<string, number>
  roic?: Record<string, number>
}

export type IngestPayload = {
  currentPrice?: number
  years: IngestYear[]
}

export type IngestResult =
  | { ok: true }
  | { ok: false; status: number | null; message: string }

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as { error?: unknown }
    if (typeof data.error === "string") return data.error
  } catch {
    // response wasn't JSON; fall through
  }
  return response.statusText || `HTTP ${response.status}`
}

export const sendIngest = async (
  apiUrl: string,
  ticker: string,
  payload: IngestPayload,
): Promise<IngestResult> => {
  const base = apiUrl.replace(/\/+$/, "")
  const url = `${base}/companies/${encodeURIComponent(ticker)}/data`
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error"
    return { ok: false, status: null, message }
  }
  if (!response.ok) {
    const message = await parseErrorMessage(response)
    return { ok: false, status: response.status, message }
  }
  return { ok: true }
}
