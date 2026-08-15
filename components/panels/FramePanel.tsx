'use client'

import { EmptyState, Panel } from '@/components/bits'
import { FrameBar, type FrameRow } from '@/components/panels/Charts'
import { abbrev } from '@/lib/sec'
import { useMemo, useState } from 'react'

/**
 * SEC XBRL frame JSON is an array of ragged rows whose exact column layout is
 * not contractual — the payload is typed `unknown` upstream. We detect a header
 * row (all strings) and index columns by name, else fall back to the de-facto
 * [entityName, cik, value, …] shape. Aggregate into { label, cik, val }.
 */
function parseFrame(payload: unknown): FrameRow[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const raw = p.data
  if (!Array.isArray(raw)) return []

  let rows = raw as unknown[][]
  let labelIdx = 0
  let cikIdx = 1
  let valIdx = 2

  const first = rows[0]
  if (Array.isArray(first) && first.length > 0 && first.every((x) => typeof x === 'string')) {
    const header = first as string[]
    const pick = (names: string[]) => header.findIndex((h) => names.some((n) => h.toLowerCase().includes(n)))
    const li = pick(['name', 'entity'])
    const ci = pick(['cik', ' c', 'entityc'])
    const va = pick(['val', 'value'])
    if (li >= 0) labelIdx = li
    if (ci >= 0) cikIdx = ci
    if (va >= 0) valIdx = va
    rows = rows.slice(1)
  }

  const out: FrameRow[] = []
  for (const r of rows) {
    if (!Array.isArray(r)) continue
    const val = Number(r[valIdx])
    if (!Number.isFinite(val)) continue
    out.push({ label: String(r[labelIdx] ?? '—'), cik: String(r[cikIdx] ?? ''), val })
  }
  return out
}

const TABLE_LIMIT = 400

export function FramePanel({
  panel,
}: {
  panel: { taxonomy: string; tag: string; unit: string; period: string; payload: unknown; error?: string }
}) {
  const rows = useMemo(() => parseFrame(panel.payload), [panel.payload])
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    if (!q.trim()) return rows
    const t = q.trim().toLowerCase()
    return rows.filter((r) => r.label.toLowerCase().includes(t) || r.cik.includes(q.trim()))
  }, [rows, q])

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
        <span className="text-accent">{panel.taxonomy}</span>
        <span>/</span>
        <span>{panel.tag}</span>
        <span>/</span>
        <span>{panel.unit}</span>
        <span>/</span>
        <span>{panel.period}</span>
        <span className="ml-auto tabular">{rows.length} rows</span>
      </div>

      {panel.error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 font-mono text-[12px] text-destructive">
          {panel.error}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="empty frame" hint="This taxonomy/tag/period returned no rows." />
      ) : rows.length > TABLE_LIMIT ? (
        <FrameTable rows={filtered} total={rows.length} unit={panel.unit} query={q} onQuery={setQ} />
      ) : (
        <FrameBar rows={[...rows].sort((a, b) => b.val - a.val)} />
      )}
    </div>
  )
}

function FrameTable({
  rows,
  total,
  unit,
  query,
  onQuery,
}: {
  rows: FrameRow[]
  total: number
  unit: string
  query: string
  onQuery: (s: string) => void
}) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <span className="font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">filter</span>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={`${total.toLocaleString('en-US')} rows — search`}
          aria-label="Filter frame rows"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      <div className="scrollbar-thin max-h-[480px] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
              <th scope="col" className="px-3 py-2 font-semibold">Entity</th>
              <th scope="col" className="px-3 py-2 font-semibold">CIK</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Value ({unit})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.slice(0, 500).map((r) => (
              <tr key={`${r.cik}-${r.label}-${r.val}`} className="transition-colors hover:bg-secondary/40">
                <td className="max-w-[280px] px-3 py-1.5 truncate text-[12.5px]">{r.label}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground tabular">{r.cik}</td>
                <td className="px-3 py-1.5 text-right font-mono text-[11px] tabular">{abbrev(r.val)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyState title="no rows match" /> : null}
      </div>
    </div>
  )
}