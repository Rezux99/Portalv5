/**
 * SEC EDGAR data layer.
 *
 * Every SEC endpoint requires a declared User-Agent (see
 * https://www.sec.gov/os/webmaster-faq#developers) and is rate limited to
 * 10 requests/second. All calls are server-side only so the browser never
 * hits sec.gov directly (CORS + rate limit isolation).
 */

export const SEC_UA =
  process.env.SEC_USER_AGENT || 'EDGAR-EXTRACT-Terminal/1.0 (contact: admin@example.com)'

export const HEADERS = {
  'User-Agent': SEC_UA,
  'Accept-Encoding': 'gzip, deflate',
  Accept: 'application/json, text/html, */*',
} as const

export type SecFetchOpts = { revalidate?: number; text?: boolean }

export async function secFetch<T = unknown>(url: string, opts: SecFetchOpts = {}): Promise<T> {
  const { throttledFetch } = await import('./sec-http')
  const res = await throttledFetch(url, { revalidate: opts.revalidate ?? 60 })
  if (!res.ok) {
    throw new SecError(`SEC ${res.status} ${res.statusText} :: ${url}`, res.status)
  }
  return (opts.text ? await res.text() : await res.json()) as T
}

export class SecError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = 'SecError'
    this.status = status
  }
}

export const padCik = (cik: string | number) => String(cik).replace(/\D/g, '').padStart(10, '0')
export const shortCik = (cik: string | number) => String(Number(String(cik).replace(/\D/g, '')))

/* ------------------------------------------------------------------ *
 * Ticker / CIK universe
 * ------------------------------------------------------------------ */

export type TickerRow = { cik: string; ticker: string; name: string; exchange?: string }

type CompanyTickersExchange = {
  fields: string[]
  data: (string | number)[][]
}

let universeCache: { at: number; rows: TickerRow[] } | null = null

export async function getUniverse(): Promise<TickerRow[]> {
  if (universeCache && Date.now() - universeCache.at < 6 * 60 * 60 * 1000) {
    return universeCache.rows
  }
  const json = await secFetch<CompanyTickersExchange>(
    'https://www.sec.gov/files/company_tickers_exchange.json',
    { revalidate: 21600 },
  )
  const idx = (f: string) => json.fields.indexOf(f)
  const iC = idx('cik')
  const iN = idx('name')
  const iT = idx('ticker')
  const iE = idx('exchange')
  const rows: TickerRow[] = json.data.map((r) => ({
    cik: padCik(r[iC] as number),
    name: String(r[iN] ?? ''),
    ticker: String(r[iT] ?? ''),
    exchange: iE >= 0 ? String(r[iE] ?? '') : undefined,
  }))
  universeCache = { at: Date.now(), rows }
  return rows
}

/* Accepts a CIK (padded or bare) or a ticker/company name so every endpoint
   is usable straight from curl or the Python client, not just from the UI. */
export async function resolveCik(input: string): Promise<string | null> {
  const s = input.trim()
  if (!s) return null
  if (/^(cik)?[\s-]*\d+$/i.test(s)) return padCik(s)
  const hits = await searchUniverse(s, 1)
  return hits[0] ? padCik(hits[0].cik) : null
}

export async function searchUniverse(q: string, limit = 12): Promise<TickerRow[]> {
  const rows = await getUniverse()
  const term = q.trim().toUpperCase()
  if (!term) return []
  const scored: { row: TickerRow; score: number }[] = []
  for (const row of rows) {
    const t = row.ticker.toUpperCase()
    const n = row.name.toUpperCase()
    let score = -1
    if (t === term) score = 0
    else if (t.startsWith(term)) score = 1
    else if (n.startsWith(term)) score = 2
    else if (row.cik === padCik(term)) score = 0
    else if (n.includes(term)) score = 3
    else if (t.includes(term)) score = 4
    if (score >= 0) scored.push({ row, score })
    if (scored.length > 4000) break
  }
  scored.sort((a, b) => a.score - b.score || a.row.name.length - b.row.name.length)
  return scored.slice(0, limit).map((s) => s.row)
}

/* ------------------------------------------------------------------ *
 * Submissions (filing history + entity metadata)
 * ------------------------------------------------------------------ */

