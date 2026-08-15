/**
 * Shared outbound HTTP throttle for SEC EDGAR.
 *
 * SEC fair access allows 10 requests/second per IP
 * (https://www.sec.gov/os/webmaster-faq#developers). We budget ~7 req/s by
 * default (`SEC_RATE` env to override) so bursts across parallel handlers and
 * the multi-request doc/ownership ports never trip the fair-access limit.
 *
 * The budget is process-global: every caller in the server shares one bucket,
 * independent of Next's fetch cache (a caller decides its own cache policy via
 * the `revalidate` / `cache` options).
 */

import { HEADERS } from '@/lib/sec'

const DEFAULT_RATE = 7

const ratePerSec = (() => {
  const v = Number(process.env.SEC_RATE)
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_RATE
})()

const intervalMs = 1000 / ratePerSec
let nextSlot = 0

/** Wait until the next process-wide SEC request slot (≈ `SEC_RATE` req/s). */
export async function acquireSlot(): Promise<void> {
  const now = Date.now()
  nextSlot = Math.max(nextSlot, now) + intervalMs
  const wait = nextSlot - now
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait))
}

export type ThrottledFetchInit = {
  revalidate?: number
  headers?: Record<string, string>
  method?: string
  cache?: RequestCache
  signal?: AbortSignal
}

/** `fetch` guarded by the shared token bucket, carrying the SEC headers by default. */
export async function throttledFetch(url: string, init: ThrottledFetchInit = {}): Promise<Response> {
  await acquireSlot()
  const req: RequestInit = {
    method: init.method,
    headers: init.headers ? { ...HEADERS, ...init.headers } : HEADERS,
    signal: init.signal,
  }
  if (init.cache) req.cache = init.cache
  if (init.revalidate != null) req.next = { revalidate: init.revalidate }
  return fetch(url, req)
}
