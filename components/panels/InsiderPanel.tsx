'use client'

import { EmptyState, Panel, Pill } from '@/components/bits'
import { abbrev } from '@/lib/sec'
import type { InsiderTxnRow } from '@/lib/types'
import { cn } from '@/lib/utils'

function roleChips(r: InsiderTxnRow) {
  const chips: string[] = []
  if (r.isDirector) chips.push('D')
  if (r.isOfficer) chips.push('O')
  if (r.isTenPct) chips.push('>10%')
  return chips.join(' · ')
}

/** Tone for the A/D pill: acquired ranks up, disposed ranks down. */
function adTone(code: string) {
  const c = code.toUpperCase()
  if (c === 'A') return 'accent' as const
  if (c === 'D') return 'live' as const
  return undefined
}

export function InsiderPanel({ rows }: { rows: InsiderTxnRow[] }) {
  return (
    <Panel label="Insider ledger" meta={`${rows.length} txns`} bodyClassName="p-0">
      {rows.length === 0 ? (
        <EmptyState title="no forms 3/4/5" hint="This filer reports no insider ownership transactions." />
      ) : (
        <div className="scrollbar-thin max-h-[560px] overflow-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">
              Insider ownership transactions (Forms 3/4/5): date, owner, action, shares, price and
              ownership after the transaction.
            </caption>
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                <th scope="col" className="px-3 py-2 font-semibold">Exec</th>
                <th scope="col" className="px-3 py-2 font-semibold">Code</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Shares</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Price</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r, i) => {
                const dir = r.acquiredDisposed.toUpperCase()
                const tone = adTone(dir)
                return (
                  <tr key={`${r.accession}-${i}`} className="transition-colors hover:bg-secondary/40">
                    <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular">
                      {r.txnDate}
                    </td>
                    <td className="max-w-[220px] px-3 py-2">
                      <p className="truncate text-[12.5px]">{r.ownerName}</p>
                      <p className="truncate font-mono text-[9px] text-muted-foreground">
                        {[roleChips(r), r.officerTitle].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {dir ? (
                        <Pill tone={tone}>{dir === 'A' ? 'A · buy' : 'D · sell'}</Pill>
                      ) : (
                        <span className="font-mono text-[11px] text-muted-foreground">{r.txnCode || '—'}</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap tabular',
                        dir === 'A' ? 'text-primary' : dir === 'D' ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {r.shares != null ? (dir === 'D' ? '-' : '') + r.shares.toLocaleString('en-US') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular">
                      {r.price != null ? `$${r.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular">
                      {r.sharesOwnedAfter != null ? abbrev(r.sharesOwnedAfter) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}