/**
 * Agent tool registry.
 *
 * Every tool returns a CLOSED `PanelPayload` (union in `lib/types.ts`) so the
 * UI always knows which component to render — free text is reserved for the
 * model's final answer, never a tool source. Tools reach SEC through the
 * existing server-side layer (`lib/sec.ts`, `lib/sec-http.ts` throttledFetch,
 * and the D2/D3/D4 ports), all of which are already rate-limited.
 */

import {
  fullTextSearch,
  getFrame,
  padCik,
  resolveCik,
  searchUniverse,
} from '@/lib/sec'
import { buildCompanyPayload } from '@/lib/dossier'
import { getInsiderLedger } from '@/lib/sec-insiders'
import { getHoldings } from '@/lib/sec-holdings'
import { getDocuments } from '@/lib/sec-documents'
import type { PanelPayload } from '@/lib/types'

export type AgentContext = {
  /** Shared active CIK from the terminal tab, for follow-up turns. */
  activeCik?: string | null
}

export type ToolSpec = {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>, ctx: AgentContext) => Promise<PanelPayload>
}

/** Resolve an explicit cik_or_ticker, else fall back to the shared active CIK. */
async function resolveTarget(
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<{ cik: string; query: string }> {
  const raw = String(args.cik_or_ticker ?? '').trim()
  if (raw) {
    const cik = await resolveCik(raw)
    if (!cik) throw new Error(`No EDGAR entity for "${raw}"`)
    return { cik: padCik(cik), query: raw }
  }
  if (ctx.activeCik) return { cik: padCik(ctx.activeCik), query: 'empresa activa (terminal)' }
  throw new Error('Falta cik_or_ticker, o no hay una empresa activa en la terminal.')
}

function clampInt(v: unknown, def: number, max: number, min = 1): number {
  const n = Number(v)
  const val = Number.isFinite(n) ? Math.floor(n) : def
  return Math.max(min, Math.min(val, max))
}

const textPanel = (text: string): PanelPayload => ({ kind: 'text', text })

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const TOOLS: ToolSpec[] = [
  {
    name: 'search_entities',
    description:
      'Search the SEC EDGAR universe (tickers + company names) for entities matching a query. Returns a list of tickers/CIKs to pick from.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Company name, ticker, or CIK fragment.' },
      },
      required: ['q'],
    },
    async execute(args) {
      const q = String(args.q ?? '').trim()
      if (!q) return textPanel('Escribe algo para buscar en el universo EDGAR.')
      try {
        const results = await searchUniverse(q)
        if (!results.length)
          return { kind: 'entities', query: q, results: [], error: `Sin resultados para "${q}"` }
        return { kind: 'entities', query: q, results }
      } catch (e) {
        return { kind: 'entities', query: q, results: [], error: errMsg(e) }
      }
    },
  },
  {
    name: 'get_company',
    description:
      'Load a full company dossier for a CIK or ticker: entity metadata, key financial metrics, filing history and form counts.',
    parameters: {
      type: 'object',
      properties: {
        cik_or_ticker: {
          type: 'string',
          description:
            'CIK or ticker (e.g. AAPL). Omit to use the active company from the terminal.',
        },
      },
    },
    async execute(args, ctx) {
      try {
        const { cik, query } = await resolveTarget(args, ctx)
        const payload = await buildCompanyPayload(cik)
        return { kind: 'company', cik, name: payload.entity?.name, query, payload }
      } catch (e) {
        return textPanel(`No pude cargar la empresa: ${errMsg(e)}`)
      }
    },
  },
  {
    name: 'insider_ledger',
    description:
      'Insider ownership transactions (Forms 3/4/5) for a company: buys/sells, counts, dates and prices.',
    parameters: {
      type: 'object',
      properties: {
        cik_or_ticker: {
          type: 'string',
          description: 'CIK or ticker (e.g. AAPL). Omit to use the active company.',
        },
        limit: { type: 'number', description: 'Max filings to scan (default 100).', minimum: 1 },
      },
    },
    async execute(args, ctx) {
      try {
        const { cik, query } = await resolveTarget(args, ctx)
        const limit = clampInt(args.limit, 100, 400)
        const rows = await getInsiderLedger(cik, limit)
        return { kind: 'insiders', cik, query, rows }
      } catch (e) {
        return textPanel(`No pude leer insiders: ${errMsg(e)}`)
      }
    },
  },
  {
    name: 'holdings_13f',
    description:
      'Form 13F quarterly holdings (equities) reported by a company, most valuable first.',
    parameters: {
      type: 'object',
      properties: {
        cik_or_ticker: {
          type: 'string',
          description: 'CIK or ticker (e.g. AAPL). Omit to use the active company.',
        },
        limit: { type: 'number', description: 'Max filings to scan (default 2).', minimum: 1 },
      },
    },
    async execute(args, ctx) {
      try {
        const { cik, query } = await resolveTarget(args, ctx)
        const limit = clampInt(args.limit, 2, 16)
        const rows = await getHoldings(cik, limit)
        return { kind: 'holdings', cik, query, rows }
      } catch (e) {
        return textPanel(`No se pudieron leer holdings: ${errMsg(e)}`)
      }
    },
  },
  {
    name: 'documents',
    description:
      'List recent SEC filings (forms like 10-K/10-Q/8-K) for a company with links to the primary document and rendered statements.',
    parameters: {
      type: 'object',
      properties: {
        cik_or_ticker: {
          type: 'string',
          description: 'CIK or ticker (e.g. INTC). Omit to use the active company.',
        },
        forms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Forms to include (default 10-K/10-Q/8-K).',
        },
        limit: { type: 'number', description: 'Max documents (≤ 50, default 6).', minimum: 1, maximum: 50 },
      },
    },
    async execute(args, ctx) {
      try {
        const { cik, query } = await resolveTarget(args, ctx)
        const forms = Array.isArray(args.forms) ? (args.forms as unknown[]).map(String) : undefined
        const limit = clampInt(args.limit, 6, 50)
        const manifests = await getDocuments(cik, { forms, limit })
        return { kind: 'documents', cik, query, forms: forms ?? [], manifests }
      } catch (e) {
        return textPanel(`No se pudieron listar documentos: ${errMsg(e)}`)
      }
    },
  },
  {
    name: 'metric_series',
    description:
      'Key annual financial metrics (revenue, EPS, cash flow, etc.) for a company across recent years.',
    parameters: {
      type: 'object',
      properties: {
        cik_or_ticker: {
          type: 'string',
          description: 'CIK or ticker (e.g. AAPL). Omit to use the active company.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional XBRL concept names to surface.',
        },
      },
    },
    async execute(args, ctx) {
      try {
        const { cik, query } = await resolveTarget(args, ctx)
        const payload = await buildCompanyPayload(cik)
        return { kind: 'metrics', cik, query, payload }
      } catch (e) {
        return textPanel(`No se pudieron cargar métricas: ${errMsg(e)}`)
      }
    },
  },
  {
    name: 'fulltext_query',
    description:
      'Full-text search across SEC primary documents (2001→present) for a phrase or terms, with optional form filter.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Free-text query, e.g. "risk factors inflation".' },
        forms: { type: 'string', description: 'Comma-separated forms to restrict (e.g. "10-K,8-K").' },
        dateRange: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } },
          description: 'YYYY-MM-DD range to restrict.',
        },
      },
      required: ['q'],
    },
    async execute(args) {
      const q = String(args.q ?? '').trim()
      if (!q) return textPanel('Escribe una frase para la búsqueda full-text.')
      const forms = args.forms ? String(args.forms) : undefined
      const dr = args.dateRange as { from?: string; to?: string } | undefined
      const dateRange =
        dr && (dr.from || dr.to) ? { from: dr.from ?? '', to: dr.to ?? '' } : undefined
      try {
        const { total, took, hits } = await fullTextSearch(q, { forms, dateRange })
        return { kind: 'fts', query: q, payload: { total, took, hits } }
      } catch (e) {
        return { kind: 'fts', query: q, payload: { total: 0, took: 0, hits: [] }, error: errMsg(e) }
      }
    },
  },
  {
    name: 'frame_data',
    description:
      'Raw XBRL frame data for a taxonomy/tag/unit/period (e.g. us-gaap, Assets, USD, CY2023) across all filers.',
    parameters: {
      type: 'object',
      properties: {
        taxonomy: { type: 'string', description: 'Taxonomy, e.g. us-gaap or ifrs-full.' },
        tag: { type: 'string', description: 'Concept name, e.g. Assets.' },
        unit: { type: 'string', description: 'Unit, e.g. USD.' },
        period: { type: 'string', description: 'Period, e.g. CY2023Q4.' },
      },
      required: ['taxonomy', 'tag', 'unit', 'period'],
    },
    async execute(args) {
      const taxonomy = String(args.taxonomy ?? '')
      const tag = String(args.tag ?? '')
      const unit = String(args.unit ?? '')
      const period = String(args.period ?? '')
      if (!taxonomy || !tag || !unit || !period)
        return textPanel('frame_data requiere taxonomy, tag, unit y period.')
      try {
        const frame = await getFrame(taxonomy, tag, unit, period)
        return { kind: 'frame', taxonomy, tag, unit, period, payload: frame }
      } catch (e) {
        return { kind: 'frame', taxonomy, tag, unit, period, payload: null, error: errMsg(e) }
      }
    },
  },
]