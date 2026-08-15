'use client'

import { CommandBar, type Mode } from '@/components/command-bar'
import { CompanyDossier } from '@/components/company-dossier'
import { EmptyState, Panel } from '@/components/bits'
import { ExportRail } from '@/components/export-rail'
import { FilingTape } from '@/components/filing-tape'
import { FtsResults } from '@/components/fts-results'
import type { TapeItem } from '@/lib/sec'
import type { CompanyPayload, FtsPayload } from '@/lib/types'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The terminal view body — the command bar, dossier/full-text area and export
 * rail. It reports the focused entity upward via `onEntityFocus` so the shared
 * shell can drive `activeCik` (the Export session, the tape highlight, and the
 * Ask tab follow-ups). When `activeCik` moves externally (an Ask result focuses
 * a ticker), this view pulls that dossier, keeping both tabs in sync.
 */
export function TerminalView({
  tape,
  activeCik,
  onEntityFocus,
}: {
  tape: TapeItem[]
  activeCik?: string | null
  onEntityFocus: (cik: string) => void
}) {
  const [mode, setMode] = useState<Mode>('entity')
  const [busy, setBusy] = useState(false)
  const [company, setCompany] = useState<CompanyPayload | null>(null)
  const [fts, setFts] = useState<{ q: string; data: FtsPayload } | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const lastFocus = useRef<string | null>(null)

  const loadEntity = useCallback(
    async (cik: string, name: string) => {
      setBusy(true)
      setErr(null)
      setLabel(name)
      setMode('entity')
      try {
        const res = await fetch(`/api/edgar/company?cik=${encodeURIComponent(cik)}`)
        const json = (await res.json()) as CompanyPayload
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
        setCompany(json)
        setFts(null)
        onEntityFocus(json.entity?.cik || cik)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Request failed')
      } finally {
        setBusy(false)
      }
    },
    [onEntityFocus],
  )

  const loadFts = useCallback(async (q: string, forms: string) => {
    setBusy(true)
    setErr(null)
    setMode('fulltext')
    try {
      const params = new URLSearchParams({ q })
      if (forms) params.set('forms', forms)
      const res = await fetch(`/api/edgar/fts?${params}`)
      const json = (await res.json()) as FtsPayload
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
      setFts({ q, data: json })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }, [])

  /* Pull the dossier when another tab focuses an entity (Ask results). Guarded
     against re-fires so a focus that already matched doesn't re-trigger. */
  useEffect(() => {
    if (!activeCik) return
    if (company?.entity.cik === activeCik) return
    if (lastFocus.current === activeCik) return
    lastFocus.current = activeCik
    void loadEntity(activeCik, activeCik)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCik])

  return (
    <>
      <div className="mb-4 border-b border-border bg-background/80 px-0 py-3 backdrop-blur-sm">
        <CommandBar
          mode={mode}
          setMode={setMode}
          onEntity={loadEntity}
          onFullText={loadFts}
          busy={busy}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {err ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 font-mono text-[12px] text-destructive"
            >
              SEC request failed — {err}
            </div>
          ) : null}

          {mode === 'fulltext' && fts ? (
            <FtsResults query={fts.q} data={fts.data} onEntity={loadEntity} />
          ) : company ? (
            <CompanyDossier data={company} />
          ) : (
            <Panel label="Dossier" meta={busy ? 'loading…' : 'no entity selected'}>
              <EmptyState
                title={busy ? `Resolving ${label ?? 'entity'}…` : 'Awaiting entity'}
                hint="Search a ticker, company name or CIK above — or click any filing on the live tape to pull its complete EDGAR record: submissions history, XBRL company facts and archive index."
              />
            </Panel>
          )}

          <FilingTape initial={tape} onPick={loadEntity} activeCik={activeCik ?? undefined} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <ExportRail activeCik={activeCik ?? undefined} />
        </aside>
      </div>
    </>
  )
}