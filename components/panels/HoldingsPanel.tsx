'use client'

import { EmptyState, Panel } from '@/components/bits'
import { abbrev } from '@/lib/sec'
import type { HoldingRow } from '@/lib/types'

export function HoldingsPanel({ rows }: { rows: HoldingRow[] }) {
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1)
  return (
    <Panel label="13F holdings" meta={`${rows.length} positions`} bodyClassName="p-0">
      {rows.length === 0 ? (
        <EmptyState title="no 13F positions" hint="This filer reports no quarterly equity holdings." />
      ) : (
        <div className="scrollbar-thin max-h-[560px] overflow-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Form 13F quarterly holdings with shares, value and relative value bars.</caption>
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                <th scope="col" className="px-3 py-2 font-semibold">Issuer</th>
                <th scope="col" className="px-3 py-2 font-semibold">CUSIP</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Shares</th>
                <th scope="col" className="px-3 py-2 font-semibold">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => (
                <tr key={`${r.accession}-${r.cusip}-${r.issuer}`} className="transition-colors hover:bg-secondary/40">
                  <td className="max-w-[220px] px-3 py-2">
                    <p className="truncate text-[12.5px] font-medium">{r.issuer}</p>
                    <p className="truncate font-mono text-[9px] text-muted-foreground">
                      {r.cls}
                      {r.putCall ? ` · ${r.putCall}` : ''}
                      {r.period ? ` · ${r.period}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground tabular">{r.cusip || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap tabular">
                    {r.shares != null ? r.shares.toLocaleString('en-US') : '—'}
                  </td>
                  <td className="min-w-[140px] px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-[1px] bg-secondary">
                        <div
                          className="h-full rounded-[1px] bg-accent/80"
                          style={{ width: `${r.value != null ? Math.max(2, (r.value / max) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-foreground tabular">
                        {r.value != null ? abbrev(r.value) : '—'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}