export type RawSubmissions = {
  cik: string
  name: string
  tickers?: string[]
  exchanges?: string[]
  sic?: string
  sicDescription?: string
  entityType?: string
  ein?: string
  category?: string
  fiscalYearEnd?: string
  stateOfIncorporation?: string
  phone?: string
  website?: string
  addresses?: Record<string, Record<string, string | null>>
  formerNames?: { name: string; from: string; to: string }[]
  filings: {
    recent: Record<string, (string | number)[]>
    files?: { name: string; filingCount: number; filingFrom: string; filingTo: string }[]
  }
}

export type Filing = {
  accession: string
  form: string
  filed: string
  reportDate: string
  primaryDoc: string
  primaryDocDescription: string
  items: string
  size: number
  isXBRL: boolean
  url: string
  indexUrl: string
}

export function normalizeFilings(cik: string, recent: Record<string, (string | number)[]>): Filing[] {
  const n = recent.accessionNumber?.length ?? 0
  const bare = shortCik(cik)
  const out: Filing[] = []
  for (let i = 0; i < n; i++) {
    const acc = String(recent.accessionNumber[i])
    const accNoDash = acc.replace(/-/g, '')
    const doc = String(recent.primaryDocument?.[i] ?? '')
    out.push({
      accession: acc,
      form: String(recent.form?.[i] ?? ''),
      filed: String(recent.filingDate?.[i] ?? ''),
      reportDate: String(recent.reportDate?.[i] ?? ''),
      primaryDoc: doc,
      primaryDocDescription: String(recent.primaryDocDescription?.[i] ?? ''),
      items: String(recent.items?.[i] ?? ''),
      size: Number(recent.size?.[i] ?? 0),
      isXBRL: Boolean(Number(recent.isXBRL?.[i] ?? 0)),
      url: `https://www.sec.gov/Archives/edgar/data/${bare}/${accNoDash}/${doc}`,
      indexUrl: `https://www.sec.gov/Archives/edgar/data/${bare}/${accNoDash}/${acc}-index.htm`,
    })
  }
  return out
}

export async function getSubmissions(cik: string) {
  return secFetch<RawSubmissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`, {
    revalidate: 120,
  })
}

/* ------------------------------------------------------------------ *
 * XBRL company facts / concepts / frames
 * ------------------------------------------------------------------ */

export type FactUnit = {
  start?: string
  end: string
  val: number
  accn: string
  fy?: number
  fp?: string
  form?: string
  filed: string
  frame?: string
}

export type CompanyFacts = {
  cik: number
  entityName: string
  facts: Record<string, Record<string, { label?: string; description?: string; units: Record<string, FactUnit[]> }>>
}

export async function getCompanyFacts(cik: string) {
  return secFetch<CompanyFacts>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`,
    { revalidate: 300 },
  )
}

/** Concepts we surface in the dossier, in reading order. `tags` lists synonyms
    most-current-first: ASC 606 replaced the legacy `Revenues` tag in 2018, so a
    filer may report under either. We take the first tag that actually has data
    instead of rendering both and showing a stale 2018 figure. */
