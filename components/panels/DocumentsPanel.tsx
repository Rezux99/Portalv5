'use client'

import { EmptyState, Panel, Pill } from '@/components/bits'
import { bytes } from '@/lib/sec'
import type { DocumentManifest } from '@/lib/types'
import { useState } from 'react'

/** Resolve a file name in the accession root (R1.htm, R2.htm, …). */
function statementUrl(url: string, file: string): string {
  const base = url.slice(0, url.lastIndexOf('/'))
  return `${base}/${file}`
}

export function DocumentsPanel({ manifests, forms }: { manifests: DocumentManifest[]; forms: string[] }) {
  return (
    <Panel
      label="Documents"
      meta={`${manifests.length} · ${forms.join('/')}`}
      bodyClassName="p-0"
    >
      {manifests.length === 0 ? (
        <EmptyState title="no filings matched" hint="Ask for a form like 10-K, 10-Q or 8-K." />
      ) : (
        <ul className="divide-y divide-border/50">
          {manifests.map((m) => (
            <li key={m.accession} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-[10px] font-semibold text-accent">{m.form}</span>
                <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular">{m.filed}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular">{bytes(m.size)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] overflow-hidden">
                <a href={m.url} target="_blank" rel="noreferrer noopener" className="truncate text-primary hover:underline">
                  {m.primaryDoc}
                </a>
                <a href={m.indexUrl} target="_blank" rel="noreferrer noopener" className="text-muted-foreground hover:text-foreground hover:underline">
                  index.htm
                </a>
                <span className="truncate text-muted-foreground tabular">{m.accession}</span>
              </div>
              <StatementReports manifest={m} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function StatementReports({ manifest }: { manifest: DocumentManifest }) {
  const [open, setOpen] = useState(false)
  if (!manifest.hasSummary || manifest.summaryReports.length === 0) return null
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:border-primary/50 hover:text-primary"
      >
        {open ? 'hide' : 'show'} rendered statements ({manifest.summaryReports.length})
      </button>
      {open ? (
        <div aria-label="Rendered statements">
          <ul className="mt-1.5 space-y-0.5">
            {manifest.summaryReports.map((r) => (
              <li key={r.file} className="flex items-center gap-2 text-[11px]">
                <Pill>{r.file}</Pill>
                <a href={statementUrl(manifest.url, r.file)} target="_blank" rel="noreferrer noopener" className="truncate text-primary hover:underline">
                  {r.shortName || r.longName || r.file}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}