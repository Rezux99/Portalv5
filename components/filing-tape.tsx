'use client'

import { EmptyState, LiveDot, Panel, Pill } from '@/components/bits'
import { cn } from '@/lib/utils'
import type { TapeItem } from '@/lib/sec'
import { useCallback, useEffect, useRef, useState } from 'react'

const FORM_FILTERS = ['', '8-K', '10-Q', '10-K', '4', '13F-HR', 'S-1', '424B'] as const

/** Forms that move markets get the accent treatment. */
const HOT = /^(8-K|10-K|10-Q|S-1|425|SC 13D|DEFM14A|6-K)/

function timeOnly(s: string) {
  const t = s?.match(/\d{2}:\d{2}:\d{2}/)?.[0]
  if (t) return t
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '--:--:--' : d.toISOString().slice(11, 19)
}

export function FilingTape({
  initial,
  onPick,
  activeCik,
}: {
  initial: TapeItem[]
  onPick: (cik: string, label: string) => void
  activeCik?: string
}) {
  const [items, setItems] = useState<TapeItem[]>(initial)
  const [form, setForm] = useState<string>('')
  const [live, setLive] = useState(true)
  const [pulse, setPulse] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef<Set<string>>(new Set(initial.map((i) => i.id)))

  const load = useCallback(
    async (f: string, replace = false) => {
      try {
        const res = await fetch(`/api/edgar/latest?count=45&form=${encodeURIComponent(f)}`, {
          cache: 'no-store',
        })
        const json = (await res.json()) as { items: TapeItem[]; error?: string }
        if (json.error) throw new Error(json.error)
        setError(null)
        if (replace) {
          seen.current = new Set(json.items.map((i) => i.id))
          setItems(json.items)
          return
        }
        const fresh = json.items.filter((i) => !seen.current.has(i.id))
        if (fresh.length) {
          for (const i of fresh) seen.current.add(i.id)
          setItems((prev) => [...fresh, ...prev].slice(0, 120))
          setPulse((p) => p + fresh.length)
        }
      } catch (err) {
        console.log('[v0] tape poll failed:', (err as Error).message)
        setError('feed unreachable — retrying')
      }
    },
    [],
  )

  useEffect(() => {
    void load(form, true)
  }, [form, load])

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => void load(form), 20000)
    return () => clearInterval(id)
  }, [live, form, load])

  return (
    <Panel
      label="Live acceptance tape"
      meta={
        <span className="flex items-center gap-1.5">
          <LiveDot active={live && !error} />
          {error ? 'stalled' : live ? `+${pulse}` : 'paused'}
        </span>
      }
      action={
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] tracking-[0.1em] uppercase transition-colors hover:border-primary/50 hover:text-primary"
        >
          {live ? 'pause' : 'resume'}
        </button>
      }
      className="h-full"
      bodyClassName="flex flex-col min-h-0"
    >
      <div className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-2">
        {FORM_FILTERS.map((f) => (
          <button
            key={f || 'all'}
            type="button"
            onClick={() => setForm(f)}
            aria-pressed={form === f}
            className={cn(
              'shrink-0 rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase transition-colors',
              form === f
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {f || 'all'}
          </button>
        ))}
      </div>

      <ol className="scrollbar-thin min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
        {items.length === 0 ? (
          <li>
            <EmptyState title="awaiting acceptances" hint="EDGAR accepts filings 06:00–22:00 ET on business days." />
          </li>
        ) : (
          items.map((it) => (
            <li key={it.id} className="animate-tape-in">
              <button
                type="button"
                onClick={() => it.cik && onPick(it.cik, it.company)}
                disabled={!it.cik}
                className={cn(
                  'group flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-secondary/60 disabled:cursor-default',
                  activeCik && it.cik === activeCik && 'bg-primary/8',
                )}
              >
                <span className="mt-px w-[58px] shrink-0 font-mono text-[10px] text-muted-foreground tabular">
                  {timeOnly(it.accepted)}
                </span>
                <span
                  className={cn(
                    'mt-px w-[62px] shrink-0 truncate font-mono text-[10px] font-semibold tracking-wide',
                    HOT.test(it.form) ? 'text-accent' : 'text-primary/80',
                  )}
                  title={it.form}
                >
                  {it.form}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] leading-snug group-hover:text-primary">
                  {it.company}
                </span>
              </button>
            </li>
          ))
        )}
      </ol>

      <footer className="shrink-0 border-t border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
        {items.length} rows · poll 20s · browse-edgar getcurrent
      </footer>
    </Panel>
  )
}

export { Pill }
