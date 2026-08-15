/**
 * SEC EDGAR documents (manifest-only, no bytes to disk).
 *
 * Port of `download_documents` / `parse_filing_summary` (Python) adapted for
 * the dashboard: it lists filings by form, links the primary document and
 * index, and parses `FilingSummary.xml` from the accession root so the UI can
 * render each rendered statement (R1.htm, R2.htm, …). The manifest carries
 * links and sizes only — the bytes are never downloaded server-side.
 */

import { XMLParser } from 'fast-xml-parser'
import { normalizeFilings, getSubmissions, shortCik } from '@/lib/sec'
import { throttledFetch } from '@/lib/sec-http'
import type { DocumentManifest, SummaryReport } from '@/lib/types'

export const DOCUMENT_FORMS = ['10-K', '10-Q', '8-K'] as const

const MAX_LIMIT = 50

const parser = new XMLParser({ ignoreAttributes: false })

function txt(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o['#text'] === 'string') return o['#text'].trim()
    const plain = Object.values(o).find((x): x is string => typeof x === 'string')
    return plain?.trim() ?? ''
  }
  return ''
}

/** Collect every `Report` node anywhere in the tree (Python's `root.iter`). */
function collectReports(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectReports(item, out)
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const name = key.includes(':') ? key.split(':').pop() : key
      if (name === 'Report') {
        if (Array.isArray(value)) out.push(...(value as Record<string, unknown>[]))
        else if (value && typeof value === 'object') out.push(value as Record<string, unknown>)
      } else {
        collectReports(value, out)
      }
    }
  }
}

/** `FilingSummary.xml` lists every rendered statement (R1.htm, R2.htm, …). */
export function parseFilingSummary(xml: string): SummaryReport[] {
  try {
    const reports: Record<string, unknown>[] = []
    collectReports(parser.parse(xml), reports)
    const out: SummaryReport[] = []
    for (const r of reports) {
      const file = txt(r.HtmlFileName) || txt(r.XmlFileName)
      if (!file) continue
      out.push({ shortName: txt(r.ShortName), longName: txt(r.LongName), file })
    }
    return out
  } catch {
    return []
  }
}

async function fetchSummaryReports(cik: string, accession: string): Promise<SummaryReport[]> {
  const accNoDash = accession.replace(/-/g, '')
  const url = `https://www.sec.gov/Archives/edgar/data/${shortCik(cik)}/${accNoDash}/FilingSummary.xml`
  try {
    const res = await throttledFetch(url, { revalidate: 300 })
    if (!res.ok) return []
    return parseFilingSummary(await res.text())
  } catch {
    return []
  }
}

export type GetDocumentsOpts = { forms?: string[]; limit?: number }

/** Manifests for a CIK's filings, filtered by form, most recent first. */
export async function getDocuments(
  cik: string,
  opts: GetDocumentsOpts = {},
): Promise<DocumentManifest[]> {
  const sub = await getSubmissions(cik)
  const filings = normalizeFilings(sub.cik, sub.filings.recent)
  const forms: string[] = opts.forms && opts.forms.length > 0 ? opts.forms : [...DOCUMENT_FORMS]
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? MAX_LIMIT), 0), MAX_LIMIT)
  const wanted = filings.filter((f) => f.primaryDoc && forms.includes(f.form)).slice(0, limit)

  const manifests = await Promise.all(
    wanted.map(async (f) => {
      const summaryReports = await fetchSummaryReports(cik, f.accession)
      return {
        accession: f.accession,
        filed: f.filed,
        form: f.form,
        primaryDoc: f.primaryDoc,
        url: f.url,
        indexUrl: f.indexUrl,
        size: f.size,
        hasSummary: summaryReports.length > 0,
        summaryReports,
      }
    }),
  )
  return manifests.sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0))
}
