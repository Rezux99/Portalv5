'use client'

import { FtsResults } from '@/components/fts-results'
import type { FtsPanel as FtsPanelPayload } from '@/lib/types'

/** Wraps the terminal's full-text results; reuses the exact same render. */
export function FtsPanel({
  panel,
  onFocusEntity,
}: {
  panel: FtsPanelPayload
  onFocusEntity: (cik: string) => void
}) {
  return (
    <FtsResults
      query={panel.query ?? ''}
      data={panel.payload}
      onEntity={(cik) => onFocusEntity(cik)}
    />
  )
}