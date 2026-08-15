/**
 * Agent loop: drives the LLM with tool calling via the AI SDK.
 *
 * `runAgent` hands the message history and the tool registry to `generateText`
 * with `maxSteps`, so the SDK executes tool calls automatically. Every tool
 * result (a closed `PanelPayload`) is collected into `panels[]`; the final
 * assistant text is `content`. Only the registered tools are ever callable —
 * no arbitrary execution. No state is shared between requests: everything is
 * scoped to a single `runAgent` call.
 */

import { generateText, isStepCount, jsonSchema, tool, type ModelMessage } from 'ai'
import { getModel, isConfigured } from '@/lib/ai/provider'
import { TOOLS, type AgentContext } from '@/lib/agent/tools'
import type { PanelPayload } from '@/lib/types'

export type AgentResult = { content: string; panels: PanelPayload[] }

/** Client message shape accepted by the chat route (plain role + text). */
export type ChatInputMessage = {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

export class AgentNotConfiguredError extends Error {
  constructor() {
    super('LLM no configurado')
    this.name = 'AgentNotConfiguredError'
  }
}

function toModelMessages(messages: ChatInputMessage[]): ModelMessage[] {
  const out: ModelMessage[] = []
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : ''
    if (m.role === 'user') out.push({ role: 'user', content })
    else if (m.role === 'assistant') out.push({ role: 'assistant', content })
    else out.push({ role: 'system', content })
  }
  return out
}

export async function runAgent(
  messages: ChatInputMessage[],
  ctx: AgentContext = {},
  opts: { instructions?: string } = {},
): Promise<AgentResult> {
  if (!isConfigured()) throw new AgentNotConfiguredError()

  const { model } = getModel()

  const tools: Record<string, unknown> = {}
  for (const spec of TOOLS) {
    tools[spec.name] = tool({
      description: spec.description,
      inputSchema: jsonSchema(spec.parameters),
      execute: async (args) => spec.execute(args as Record<string, unknown>, ctx),
    })
  }
  const toolSet = tools as Parameters<typeof generateText>[0]['tools']

  const panels: PanelPayload[] = []
  const result = await generateText({
    model,
    instructions: opts.instructions,
    tools: toolSet,
    messages: toModelMessages(messages),
    stopWhen: isStepCount(6),
    onStepFinish: ({ toolResults }) => {
      for (const tr of toolResults) {
        const res = 'result' in tr ? tr.result : undefined
        const panel = res as PanelPayload | null | undefined
        if (panel && typeof panel === 'object' && 'kind' in panel) panels.push(panel)
      }
    },
  })

  return { content: result.text, panels }
}