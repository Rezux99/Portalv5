/**
 * Insider ownership ledger from SEC Forms 3/4/5.
 *
 * Port of `parse_ownership` + `fetch_insider_ledger` (public/edgar_extract.py)
 * with the accession-root fix: the raw ownership XML lives in the filing's
 * root folder (`.../{accNoDash}/{accNoDash}-index.json`), not under the
 * rendered `.xsl` subfolder that `primaryDoc` points at.
 *
 * Ownership XML uses a default namespace (`xmlns=...`). fast-xml-parser leaves
 * element names unprefixed under a default namespace, so no namespace config is
 * needed to walk the tree by bare tag name.
 */

import { XMLParser } from 'fast-xml-parser'

import {
  normalizeFilings,
  padCik,
  secFetch,
  shortCik,
  type Filing,
  type RawSubmissions,
} from '@/lib/sec'
import type { InsiderTxnRow } from '@/lib/types'

export const OWNERSHIP_FORMS = ['3', '4', '5', '3/A', '4/A', '5/A']
const EXCLUDED_SUFFIXES = ['_cal.xml', '_def.xml', '_lab.xml', '_pre.xml']

const parser = new XMLParser({ ignoreAttributes: false })

type JsonNode = Record<string, unknown>

/** Read text out of a parsed node (string, number, or a `{ value: ... }` wrapper). */
function textAt(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'boolean') return String(node)
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim()
  if (typeof node === 'object') {
    const value = (node as JsonNode).value
    if (value != null) return textAt(value)
  }
  return ''
}

/** Find a child node by name, whether the parent is an object or array wrapper. */
function child(node: unknown, name: string): unknown {
  if (node == null || typeof node !== 'object') return undefined
  const obj = node as JsonNode
  return obj[name]
}

/** Element under a transaction, e.g. `transactionAmounts` -> `transactionShares`. */
function elem(node: unknown, path: string): unknown {
  return child(child(node, path), 'value') ?? child(node, path)
}

