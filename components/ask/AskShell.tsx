'use client'

import { SetupPanel, type SetupInfo } from '@/components/ask/SetupPanel'
import { PanelView } from '@/components/panels/PanelView'
import { TextPanel } from '@/components/panels/TextPanel'
import type { ChatInputMessage } from '@/lib/ai/agent'
import type { PanelPayload } from '@/lib/types'
import {
  type Turn,
  type ChatSession,
  listSessions,
  createSession,
  updateSession,
  deleteSession,
  setActiveSession,
  getActiveSession,
} from '@/lib/chat-sessions'
import { cn } from '@/lib/utils'
import { Loader2, MessageSquarePlus, Send, Trash2, History } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'

type ChatReply = { content?: string; panels?: PanelPayload[]; error?: string; needsConfig?: boolean } & SetupInfo

export function AskShell({
  activeCik,
  onEntityFocus,
}: {
  activeCik?: string | null
  onEntityFocus: (cik: string) => void
}) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<SetupInfo | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── localStorage is the single source of truth ──
  // Every render reads fresh from localStorage; `tick` forces re-render after writes
  const snap = useCallback((): { turns: Turn[]; messages: ChatInputMessage[] } => {
    const s = sessionId ? getActiveSession() : null
    return { turns: s?.turns ?? [], messages: s?.messages ?? [] }
  }, [sessionId, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const { turns, messages } = snap()

  // ── Bump tick after every localStorage write to trigger re-render ──
  const bump = useCallback(() => setTick((t) => t + 1), [])

  // ── Load active session on mount ──
  useEffect(() => {
    const active = getActiveSession()
    if (active) setSessionId(active.id)
    setSessions(listSessions())
  }, [])

  // ── Scroll to bottom on new turns ──
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight })
  }, [turns.length, busy])

  // ── Refresh session list ──
  const refreshSessions = useCallback(() => {
    setSessions(listSessions())
  }, [])

  // ── New session ──
  function newSession(firstMessage?: string) {
    const s = createSession(firstMessage)
    setSessionId(s.id)
    setError(null)
    setSetup(null)
    setShowHistory(false)
    refreshSessions()
  }

  // ── Switch to existing session ──
  function switchSession(id: string) {
    setActiveSession(id)
    setSessionId(id)
    setShowHistory(false)
    setError(null)
    setSetup(null)
  }

  // ── Delete session ──
  function removeSession(id: string) {
    deleteSession(id)
    if (id === sessionId) {
      const remaining = listSessions()
      if (remaining.length > 0) {
        switchSession(remaining[0].id)
      } else {
        newSession()
      }
    }
    refreshSessions()
  }

  // ── Send message ──
  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || busy) return

    // Create session if none
    let sid = sessionId
    if (!sid) {
      const s = createSession(text)
      sid = s.id
      setSessionId(sid)
      refreshSessions()
    }

    // Read current state from localStorage (single source of truth)
    const before = snap()
    const userMsg: ChatInputMessage = { role: 'user', content: text }
    const full = [...before.messages, userMsg]
    const newTurns = [...before.turns, { role: 'user' as const, content: text, panels: [] }]

    // Persist user message IMMEDIATELY
    updateSession(sid, {
      turns: newTurns,
      messages: full,
      ...(before.turns.length === 0
        ? { title: text.slice(0, 60) + (text.length > 60 ? '…' : '') }
        : {}),
    })
    bump()
    refreshSessions()

    setInput('')
    setBusy(true)
    setError(null)
    setSetup(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: full, activeCik }),
      })
      const json = (await res.json()) as ChatReply

      if (json.needsConfig) {
        setSetup(json)
        setBusy(false)
        return
      }
      if (!res.ok || json.error) {
        setError(json.error || `HTTP ${res.status}`)
        setBusy(false)
        return
      }

      const content = typeof json.content === 'string' ? json.content : ''
      const panels: PanelPayload[] = Array.isArray(json.panels) ? json.panels : []
      const assistantMsg: ChatInputMessage = { role: 'assistant', content }

      // Persist assistant response IMMEDIATELY — append to the turns we already saved
      updateSession(sid, {
        turns: [...newTurns, { role: 'assistant', content, panels }],
        messages: [...full, assistantMsg],
      })
      bump()

      for (const p of panels) {
        if (p && 'cik' in p && p.cik) onEntityFocus(String(p.cik))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const empty = turns.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ── Session bar ── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => newSession()}
          title="Nueva sesión"
          className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:border-primary/40 hover:text-primary"
        >
          <MessageSquarePlus className="size-3" />
          Nueva
        </button>
        <button
          type="button"
          onClick={() => { setShowHistory(!showHistory); refreshSessions() }}
          title="Historial de sesiones"
          className={cn(
            'flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors',
            showHistory
              ? 'border-primary/40 bg-primary/12 text-primary'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary',
          )}
        >
          <History className="size-3" />
          Historial
          {sessions.length > 0 && (
            <span className="ml-0.5 rounded-full bg-muted px-1.5 text-[9px]">{sessions.length}</span>
          )}
        </button>
        {sessionId && (
          <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground/60">
            {sessions.find((s) => s.id === sessionId)?.title ?? 'Sesión'}
          </span>
        )}
      </div>

      {/* ── History panel ── */}
      {showHistory && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-card p-2">
          {sessions.length === 0 ? (
            <p className="py-4 text-center font-mono text-[11px] text-muted-foreground">
              Sin sesiones previas
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-sm px-2 py-1.5 cursor-pointer transition-colors',
                    s.id === sessionId ? 'bg-primary/12 text-primary' : 'hover:bg-muted/50',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchSession(s.id)}
                    className="flex-1 truncate text-left font-mono text-[11px]"
                  >
                    <span className="block truncate">{s.title}</span>
                    <span className="text-[9px] text-muted-foreground">
                      {new Date(s.updatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      {' · '}
                      {s.turns.filter((t) => t.role === 'user').length} msgs
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeSession(s.id) }}
                    className="shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Eliminar sesión"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Chat area ── */}
      <div
        ref={scrollRef}
        aria-live="polite"
        aria-label="Ask results"
        className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1"
      >
        {activeCik ? (
          <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            active entity — <span className="text-accent">{activeCik}</span>
          </p>
        ) : null}

        {empty && !busy ? (
          <EmptyChat />
        ) : (
          turns.map((t, i) => <TurnView key={i} turn={t} onFocusEntity={onEntityFocus} />)
        )}

        {busy ? <ThinkingBubble /> : null}

        {error ? (
          <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 font-mono text-[12px] text-destructive">
            {error}
          </div>
        ) : null}

        {setup ? <SetupPanel setup={setup} /> : null}
      </div>

      <form onSubmit={send} className="flex items-end gap-2 rounded-md border border-border bg-card p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={2}
          placeholder='Ask everything… e.g. "insiders de AAPL"'
          aria-label="Ask about SEC EDGAR data"
          className="scrollbar-thin min-h-0 max-h-40 resize-y flex-1 bg-transparent px-1.5 py-1.5 font-mono text-[13px] outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-sm bg-primary px-4 py-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-primary-foreground uppercase transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />}
          Ask
        </button>
      </form>
    </div>
  )
}

