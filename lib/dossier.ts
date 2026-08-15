import {
  extractMetrics,
  getCompanyFacts,
  getSubmissions,
  normalizeFilings,
  padCik,
  type CompanyFacts,
  type Filing,
  type Metric,
  type RawSubmissions,
} from '@/lib/sec'
import type { CompanyPayload } from '@/lib/types'

export type CompanyDossier = {
  cik: string
  sub: RawSubmissions
  filings: Filing[]
  facts: CompanyFacts | null
  metrics: Metric[]
  slug: string
}

export async function loadCompanyDossier(cik: string): Promise<CompanyDossier> {
  const sub = await getSubmissions(cik)
  let facts: CompanyFacts | null = null
  try {
    facts = await getCompanyFacts(cik)
  } catch {
    facts = null
  }
  const filings = normalizeFilings(sub.cik, sub.filings.recent)
  const metrics = facts ? extractMetrics(facts) : []
  const slug = (sub.tickers?.[0] || padCik(sub.cik)).toLowerCase()
  return { cik, sub, filings, facts, metrics, slug }
}

export async function buildCompanyPayload(cik: string): Promise<CompanyPayload> {
  const { sub, filings, facts, metrics } = await loadCompanyDossier(cik)
  const business = sub.addresses?.business
  const counts: Record<string, number> = {}
  for (const f of filings) counts[f.form] = (counts[f.form] ?? 0) + 1

  return {
    entity: {
      cik: padCik(sub.cik),
      name: sub.name,
      tickers: sub.tickers ?? [],
      exchanges: sub.exchanges ?? [],
      sic: sub.sic ?? '',
      sicDescription: sub.sicDescription ?? '',
      entityType: sub.entityType ?? '',
      ein: sub.ein ?? '',
      fiscalYearEnd: sub.fiscalYearEnd ?? '',
      stateOfIncorporation: sub.stateOfIncorporation ?? '',
      phone: sub.phone ?? '',
      website: sub.website ?? '',
      formerNames: sub.formerNames ?? [],
      address: business
        ? [business.street1, business.street2, business.city, business.stateOrCountry, business.zipCode]
            .filter(Boolean)
            .join(', ')
        : '',
    },
    metrics,
    taxonomies: facts ? Object.keys(facts.facts ?? {}) : [],
    factCount: facts
      ? Object.values(facts.facts ?? {}).reduce((n, t) => n + Object.keys(t).length, 0)
      : 0,
    filings: filings.slice(0, 250),
    filingTotal: filings.length,
    formCounts: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14),
    archiveFiles: sub.filings.files ?? [],
  }
}