export const KEY_CONCEPTS: {
  tags: string[]
  label: string
  kind: 'flow' | 'stock'
  unit?: string
}[] = [
  {
    tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
    label: 'Revenue',
    kind: 'flow',
  },
  { tags: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'], label: 'Cost of revenue', kind: 'flow' },
  { tags: ['GrossProfit'], label: 'Gross profit', kind: 'flow' },
  { tags: ['OperatingIncomeLoss'], label: 'Operating income', kind: 'flow' },
  { tags: ['NetIncomeLoss', 'ProfitLoss'], label: 'Net income', kind: 'flow' },
  { tags: ['EarningsPerShareDiluted'], label: 'EPS (diluted)', kind: 'flow', unit: 'USD/shares' },
  { tags: ['Assets'], label: 'Total assets', kind: 'stock' },
  { tags: ['Liabilities'], label: 'Total liabilities', kind: 'stock' },
  {
    tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
    label: "Stockholders' equity",
    kind: 'stock',
  },
  {
    tags: ['CashAndCashEquivalentsAtCarryingValue'],
    label: 'Cash & equivalents',
    kind: 'stock',
  },
  {
    tags: ['NetCashProvidedByUsedInOperatingActivities'],
    label: 'Operating cash flow',
    kind: 'flow',
  },
  { tags: ['ResearchAndDevelopmentExpense'], label: 'R&D expense', kind: 'flow' },
]

export type Metric = {
  tag: string
  label: string
  unit: string
  latest: FactUnit | null
  prior: FactUnit | null
  series: { period: string; val: number; end: string; form: string }[]
}

/** Reduce one XBRL concept to a de-duplicated annual series, or null. */
function annualSeries(
  facts: CompanyFacts,
  tag: string,
  kind: 'flow' | 'stock',
  wantUnit?: string,
): { unit: string; byYear: Map<string, FactUnit> } | null {
  const node = facts.facts?.['us-gaap']?.[tag] ?? facts.facts?.['ifrs-full']?.[tag]
  if (!node) return null
  const unit = wantUnit && node.units[wantUnit] ? wantUnit : Object.keys(node.units)[0]
  if (!unit) return null

  // Annual figures only: 10-K/20-F frames, ~365d duration for flows.
  const annual = (node.units[unit] ?? []).filter((r) => {
    if (!r.frame && !/^(10-K|20-F|40-F)/.test(r.form ?? '')) return false
    if (kind === 'flow' && r.start) {
      const days = (Date.parse(r.end) - Date.parse(r.start)) / 86400000
      if (days < 300 || days > 400) return false
    }
    return r.fp === 'FY' || Boolean(r.frame)
  })

  const byYear = new Map<string, FactUnit>()
  for (const r of annual) {
    const y = r.end.slice(0, 4)
    const prev = byYear.get(y)
    // Later-filed values supersede earlier ones (restatements).
    if (!prev || Date.parse(r.filed) > Date.parse(prev.filed)) byYear.set(y, r)
  }
  return byYear.size ? { unit, byYear } : null
}

/** Collapse a companyfacts blob into an annual, de-duplicated metric table. */
export function extractMetrics(facts: CompanyFacts): Metric[] {
  const out: Metric[] = []

  for (const { tags, label, kind, unit: wantUnit } of KEY_CONCEPTS) {
    // Walk synonyms and keep the one whose series reaches the most recent year,
    // so a filer's current tag wins over the deprecated one it replaced.
    let best: { tag: string; unit: string; byYear: Map<string, FactUnit> } | null = null
    for (const tag of tags) {
      const s = annualSeries(facts, tag, kind, wantUnit)
      if (!s) continue
      const latestYear = (y: Map<string, FactUnit>) => [...y.keys()].sort().at(-1) ?? ''
      if (!best || latestYear(s.byYear) > latestYear(best.byYear)) best = { tag, ...s }
    }
    if (!best) continue

    const sorted = [...best.byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    out.push({
      tag: best.tag,
      label,
      unit: best.unit,
      latest: sorted.at(-1)?.[1] ?? null,
      prior: sorted.at(-2)?.[1] ?? null,
      series: sorted
        .slice(-10)
        .map(([period, r]) => ({ period, val: r.val, end: r.end, form: r.form ?? '' })),
    })
  }
  return out
}

export async function getConcept(cik: string, taxonomy: string, tag: string) {
  return secFetch(
    `https://data.sec.gov/api/xbrl/companyconcept/CIK${padCik(cik)}/${taxonomy}/${tag}.json`,
    { revalidate: 300 },
  )
}

export async function getFrame(taxonomy: string, tag: string, unit: string, period: string) {
  return secFetch(
    `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${tag}/${unit}/${period}.json`,
    { revalidate: 3600 },
  )
}

/* ------------------------------------------------------------------ *
 * Live "current events" tape — newest acceptances, EDGAR-wide
 * ------------------------------------------------------------------ */

export type TapeItem = {
  id: string
  form: string
  company: string
  cik: string
  filed: string
  accepted: string
  href: string
}

export async function getLatestFilings(count = 40, form = ''): Promise<TapeItem[]> {
  const url =
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(form)}` +
    `&company=&dateb=&owner=include&start=0&count=${count}&output=atom`
  const xml = await secFetch<string>(url, { revalidate: 15, text: true })
  return parseAtomTape(xml)
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeEntities(m[1].trim()) : ''
}

function decodeEntities(s: string) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseAtomTape(xml: string): TapeItem[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  return entries.map((e, i) => {
    const title = tag(e, 'title')
    const summary = tag(e, 'summary')
    const linkMatch = e.match(/<link[^>]*href="([^"]+)"/i)
    const href = linkMatch ? linkMatch[1] : ''
    // Title shape: "10-Q - ACME CORP (0000012345) (Filer)"
    const parts = title.split(' - ')
    const form = parts[0]?.trim() ?? ''
    const rest = parts.slice(1).join(' - ')
    const cikMatch = rest.match(/\((\d{10})\)/)
    const company = rest.replace(/\s*\(\d{10}\)\s*\(.*?\)\s*$/, '').trim() || rest
    const accepted = /AcceptanceDateTime:?\s*([\d\-T:.+]+)/i.exec(summary)?.[1] ?? tag(e, 'updated')
    return {
      id: `${href || title}-${i}`,
      form,
      company,
      cik: cikMatch ? cikMatch[1] : '',
      filed: /Filed:?\s*([\d-]+)/i.exec(summary)?.[1] ?? tag(e, 'updated').slice(0, 10),
      accepted,
      href,
    }
  })
}

/* ------------------------------------------------------------------ *
 * EDGAR full-text search (efts) — 2001→present, primary documents
 * ------------------------------------------------------------------ */

export type FtsHit = {
  id: string
  form: string
  fileType: string
  company: string
  cik: string
  filed: string
  periodEnding: string
  location: string
  fileDescription: string
  snippetFile: string
  href: string
  indexUrl: string
}

type EftsResponse = {
  took: number
  hits: {
    total: { value: number }
    hits: {
      _id: string
      _source: {
        form?: string
        root_forms?: string[]
        file_type?: string
        display_names?: string[]
        ciks?: string[]
        file_date?: string
        period_ending?: string
        biz_locations?: string[]
        adsh?: string
        file_description?: string
      }
    }[]
  }
}

/* EDGAR bundles ticker + CIK into display_names, e.g.
   "Apple Inc.  (AAPL)  (CIK 0000320193)" — split it for clean rendering. */
export function splitDisplayName(raw: string) {
  const m = raw.match(/^(.*?)\s*(?:\(([^()]*)\))?\s*\(CIK\s*(\d+)\)\s*$/)
  if (!m) return { name: raw.trim(), ticker: '', cik: '' }
  return { name: m[1].trim(), ticker: (m[2] ?? '').trim(), cik: m[3] }
}

export async function fullTextSearch(
  q: string,
  opts: { forms?: string; dateRange?: { from: string; to: string }; from?: number } = {},
) {
  const params = new URLSearchParams({ q, from: String(opts.from ?? 0) })
  if (opts.forms) params.set('forms', opts.forms)
  if (opts.dateRange) {
    params.set('dateRange', 'custom')
    params.set('startdt', opts.dateRange.from)
    params.set('enddt', opts.dateRange.to)
  }
  const json = await secFetch<EftsResponse>(
    `https://efts.sec.gov/LATEST/search-index?${params.toString()}`,
    { revalidate: 60 },
  )
  const hits: FtsHit[] = (json.hits?.hits ?? []).map((h) => {
    const s = h._source
    const [adsh, file] = h._id.split(':')
    const bare = shortCik(s.ciks?.[0] ?? '0')
    const folder = (s.adsh ?? adsh).replace(/-/g, '')
    return {
      id: h._id,
      form: s.form ?? s.root_forms?.[0] ?? '',
      fileType: s.file_type ?? '',
      company: splitDisplayName(s.display_names?.[0] ?? '—').name,
      cik: padCik(s.ciks?.[0] ?? '0'),
      filed: s.file_date ?? '',
      periodEnding: s.period_ending ?? '',
      location: s.biz_locations?.[0] ?? '',
      fileDescription: s.file_description ?? '',
      snippetFile: file ?? '',
      href: `https://www.sec.gov/Archives/edgar/data/${bare}/${folder}/${file ?? ''}`,
      indexUrl: `https://www.sec.gov/Archives/edgar/data/${bare}/${folder}/${s.adsh ?? adsh}-index.htm`,
    }
  })
  return { total: json.hits?.total?.value ?? 0, took: json.took ?? 0, hits }
}

/* ------------------------------------------------------------------ *
 * Formatting helpers (shared by server + client)
 * ------------------------------------------------------------------ */

export function abbrev(n: number | null | undefined, unit = 'USD'): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  if (unit === 'USD/shares' || Math.abs(n) < 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const steps: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ]
  for (const [div, suffix] of steps) {
    if (abs >= div) return `${sign}${(abs / div).toFixed(abs / div >= 100 ? 0 : 2)}${suffix}`
  }
  return `${sign}${abs}`
}

export function pctChange(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null || b === 0) return null
  return ((a - b) / Math.abs(b)) * 100
}

export function bytes(n: number) {
  if (!n) return '—'
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n > 1e3) return `${Math.round(n / 1e3)} KB`
  return `${n} B`
}
