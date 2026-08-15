import type { Filing, FtsHit, Metric, TickerRow } from '@/lib/sec'

export type Entity = {
  cik: string
  name: string
  tickers: string[]
  exchanges: string[]
  sic: string
  sicDescription: string
  entityType: string
  ein: string
  fiscalYearEnd: string
  stateOfIncorporation: string
  phone: string
  website: string
  formerNames: { name: string; from: string; to: string }[]
  address: string
}

export type CompanyPayload = {
  entity: Entity
  metrics: Metric[]
  taxonomies: string[]
  factCount: number
  filings: Filing[]
  filingTotal: number
  formCounts: [string, number][]
  archiveFiles: { name: string; filingCount: number; filingFrom: string; filingTo: string }[]
  error?: string
}

export type FtsPayload = { total: number; took: number; hits: FtsHit[]; error?: string }
export type TickerRowLite = { cik: string; ticker: string; name: string; exchange?: string }

export type SummaryReport = { shortName: string; longName: string; file: string }

export type DocumentManifest = {
  accession: string
  filed: string
  form: string
  primaryDoc: string
  url: string
  indexUrl: string
  size: number
  hasSummary: boolean
  summaryReports: SummaryReport[]
}

export type HoldingRow = {
  accession: string
  issuer: string
  cusip: string
  cls: string
  value: number | null
  shares: number | null
  shareType: string
  putCall: string
  discretion: string
  soleVoting: number | null
  sharedVoting: number | null
  noneVoting: number | null
  period: string
}

export type InsiderTxnRow = {
  accession: string
  issuerCik: string
  issuerName: string
  ownerName: string
  ownerCik: string
  isDirector: boolean
  isOfficer: boolean
  isTenPct: boolean
  officerTitle: string
  security: string
  txnDate: string
  txnCode: string
  shares: number | null
  price: number | null
  acquiredDisposed: string
  sharesOwnedAfter: number | null
  directIndirect: string
  footnote: string
}

/* ------------------------------------------------------------------ *
 * Agent / chat: closed types the LLM tool layer emits for the UI.
 * The UI batch (A2) decides how each `kind` renders; the interface here
 * is deliberately closed so panels never leak raw free text as a source.
 * ------------------------------------------------------------------ */

export type PanelCommon = {
  cik?: string
  name?: string
  query?: string
  error?: string
}

export type CompanyPanel = PanelCommon & {
  kind: 'company'
  payload: CompanyPayload
}

export type EntitiesPanel = PanelCommon & {
  kind: 'entities'
  results: TickerRow[]
}

export type FtsPanel = PanelCommon & {
  kind: 'fts'
  payload: FtsPayload
}

export type InsidersPanel = PanelCommon & {
  kind: 'insiders'
  rows: InsiderTxnRow[]
}

export type HoldingsPanel = PanelCommon & {
  kind: 'holdings'
  rows: HoldingRow[]
}

export type DocumentsPanel = PanelCommon & {
  kind: 'documents'
  forms: string[]
  manifests: DocumentManifest[]
}

export type MetricsPanel = PanelCommon & {
  kind: 'metrics'
  payload: CompanyPayload
}

export type FramePanel = PanelCommon & {
  kind: 'frame'
  taxonomy: string
  tag: string
  unit: string
  period: string
  payload: unknown
}

export type TextPanel = PanelCommon & {
  kind: 'text'
  text: string
}

export type PanelPayload =
  | CompanyPanel
  | EntitiesPanel
  | FtsPanel
  | InsidersPanel
  | HoldingsPanel
  | DocumentsPanel
  | MetricsPanel
  | FramePanel
  | TextPanel
