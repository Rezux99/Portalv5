'use client'

import { EmptyState, Field, Panel, Pill } from '@/components/bits'
import { MetricList } from '@/components/panels/MetricList'
import { bytes } from '@/lib/sec'
import type { CompanyPayload } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ArrowUpRight, Download, FileText } from 'lucide-react'
import { useMemo, useState } from 'react'

type Tab = 'financials' | 'filings' | 'profile'

export function CompanyDossier({ data }: { data: CompanyPayload }) {
  const [tab, setTab] = useState<Tab>('financials')
  const [formFilter, setFormFilter] = useState('')
  const e = data.entity

  const filings = useMemo(() => {
    if (!formFilter) return data.filings
    const f = formFilter.toUpperCase()
    return data.filings.filter((x) => x.form.toUpperCase().startsWith(f))
  }, [data.filings, formFilter])

  const tabs: [Tab, string, string][] = [
    ['financials', 'Financials', `${data.metrics.length}`],
    ['filings', 'Filings', `${data.filingTotal}`],
    ['profile', 'Profile', ''],
  ]

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* ── Entity identity block: the one place the design goes loud ── */}
      <div className="relative overflow-hidden rounded-md border border-border bg-card">
        <div className="bg-ruled absolute inset-0" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start gap-x-6 gap-y-4 p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {e.tickers.slice(0, 4).map((t) => (
                <Pill key={t} tone="accent">
                  {t}
                </Pill>
              ))}
              {e.exchanges.slice(0, 2).map((x) => (
                <Pill key={x}>{x}</Pill>
              ))}
              <Pill tone="brand">CIK {e.cik}</Pill>
            </div>
            <h1 className="mt-2 text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-[28px]">
              {e.name}
            </h1>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {[e.sicDescription && `SIC ${e.sic} · ${e.sicDescription}`, e.entityType, e.stateOfIncorporation && `INC ${e.stateOfIncorporation}`]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
          </div>

          <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-1 font-mono text-right">
            {[
              ['Filings', data.filingTotal.toLocaleString('en-US')],
              ['XBRL tags', data.factCount.toLocaleString('en-US')],
              ['FY end', e.fiscalYearEnd ? `${e.fiscalYearEnd.slice(0, 2)}/${e.fiscalYearEnd.slice(2)}` : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dd className="text-lg leading-none font-semibold tabular">{v}</dd>
                <dt className="mt-1 text-[9px] tracking-[0.12em] text-muted-foreground uppercase">{k}</dt>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative flex flex-wrap gap-2 border-t border-border px-4 py-2 sm:px-5">
          <ExportButton href={`/api/edgar/export?cik=${e.cik}&format=json`} label="bundle.json" />
          <ExportButton href={`/api/edgar/export?cik=${e.cik}&format=csv&dataset=metrics`} label="metrics.csv" />
          <ExportButton href={`/api/edgar/export?cik=${e.cik}&format=csv&dataset=filings`} label="filings.csv" />
          <a
            href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${e.cik}&type=&dateb=&owner=include&count=40`}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-primary"
          >
            sec.gov <ArrowUpRight className="size-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div role="tablist" aria-label="Dossier sections" className="flex gap-1">
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors',
              tab === id
                ? 'border-primary bg-primary/12 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            {count ? <span className="text-muted-foreground tabular">{count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'financials' ? <MetricList metrics={data.metrics} taxonomies={data.taxonomies} /> : null}

      {tab === 'filings' ? (
        <Panel
          label="Filing index"
          meta={`${filings.length} of ${data.filingTotal}`}
          action={
            <input
              value={formFilter}
              onChange={(ev) => setFormFilter(ev.target.value)}
              placeholder="form"
              aria-label="Filter filings by form"
              className="w-20 rounded-sm border border-border bg-input/40 px-1.5 py-0.5 font-mono text-[10px] uppercase outline-none focus:border-primary"
            />
          }
          bodyClassName="p-0"
        >
          <div className="scrollbar-thin max-h-[560px] overflow-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="px-3 py-2 font-semibold">Filed</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Form</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Description</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Size</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Doc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filings.map((f) => (
                  <tr key={`${f.accession}-${f.primaryDoc}`} className="transition-colors hover:bg-secondary/40">
                    <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular">
                      {f.filed}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[11px] font-semibold whitespace-nowrap text-accent">
                        {f.form}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-3 py-2">
                      <p className="truncate text-[12.5px]">
                        {f.primaryDocDescription || f.items || f.primaryDoc || '—'}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {f.accession}
                        {f.isXBRL ? ' · xbrl' : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular">
                      {bytes(f.size)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] text-primary uppercase hover:underline"
                      >
                        open <FileText className="size-3" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filings.length === 0 ? <EmptyState title="no filings match" /> : null}
          </div>
        </Panel>
      ) : null}

      {tab === 'profile' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel label="Registrant record" bodyClassName="px-3 py-1">
            <dl>
              <Field k="Legal name" v={e.name} mono={false} />
              <Field k="CIK" v={e.cik} />
              <Field k="EIN" v={e.ein} />
              <Field k="Entity type" v={e.entityType} mono={false} />
              <Field k="SIC" v={e.sic ? `${e.sic} — ${e.sicDescription}` : ''} mono={false} />
              <Field k="Incorporated" v={e.stateOfIncorporation} />
              <Field k="Fiscal end" v={e.fiscalYearEnd} />
              <Field k="Address" v={e.address} mono={false} />
              <Field k="Phone" v={e.phone} />
              <Field
                k="Website"
                v={
                  e.website ? (
                    <a
                      href={e.website.startsWith('http') ? e.website : `https://${e.website}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary hover:underline"
                    >
                      {e.website}
                    </a>
                  ) : null
                }
              />
            </dl>
          </Panel>

          <div className="flex flex-col gap-3">
            <Panel label="Form distribution" bodyClassName="p-3">
              <ul className="flex flex-col gap-1.5">
                {data.formCounts.map(([form, n]) => {
                  const max = data.formCounts[0]?.[1] || 1
                  return (
                    <li key={form} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 truncate font-mono text-[11px] font-semibold text-accent">
                        {form}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-[1px] bg-secondary">
                        <span
                          className="block h-full rounded-[1px] bg-primary/70"
                          style={{ width: `${(n / max) * 100}%` }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular">
                        {n}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Panel>

            {e.formerNames.length > 0 ? (
              <Panel label="Former names" bodyClassName="px-3 py-1">
                <dl>
                  {e.formerNames.slice(0, 6).map((f) => (
                    <Field key={`${f.name}-${f.from}`} k={f.from?.slice(0, 4) ?? '—'} v={f.name} mono={false} />
                  ))}
                </dl>
              </Panel>
            ) : null}

            {data.archiveFiles.length > 0 ? (
              <Panel label="Historical archive shards" meta={`${data.archiveFiles.length}`} bodyClassName="px-3 py-1">
                <dl>
                  {data.archiveFiles.map((a) => (
                    <Field
                      key={a.name}
                      k={`${a.filingCount} rows`}
                      v={`${a.filingFrom} → ${a.filingTo}`}
                    />
                  ))}
                </dl>
              </Panel>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ExportButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-secondary/50 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase transition-colors hover:border-primary/50 hover:text-primary"
    >
      <Download className="size-3" aria-hidden="true" />
      {label}
    </a>
  )
}
