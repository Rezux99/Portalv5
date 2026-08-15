'use client'

import type { TickerRowLite } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Loader2, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type Mode = 'entity' | 'fulltext'

export function CommandBar({
  mode,
  setMode,
  onEntity,
  onFullText,
  busy,
}: {
  mode: Mode
  setMode: (m: Mode) => void
  onEntity: (cik: string, label: string) => void
  onFullText: (q: string, forms: string) => void
  busy: boolean
}) {
  const [q, setQ] = useState('')
  const [forms, setForms] = useState('')
  const [rows, setRows] = useState<TickerRowLite[]>([])
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  /* Cmd/Ctrl-K focuses the bar, like every terminal worth using. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (mode !== 'entity' || q.trim().length < 1) {
      setRows([])
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/edgar/search?q=${encodeURIComponent(q)}`, {
          signal: ctl.signal,
        })
        const json = (await res.json()) as { rows: TickerRowLite[] }
        setRows(json.rows ?? [])
        setCursor(0)
        setOpen(true)
      } catch {
        /* aborted */
      }
    }, 160)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [q, mode])

  function submit() {
    if (mode === 'fulltext') {
      if (q.trim()) onFullText(q.trim(), forms.trim())
      return
    }
    const pick = rows[cursor]
    if (pick) {
      onEntity(pick.cik, pick.ticker || pick.name)
      setOpen(false)
      return
    }
    const digits = q.replace(/\D/g, '')
    if (digits.length >= 4) onEntity(digits.padStart(10, '0'), digits)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-2 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label="Search mode"
          className="flex shrink-0 rounded-sm border border-border p-0.5"
        >
          {(
            [
              ['entity', 'Entity'],
              ['fulltext', 'Full text'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              type="button"
              onClick={() => {
                setMode(m)
                setOpen(false)
                inputRef.current?.focus()
              }}
              className={cn(
                'rounded-[2px] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors',
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => rows.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, rows.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder={
              mode === 'entity'
                ? 'Ticker, company or CIK  —  e.g. NVDA, Berkshire, 0000320193'
                : 'Phrase across every EDGAR document  —  e.g. "material weakness"'
            }
            aria-label={mode === 'entity' ? 'Search entity' : 'Full text search'}
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-[13px] outline-none placeholder:text-muted-foreground/60"
          />
          {mode === 'fulltext' ? (
            <input
              value={forms}
              onChange={(e) => setForms(e.target.value)}
              placeholder="forms"
              aria-label="Filter by form type"
              className="w-20 shrink-0 rounded-sm border border-border bg-input/40 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-primary placeholder:text-muted-foreground/60"
            />
          ) : null}
          <kbd className="hidden shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
            ⌘K
          </kbd>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy || !q.trim()}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-primary-foreground uppercase transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          Extract
        </button>
      </div>

      {open && mode === 'entity' && rows.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Matching registrants"
          className="scrollbar-thin absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-2xl shadow-black/40"
        >
          {rows.map((r, i) => (
            <li key={`${r.cik}-${r.ticker}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  onEntity(r.cik, r.ticker || r.name)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                  i === cursor ? 'bg-primary/12' : 'hover:bg-secondary',
                )}
              >
                <span className="w-14 shrink-0 font-mono text-[11px] font-semibold text-accent">
                  {r.ticker || '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{r.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular">
                  {r.exchange || ''} {r.cik}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
