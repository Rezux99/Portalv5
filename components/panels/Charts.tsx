'use client'

import { abbrev } from '@/lib/sec'
import type { Metric } from '@/lib/sec'
import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/* Theme tokens the terminal defines in globals.css — recharts wants concrete
   colors, and CSS custom properties resolve only in CSS, not SVG attributes,
   so read them once via getComputedStyle. */
const TOKENS = [
  '--color-primary',
  '--color-accent',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
] as const

export function useThemeColors(): string[] {
  return useMemo(() => {
    if (typeof window === 'undefined') return ['#5a9cff', '#e8b64c', '#5fb3d8', '#6d7ad1', '#9aa4b5']
    const cs = getComputedStyle(document.documentElement)
    return TOKENS.map((t) => cs.getPropertyValue(t).trim() || '')
  }, [])
}

const AXIS_TICK = { fill: 'var(--color-muted-foreground)', fontSize: 10, fontFamily: 'var(--font-mono)' } as const

const TOOLTIP_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-foreground)',
} as const

/* Flow lines the dossier actually tracks — keep the multi-line chart to USD
   flows so the series share a comparable scale (EPS/assets would crush it). */
const FLOW_LABELS = ['Revenue', 'Gross profit', 'Operating income', 'Net income', 'Operating cash flow']

type ChartPoint = { fy: string; [metric: string]: string | number }

function pickFlowMetrics(metrics: Metric[]): Metric[] {
  const known = metrics.filter((m) => FLOW_LABELS.includes(m.label)).slice(0, 5)
  if (known.length >= 2) return known
  return metrics.filter((m) => m.unit === 'USD').slice(0, 4)
}

export function MetricChart({ metrics }: { metrics: Metric[] }) {
  const colors = useThemeColors()
  const picked = useMemo(() => pickFlowMetrics(metrics), [metrics])
  if (picked.length < 2) return null

  const years = [...new Set(picked.flatMap((m) => m.series.map((s) => s.period)))].sort()
  const data: ChartPoint[] = years.map((fy) => {
    const row: ChartPoint = { fy }
    for (const m of picked) {
      const pt = m.series.find((s) => s.period === fy)
      if (pt) row[m.label] = pt.val
    }
    return row
  })

  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="fy" stroke="var(--color-border)" tick={AXIS_TICK} tickLine={false} />
          <YAxis stroke="var(--color-border)" tick={AXIS_TICK} tickLine={false} tickFormatter={(v: number) => abbrev(v)} width={52} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'var(--color-accent)' }} formatter={(v: number) => abbrev(v)} />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-mono)', paddingTop: 4 }} iconSize={8} />
          {picked.map((m, i) => (
            <Line
              key={m.label}
              type="monotone"
              dataKey={m.label}
              stroke={colors[i % colors.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export type FrameRow = { label: string; cik: string; val: number }

export function FrameBar({ rows, limit = 40 }: { rows: FrameRow[]; limit?: number }) {
  const colors = useThemeColors()
  const data = useMemo(() => rows.slice(0, limit), [rows, limit])
  if (data.length === 0) return null
  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={Math.min(420, Math.max(160, data.length * 22))}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            stroke="var(--color-border)"
            tick={AXIS_TICK}
            tickLine={false}
            tickFormatter={(v: number) => abbrev(v)}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke="var(--color-border)"
            tick={AXIS_TICK}
            tickLine={false}
            width={Math.min(220, Math.max(80, ...data.map((d) => d.label.length * 7)))}
            interval={0}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--color-accent)' }}
            formatter={(v: number) => abbrev(v)}
          />
          <Bar dataKey="val" fill={colors[0]} radius={[0, 1, 1, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}