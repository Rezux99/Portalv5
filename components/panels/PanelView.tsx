'use client'

import { CompanyPanel } from '@/components/panels/CompanyPanel'
import { DocumentsPanel } from '@/components/panels/DocumentsPanel'
import { EntitiesPanel } from '@/components/panels/EntitiesPanel'
import { FramePanel } from '@/components/panels/FramePanel'
import { FtsPanel } from '@/components/panels/FtsPanel'
import { HoldingsPanel } from '@/components/panels/HoldingsPanel'
import { InsiderPanel } from '@/components/panels/InsiderPanel'
import { MetricsPanel } from '@/components/panels/MetricsPanel'
import { TextPanel } from '@/components/panels/TextPanel'
import type { PanelPayload } from '@/lib/types'

export function PanelView({
  payload,
  onFocusEntity,
}: {
  payload: PanelPayload
  onFocusEntity: (cik: string) => void
}) {
  switch (payload.kind) {
    case 'company':
      return <CompanyPanel panel={payload} />
    case 'entities':
      return (
        <EntitiesPanel
          results={payload.results}
          query={payload.query}
          error={payload.error}
          onFocusEntity={onFocusEntity}
        />
      )
    case 'fts':
      return <FtsPanel panel={payload} onFocusEntity={onFocusEntity} />
    case 'insiders':
      return <InsiderPanel rows={payload.rows} />
    case 'holdings':
      return <HoldingsPanel rows={payload.rows} />
    case 'documents':
      return <DocumentsPanel manifests={payload.manifests} forms={payload.forms} />
    case 'metrics':
      return <MetricsPanel panel={payload} />
    case 'frame':
      return (
        <FramePanel
          panel={{
            taxonomy: payload.taxonomy,
            tag: payload.tag,
            unit: payload.unit,
            period: payload.period,
            payload: payload.payload,
            error: payload.error,
          }}
        />
      )
    case 'text':
      return <TextPanel text={payload.text} />
  }
}