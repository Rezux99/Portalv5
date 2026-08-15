'use client'

import { Panel } from '@/components/bits'
import { MetricChart } from '@/components/panels/Charts'
import { MetricList } from '@/components/panels/MetricList'
import type { MetricsPanel as MetricsPanelPayload } from '@/lib/types'

/** Annual series with a recharts trend line on top and the shared metric list. */
export function MetricsPanel({ panel }: { panel: MetricsPanelPayload }) {
  const { metrics, taxonomies } = panel.payload
  const chartable = metrics.filter((m) => m.series.length >= 2).length >= 2

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {chartable ? (
        <Panel label="Revenue trend" meta="USD · FY" bodyClassName="p-3">
          <MetricChart metrics={metrics} />
        </Panel>
      ) : null}
      <MetricList metrics={metrics} taxonomies={taxonomies} />
    </div>
  )
}