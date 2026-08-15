'use client'

import { AskShell } from '@/components/ask/AskShell'
import { LiveDot, Pill } from '@/components/bits'
import { TerminalView } from '@/components/terminal-shell'
import type { TapeItem } from '@/lib/sec'
import { cn } from '@/lib/utils'
import { MessageCircle, X, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { useCallback, useState, useEffect } from 'react'

const CHAT_OPEN_KEY = 'edgar-chat-open'

export function Shell({ tape }: { tape: TapeItem[] }) {
  const [activeCik, setActiveCik] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(true)
  const focusEntity = useCallback((cik: string) => setActiveCik(cik), [])

  // Restore chat open state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(CHAT_OPEN_KEY)
    if (saved !== null) setChatOpen(saved === 'true')
  }, [])

  function toggleChat() {
    setChatOpen((prev) => {
      const next = !prev
      localStorage.setItem(CHAT_OPEN_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex min-h-svh flex-col bg-ruled">
      <Masthead chatOpen={chatOpen} onToggleChat={toggleChat} />

      <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col px-4 py-4 md:px-6 md:py-6">
        <div className="flex min-h-0 flex-1 gap-4">
          {/* Terminal — always mounted, takes remaining space */}
          <div className={cn('min-w-0 flex-1', chatOpen && 'max-w-[60%]')}>
            <TerminalView tape={tape} activeCik={activeCik} onEntityFocus={focusEntity} />
          </div>

          {/* Chat sidebar — always mounted, collapsible */}
          <div
            className={cn(
              'flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card transition-[width,opacity] duration-200',
              chatOpen ? 'w-[40%] min-w-[320px] opacity-100' : 'w-0 min-w-0 border-0 opacity-0',
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Ask AI
              </span>
              <button
                type="button"
                onClick={toggleChat}
                className="text-muted-foreground/60 hover:text-foreground transition-colors"
                title="Cerrar panel"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <AskShell activeCik={activeCik} onEntityFocus={focusEntity} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-muted-foreground">
          <span>Source: U.S. Securities and Exchange Commission · EDGAR</span>
          <span className="text-border">/</span>
          <span>data.sec.gov · efts.sec.gov · www.sec.gov/Archives</span>
          <span className="ml-auto">Public domain filings. Not investment advice.</span>
        </div>
      </footer>
    </div>
  )
}

function Masthead({ chatOpen, onToggleChat }: { chatOpen: boolean; onToggleChat: () => void }) {
  return (
    <header className="border-b border-border px-4 pt-5 pb-4 md:px-6">
      <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.32em] text-muted-foreground uppercase">
            U.S. Securities and Exchange Commission
          </p>
          <h1 className="mt-1 text-[26px] leading-none font-semibold tracking-tight text-balance md:text-[34px]">
            EDGAR <span className="text-primary">Extraction</span> Terminal
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="live">
            <LiveDot /> live
          </Pill>
          <Pill>submissions</Pill>
          <Pill>xbrl facts</Pill>
          <Pill>frames</Pill>
          <Pill>full-text</Pill>
          <Pill tone="accent">archives</Pill>
        </div>
        <button
          type="button"
          onClick={onToggleChat}
          className={cn(
            'ml-auto flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] uppercase transition-colors',
            chatOpen
              ? 'border-primary/40 bg-primary/12 text-primary'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary',
          )}
          title={chatOpen ? 'Cerrar panel AI' : 'Abrir panel AI'}
        >
          {chatOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
          <MessageCircle className="size-3" />
          Ask AI
        </button>
      </div>
    </header>
  )
}