function EmptyChat() {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border px-5 py-10 text-center">
      <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Ask the terminal
      </p>
      <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground/70">
        Natural language over SEC EDGAR: <span className="text-accent">insiders de AAPL</span>, then{" "}
        <span className="text-accent">y ahora sus holdings</span>, or{" "}
        <span className="text-primary">charts de ingresos de MSFT</span>.
      </p>
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
      <span className="flex size-3 items-center justify-center">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      </span>
      agent working…
    </div>
  )
}

function TurnView({ turn, onFocusEntity }: { turn: Turn; onFocusEntity: (cik: string) => void }) {
  const isUser = turn.role === 'user'
  const chart = turn.panels.filter((p) => p.kind !== 'text')
  const textPanels = turn.panels.filter((p) => p.kind === 'text')

  return (
    <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-md border px-3 py-2',
          isUser ? 'border-primary/40 bg-primary/12' : 'border-border bg-card',
        )}
      >
        <p className={cn('whitespace-pre-wrap text-[13px] leading-relaxed', isUser && 'text-primary-foreground/90')}>
          {turn.content}
        </p>
      </div>

      {textPanels.length > 0 ? (
        <div className="flex w-full max-w-[85%] flex-col gap-2">
          {textPanels.map((p, i) => (
            <span key={`t-${i}`} className="min-w-0">
              <TextPanel text={(p as { kind: 'text'; text: string }).text} />
            </span>
          ))}
        </div>
      ) : null}

      {chart.length > 0 ? (
        <div className="grid w-full gap-3 md:grid-cols-2">
          {chart.map((p, j) => (
            <div key={j} className="min-w-0">
              <PanelView payload={p} onFocusEntity={onFocusEntity} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
