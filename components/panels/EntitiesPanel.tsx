'use client'

import { EmptyState, Panel, Pill } from '@/components/bits'
import type { TickerRowLite } from '@/lib/types'

export function EntitiesPanel({
  results,
  query,
  error,
  onFocusEntity,
}: {
  results: TickerRowLite[]
  query?: string
  error?: string
  onFocusEntity: (cik: string) => void
}) {
  return (
    <Panel label="EDGAR universe" meta={`${results.length} matches`} bodyClassName="p-0">
      {query ? (
        <p className="border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
          matches for <span className="text-accent">{query}</span>
        </p>
      ) : null}
      {error ? (
        <div className="px-3 py-4 font-mono text-[12px] text-destructive">{error}</div>
      ) : results.length === 0 ? (
        <EmptyState title="no matches" hint="Search a ticker, full name or CIK fragment." />
      ) : (
        <ul className="divide-y divide-border/50">
          {results.map((r) => (
            <li key={`${r.cik}-${r.ticker}`}>
              <button
                type="button"
                onClick={() => onFocusEntity(r.cik)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-secondary/40"
              >
                <Pill tone={r.ticker ? 'accent' : undefined}>{r.ticker || '—'}</Pill>
                <span className="min-w-0 flex-1 truncate text-[13px]">{r.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular">
                  {r.exchange ? `${r.exchange} · ` : ''}
                  {r.cik}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}