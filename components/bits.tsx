import { cn } from '@/lib/utils'
import type * as React from 'react'

/* A framed instrument panel: label rail on top, content below. */
export function Panel({
  label,
  meta,
  children,
  className,
  bodyClassName,
  action,
}: {
  label: string
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  action?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card',
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-secondary/40 px-3 py-2">
        <h2 className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </h2>
        <div className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground tabular">
          {meta}
          {action}
        </div>
      </header>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}

const toneMap = {
  neutral: 'border-border bg-secondary text-muted-foreground',
  brand: 'border-primary/40 bg-primary/12 text-primary',
  accent: 'border-accent/40 bg-accent/12 text-accent',
  live: 'border-primary/40 bg-primary/12 text-primary',
} as const

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode
  tone?: keyof typeof toneMap
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase',
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function LiveDot({ active = true }: { active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-1.5 rounded-full',
        active ? 'animate-pulse-dot bg-primary text-primary' : 'bg-muted-foreground',
      )}
    />
  )
}

/* Key/value row used throughout the dossier. */
export function Field({
  k,
  v,
  mono = true,
}: {
  k: string
  v: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border/60 py-1.5 last:border-0">
      <dt className="w-28 shrink-0 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
        {k}
      </dt>
      <dd className={cn('min-w-0 flex-1 text-[13px] break-words', mono && 'font-mono tabular')}>
        {v || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  )
}

/* Horizontal magnitude bars — the only chart form the terminal uses. */
export function Sparkbars({
  series,
  className,
}: {
  series: { period: string; val: number }[]
  className?: string
}) {
  const max = Math.max(...series.map((s) => Math.abs(s.val)), 1)
  return (
    <div className={cn('flex h-8 items-end gap-[3px]', className)} aria-hidden="true">
      {series.map((s, i) => {
        const h = Math.max(2, (Math.abs(s.val) / max) * 100)
        const last = i === series.length - 1
        return (
          <span
            key={s.period}
            style={{ height: `${h}%` }}
            className={cn(
              'w-full min-w-[3px] rounded-[1px] transition-colors',
              s.val < 0
                ? 'bg-destructive/70'
                : last
                  ? 'bg-primary'
                  : 'bg-primary/30 group-hover:bg-primary/50',
            )}
          />
        )
      })}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </p>
      {hint ? <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground/70">{hint}</p> : null}
    </div>
  )
}
