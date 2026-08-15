'use client'

import { EmptyState, Panel, Sparkbars } from '@/components/bits'
import { abbrev, pctChange } from '@/lib/sec'
import type { Metric } from '@/lib/sec'
import { cn } from '@/lib/utils'

/**
 * The XBRL annual-series block shared by the terminal dossier and the Ask
 * metrics panel. Extracted from `CompanyDossier` so both render identically
 * from the same rows.
 */
export function MetricList({ metrics, taxonomies }: { metrics: Metric[]; taxonomies: string[] }) {
  return (
    <Panel
      label="XBRL annual series"
      meta={taxonomies.join(' · ') || 'no taxonomy'}
      bodyClassName="p-0"
    >
      {metrics.length === 0 ? (
        <EmptyState
          title="no xbrl facts"
          hint="This registrant files no structured XBRL — typical for funds, trusts and individual filers. Filing documents are still fully available."
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {metrics.map((m) => {
            const chg = pctChange(m.latest?.val, m.prior?.val)
            return (
              <li
                key={`${m.tag}-${m.unit}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-4 px-3 py-2.5 transition-colors hover:bg-secondary/40 sm:grid-cols-[minmax(0,1.4fr)_auto_120px_92px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{m.label}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {m.tag} · {m.unit}
                  </p>
                </div>
                <Sparkbars series={m.series} className="hidden w-24 sm:flex" />
                <div className="text-right font-mono">
                  <p className="text-[15px] font-semibold tabular">
                    {abbrev(m.latest?.val, m.unit)}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular">
                    FY{m.latest?.end?.slice(0, 4) ?? '—'}
                  </p>
                </div>
                <div className="text-right font-mono">
                  {chg === null ? (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  ) : (
                    <span
                      className={cn(
                        'text-[12px] font-semibold tabular',
                        chg >= 0 ? 'text-primary' : 'text-destructive',
                      )}
                    >
                      {chg >= 0 ? '+' : ''}
                      {chg.toFixed(1)}%
                    </span>
                  )}
                  <p className="text-[9px] tracking-[0.1em] text-muted-foreground uppercase">yoy</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}