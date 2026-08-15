'use client'

import { Panel } from '@/components/bits'

export type SetupInfo = {
  needsConfig: boolean
  message?: string
  provider?: string
  model?: string
  baseUrl?: string
}

export function SetupPanel({ setup }: { setup: SetupInfo }) {
  return (
    <Panel label="LLM not configured" bodyClassName="p-4">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {setup.message ||
            'The Ask tab needs an LLM configured on the server. Set the environment variables below and restart the dev server.'}
        </p>

        <dl className="rounded-sm border border-border bg-background px-3 py-2 font-mono text-[11px]">
          <div className="flex items-center justify-between gap-4 py-1">
            <dt className="text-muted-foreground">provider</dt>
            <dd className="text-accent">{setup.provider || 'openrouter'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-1">
            <dt className="text-muted-foreground">model</dt>
            <dd className="truncate text-foreground">{setup.model || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-1">
            <dt className="text-muted-foreground">base url</dt>
            <dd className="truncate text-foreground">{setup.baseUrl || '—'}</dd>
          </div>
        </dl>

        <pre className="scrollbar-thin overflow-auto rounded-sm border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          <code>{`# .env.local or your host environment
LLM_PROVIDER=openrouter   # openai | openrouter | anthropic | ollama
LLM_API_KEY=sk-...        # required unless provider = ollama
LLM_MODEL=deepseek/deepseek-chat-v3.2:free
LLM_BASE_URL=https://openrouter.ai/api/v1`}</code>
        </pre>
      </div>
    </Panel>
  )
}