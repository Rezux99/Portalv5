'use client'

import { EmptyState, Panel } from '@/components/bits'
import type { FtsPayload } from '@/lib/types'
import { ArrowUpRight } from 'lucide-react'

export function FtsResults({
  query,
  data,
  onEntity,
}: {
  query: string
  data: FtsPayload
  onEntity: (cik: string, label: string) => void
}) {
  return (
    <Panel
      label="Full-text search"
      meta={`${data.total.toLocaleString('en-US')} hits · ${data.took} ms`}
      bodyClassName="p-0"
    >
      <p className="border-b border-border px-3 py-2 font-mono text-[11px] text-muted-foreground">
        efts.sec.gov · primary documents 2001 → present · matching{' '}
        <span className="text-accent">{query}</span>
      </p>
      {data.hits.length === 0 ? (
        <EmptyState
          title="no documents matched"
          hint='Wrap an exact phrase in double quotes, and remember full-text coverage starts in 2001.'
        />
      ) : (
        <ol className="divide-y divide-border/50">
          {data.hits.map((h) => (
            <li key={h.id} className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/40">
              <span className="w-[68px] shrink-0 font-mono text-[10px] font-semibold text-accent">
                {h.form}
              </span>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onEntity(h.cik, h.company)}
                  className="block max-w-full truncate text-left text-[13px] font-medium hover:text-primary"
                >
                  {h.company}
                </button>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {[
                    h.filed,
                    `CIK ${h.cik}`,
                    h.location,
                    h.fileType && h.fileType !== h.form ? h.fileType : '',
                    h.fileDescription || h.snippetFile,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="mt-0.5 flex shrink-0 flex-col items-end gap-0.5 font-mono text-[10px] tracking-[0.1em] uppercase">
                <a
                  href={h.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  doc <ArrowUpRight className="inline size-3" aria-hidden="true" />
                </a>
                <a
                  href={h.indexUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  index
                </a>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