function numAt(node: unknown): number | null {
  const v = textAt(node).replace(/,/g, '')
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function flagAt(node: unknown): boolean {
  return ['1', 'true', 'True'].includes(textAt(node))
}

function toArray(node: unknown): unknown[] {
  if (node == null) return []
  return Array.isArray(node) ? node : [node]
}

/** Collect every node tagged `name` anywhere under `node` (mirrors ET `root.iter`). */
function findAll(node: unknown, name: string, out: unknown[] = []): unknown[] {
  if (node == null || typeof node !== 'object') return out
  for (const [k, v] of Object.entries(node as JsonNode)) {
    if (k === name) out.push(v)
    else findAll(v, name, out)
  }
  return out
}

/**
 * Parse one Form 3/4/5 ownership XML document into transaction rows.
 * Returns [] for non-ownership documents or parse failures.
 */
export function parseOwnership(xml: string, accession: string): InsiderTxnRow[] {
  let root: unknown
  try {
    root = parser.parse(xml)
  } catch {
    return []
  }
  if (root == null || typeof root !== 'object') return []

  const obj = root as JsonNode
  const top = (obj.ownershipDocument ?? Object.values(obj).find((v) => v && typeof v === 'object')) as
    | JsonNode
    | undefined
  if (!top || typeof top !== 'object') return []

  const issuer = top.issuer
  const issuerCik = padCik(textAt(child(child(issuer, 'issuerCik'), 'value') ?? child(issuer, 'issuerCik')))
  const issuerName = textAt(child(child(issuer, 'issuerName'), 'value') ?? child(issuer, 'issuerName'))

  const rows: InsiderTxnRow[] = []
  for (const owner of toArray(top.reportingOwner)) {
    const oid = child(owner, 'reportingOwnerId') as JsonNode | undefined
    const rel = child(owner, 'reportingOwnerRelationship') as JsonNode | undefined
    const ownerCik = padCik(textAt(child(child(oid, 'rptOwnerCik'), 'value') ?? child(oid, 'rptOwnerCik')))
    const ownerName = textAt(child(child(oid, 'rptOwnerName'), 'value') ?? child(oid, 'rptOwnerName'))

    const base = {
      accession,
      issuerCik,
      issuerName,
      ownerCik,
      ownerName,
      isDirector: flagAt(child(rel, 'isDirector')),
      isOfficer: flagAt(child(rel, 'isOfficer')),
      isTenPct: flagAt(child(rel, 'isTenPercentOwner')),
      officerTitle: textAt(child(child(rel, 'officerTitle'), 'value') ?? child(rel, 'officerTitle')),
    }

    // Transactions are document-level (under nonDerivativeTable/derivativeTable),
    // siblings of reportingOwner — search the whole tree like the Python root.iter.
    const txns = [
      ...findAll(top, 'nonDerivativeTransaction').flatMap(toArray),
      ...findAll(top, 'derivativeTransaction').flatMap(toArray),
    ]

    for (const txn of txns) {
        const amt = child(txn, 'transactionAmounts')
        const post = child(txn, 'postTransactionAmounts')
        const coding = child(txn, 'transactionCoding')
        const nature = child(txn, 'ownershipNature')
        const security = child(txn, 'securityTitle')

        const price = numAt(elem(amt, 'transactionPricePerShare'))
        const shares = numAt(elem(amt, 'transactionShares'))

        // Keep the row when there is at least a date or a share count — mirrors
        // the Python filter so empty containers (e.g. Form 3 with no txn yet)
        // do not flood the ledger.
        if (!textAt(child(txn, 'transactionDate')) && shares == null) continue

        rows.push({
          ...base,
          security: textAt(child(security, 'value') ?? security),
          txnDate: textAt(child(child(txn, 'transactionDate'), 'value') ?? child(txn, 'transactionDate')),
          txnCode: textAt(child(child(coding, 'transactionCode'), 'value') ?? child(coding, 'transactionCode')),
          shares,
          price,
          acquiredDisposed: textAt(
            child(child(amt, 'transactionAcquiredDisposedCode'), 'value') ?? child(amt, 'transactionAcquiredDisposedCode'),
          ),
          sharesOwnedAfter: numAt(elem(post, 'sharesOwnedFollowingTransaction')),
          directIndirect: textAt(child(child(nature, 'directOrIndirectOwnership'), 'value') ?? child(nature, 'directOrIndirectOwnership')),
          footnote: textAt(child(child(txn, 'footnoteId'), 'value') ?? child(txn, 'footnoteId')),
        })
    }
  }
  return rows
}

type IndexJson = { directory?: { item?: { name?: string }[] | { name?: string } } }

/** Candidate raw XML urls for one filing, from its root folder's index.json. */
async function candidateXmlUrls(cik: string, filing: Filing): Promise<string[]> {
  const bare = shortCik(cik)
  const accNoDash = filing.accession.replace(/-/g, '')
  const root = `https://www.sec.gov/Archives/edgar/data/${bare}/${accNoDash}`
  const urls: string[] = []
  try {
    const idx = await secFetch<IndexJson>(`${root}/index.json`, { revalidate: 3600 })
    const items = idx.directory?.item
    for (const raw of toArray(items)) {
      const item = raw as { name?: string } | undefined
      const nm = item?.name ?? ''
      if (!nm.endsWith('.xml')) continue
      if (EXCLUDED_SUFFIXES.some((s) => nm.endsWith(s))) continue
      urls.push(`${root}/${nm}`)
    }
  } catch {
    // No index (e.g. superseded/removed filing) — nothing to parse.
  }
  return urls
}

async function parseFirstWithRows(urls: string[], accession: string): Promise<InsiderTxnRow[]> {
  for (const url of urls) {
    try {
      const xml = await secFetch<string>(url, { revalidate: 3600, text: true })
      const rows = parseOwnership(xml, accession)
      if (rows.length) return rows
    } catch {
      // 404/parse failure on one candidate — try the next.
    }
  }
  return []
}

/**
 * Full insider transaction ledger for a CIK: walks Forms 3/4/5 (newest first,
 * up to `limit`) and extracts every reported transaction.
 * Returns [] for a filer with no ownership filings.
 */
export async function getInsiderLedger(cik: string, limit = 100): Promise<InsiderTxnRow[]> {
  const sub = await secFetch<RawSubmissions>(
    `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`,
    { revalidate: 120 },
  )
  const filings = normalizeFilings(sub.cik, sub.filings.recent).filter((f) =>
    OWNERSHIP_FORMS.includes(f.form),
  )
  const wanted = filings.slice(0, Math.max(1, limit))

  const rows: InsiderTxnRow[] = []
  for (const filing of wanted) {
    const urls = await candidateXmlUrls(cik, filing)
    if (!urls.length) continue
    rows.push(...(await parseFirstWithRows(urls, filing.accession)))
  }
  rows.sort((a, b) => b.txnDate.localeCompare(a.txnDate))
  return rows
}
