import { padCik, resolveCik } from '@/lib/sec'
import { loadCompanyDossier } from '@/lib/dossier'
import { NextResponse } from 'next/server'

export const revalidate = 0

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const raw = sp.get('cik')?.trim()
  const format = (sp.get('format') ?? 'json').toLowerCase()
  const dataset = (sp.get('dataset') ?? sp.get('kind') ?? 'all').toLowerCase()
  if (!raw) return NextResponse.json({ error: 'cik required' }, { status: 400 })

  try {
    const cik = await resolveCik(raw)
    if (!cik) return NextResponse.json({ error: `No EDGAR entity for "${raw}"` }, { status: 404 })
    const { sub, filings, facts, metrics, slug } = await loadCompanyDossier(cik)

    if (format === 'csv') {
      let csv: string
      let name: string
      if (dataset === 'metrics') {
        const rows: (string | number)[][] = [['tag', 'label', 'unit', 'period', 'period_end', 'value', 'source_form']]
        for (const m of metrics) {
          for (const p of m.series) rows.push([m.tag, m.label, m.unit, p.period, p.end, p.val, p.form])
        }
        csv = toCsv(rows)
        name = `${slug}_xbrl_annual_metrics.csv`
      } else {
        const rows: (string | number)[][] = [
          ['accession', 'form', 'filed', 'report_date', 'items', 'size_bytes', 'is_xbrl', 'primary_doc_url'],
        ]
        for (const f of filings) {
          rows.push([f.accession, f.form, f.filed, f.reportDate, f.items, f.size, String(f.isXBRL), f.url])
        }
        csv = toCsv(rows)
        name = `${slug}_filing_index.csv`
      }
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name}"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    const bundle = {
      _meta: {
        generator: 'EDGAR/EXTRACT terminal',
        source: 'https://data.sec.gov + https://www.sec.gov/Archives',
        extractedAt: new Date().toISOString(),
        cik: padCik(sub.cik),
        note: 'Public domain U.S. SEC data. Respect the 10 req/s fair-access limit.',
      },
      entity: {
        cik: padCik(sub.cik),
        name: sub.name,
        tickers: sub.tickers ?? [],
        exchanges: sub.exchanges ?? [],
        sic: sub.sic,
        sicDescription: sub.sicDescription,
        entityType: sub.entityType,
        ein: sub.ein,
        fiscalYearEnd: sub.fiscalYearEnd,
        stateOfIncorporation: sub.stateOfIncorporation,
        phone: sub.phone,
        website: sub.website,
        formerNames: sub.formerNames ?? [],
        addresses: sub.addresses ?? {},
      },
      annualMetrics: metrics,
      filings,
      historicalArchives: sub.filings.files ?? [],
      xbrlTaxonomies: facts ? Object.keys(facts.facts ?? {}) : [],
    }

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}_edgar_bundle.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.log('[v0] export failed:', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
