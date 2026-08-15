/**
 * SEC EDGAR Form 13F holdings.
 *
 * Port of `parse_13f` + `fetch_holdings` from `public/edgar_extract.py`. For
 * each 13F-HR filing we anchor on the filing root folder (`.../{accNoDash}/`)
 * — the info-table XML is a raw file there, while `primary_doc.xml` is usually
 * the container that embeds it. `index.json` lists the folder's files, and we
 * parse XML candidates in order until one yields rows.
 *
 * Pre-2023 filings report `value` in thousands; those stay "as reported" (no
 * normalization, same pending note as the Python script).
 */

import { XMLParser } from 'fast-xml-parser'
import { getSubmissions, normalizeFilings, padCik, type Filing } from '@/lib/sec'
import { throttledFetch } from '@/lib/sec-http'
import type { HoldingRow } from '@/lib/types'

async function get(url: string): Promise<Response> {
  return throttledFetch(url)
}

async function getText(url: string): Promise<string> {
  const res = await get(url)
  if (!res.ok) throw new Error(`SEC ${res.status} ${res.statusText} :: ${url}`)
  return res.text()
}

async function getJson<T>(url: string): Promise<T> {
  const res = await get(url)
  if (!res.ok) throw new Error(`SEC ${res.status} ${res.statusText} :: ${url}`)
  return res.json() as T
}

/* fast-xml-parser normalizes a single-element node to an object and a list to
   an array; keep both shapes working. */
function asList<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function scalar(node: Record<string, unknown> | undefined, key: string): string {
  const v = node?.[key]
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (typeof v === 'object') return String((v as Record<string, unknown>)['#text'] ?? '')
  return ''
}

function num(node: Record<string, unknown> | undefined, key: string): number | null {
  const s = scalar(node, key).replace(/,/g, '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function collectInfoTables(root: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'infoTable') {
        for (const item of asList(v)) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            out.push(item as Record<string, unknown>)
          }
        }
      } else if (v && typeof v === 'object') {
        walk(v)
      }
    }
  }
  walk(root)
  return out
}

export function parseInfoTable(
  xml: string,
  accession: string,
  period: string,
): HoldingRow[] {
  let parsed: unknown
  try {
    parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(xml)
  } catch {
    return []
  }
  const rows: HoldingRow[] = []
  for (const it of collectInfoTables(parsed)) {
    const shrs = it.shrsOrPrnAmt as Record<string, unknown> | undefined
    const vote = it.votingAuthority as Record<string, unknown> | undefined
    rows.push({
      accession,
      issuer: scalar(it, 'nameOfIssuer'),
      cusip: scalar(it, 'cusip'),
      cls: scalar(it, 'titleOfClass'),
      value: num(it, 'value'),
      shares: num(shrs, 'sshPrnamt'),
      shareType: scalar(shrs, 'sshPrnamtType'),
      putCall: scalar(it, 'putCall'),
      discretion: scalar(it, 'investmentDiscretion'),
      soleVoting: num(vote, 'Sole'),
      sharedVoting: num(vote, 'Shared'),
      noneVoting: num(vote, 'None'),
      period,
    })
  }
  return rows
}

type DirIndex = {
  directory?: { item?: { name?: string }[] }
}

/** Root folder of the accession: `.../data/{cik}/{accNoDash}`. The primary doc
    lives in an `xslForm13F_*` render subfolder, so we take only the first two
    path segments after `/Archives/edgar/data/` (same root fix as the Python). */
function filingRoot(f: Filing): string {
  const m = f.url.match(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/[^/]+\/[^/]+/)
  return m ? m[0] : f.url.slice(0, f.url.lastIndexOf('/'))
}

async function holdingsForFiling(f: Filing): Promise<HoldingRow[]> {
  const base = filingRoot(f)
  let idx: DirIndex
  try {
    idx = await getJson<DirIndex>(`${base}/index.json`)
  } catch {
    return []
  }
  const items = idx.directory?.item ?? []
  for (const item of items) {
    const nm = item.name ?? ''
    if (!nm.endsWith('.xml')) continue
    try {
      const rows = parseInfoTable(await getText(`${base}/${nm}`), f.accession, f.reportDate)
      if (rows.length) return rows
    } catch {
      continue
    }
  }
  return []
}

/**
 * Holdings across the filer's 13F-HR filings, most valuable first. A filer
 * with no 13F history yields `[]`. Pre-2023 `value` is kept as reported.
 */
export async function getHoldings(cik: string, limit = 60): Promise<HoldingRow[]> {
  const sub = await getSubmissions(padCik(cik))
  const filings = normalizeFilings(sub.cik, sub.filings.recent)
    .filter((f) => f.form.startsWith('13F-HR'))
    .slice(0, Math.max(1, limit))
  const rows: HoldingRow[] = []
  for (const f of filings) {
    rows.push(...(await holdingsForFiling(f)))
  }
  rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  return rows
}
