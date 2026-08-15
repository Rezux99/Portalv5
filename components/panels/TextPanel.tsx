'use client'

/** Plain assistant text — no border, markdown-safe (raw whitespace preserved). */
export function TextPanel({ text }: { text: string }) {
  return (
    <p className="min-w-0 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
      {text || '—'}
    </p>
  )
}