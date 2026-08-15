/**
 * Chat endpoint — the LLM agent loop behind the dashboard chat.
 *
 * Reads the user messages from the server; the API key never reaches the
 * client. Returns a closed `{ content, panels }` payload (full JSON, no
 * streaming yet), or `{ needsConfig: true }` so the UI can show a setup panel
 * instead of crashing. Provider errors surface as a 502 `{ error }`.
 */

import { NextResponse } from 'next/server'
import { runAgent, AgentNotConfiguredError, type ChatInputMessage } from '@/lib/ai/agent'
import { describe, isConfigured } from '@/lib/ai/provider'
import type { AgentContext } from '@/lib/agent/tools'

export const runtime = 'nodejs'
export const maxDuration = 60

type ChatBody = {
  messages?: ChatInputMessage[]
  activeCik?: string | null
}

function buildSystemPrompt(activeCik?: string | null): string {
  const blocks: string[] = [
    'Eres un asistente de análisis de datos de SEC EDGAR (filinges públicos y estados financieros de empresas).',
    'Usas estas tool para pedir exactamente lo que el usuario quiera:',
    '- search_entities: buscar empresa en el universo EDGAR (ticker, nombre, CIK).',
    '- get_company / metric_series: dossier completo o métricas anuales de una empresa.',
    '- insider_ledger: transacciones de insiders (Forms 3/4/5).',
    '- holdings_13f: holdings trimestrales Form 13F.',
    '- documents: listar filings recientes (10-K / 10-Q / 8-K).',
    '- fulltext_query: búsqueda full-text sobre documentos EDGAR (2001 en adelante).',
    '- frame_data: datos XBRL crudos por taxonomy / tag / unidad / periodo.',
    'Responde en español, sintético. Llama a las tool para laging con datos exactos; el detalle vive en los paneles.',
    'Rate limit: SEC limita a ~10 req/s y el backend ya throttlea (≈7 req/s). No lanaces requests de más.',
    'AVISO: los datos de EDGAR son públicos y no constituyen asesoría de inversión. Nunca des recomendaciones de compra/venta.',
  ]

  if (activeCik) {
    blocks.push(
      `Hay una empresa activa en la terminal (CIK ${activeCik}). Si el usuario pide "insiders", "holdings" o ` +
        `"métricas" de "esta empresa" sin nombrarla, usa ese CIK activo para los seguimientos.`,
    )
  }

  return blocks.join('\n\n')
}

export async function POST(req: Request) {
  let body: ChatBody
  try {
    body = (await req.json()) as ChatBody
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const messages: ChatInputMessage[] = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) {
    return NextResponse.json({ error: 'Sin mensajes' }, { status: 400 })
  }
  const activeCik = body.activeCik ?? null

  if (!isConfigured()) {
    const d = describe()
    return NextResponse.json({
      needsConfig: true,
      provider: d.provider,
      model: d.model,
      baseUrl: d.baseUrl,
      message: 'LLM no configurado. Define LLM_API_KEY (opcionalmente LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL).',
    })
  }

  try {
    const ctx: AgentContext = { activeCik }
    const result = await runAgent(messages, ctx, {
      instructions: buildSystemPrompt(activeCik),
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AgentNotConfiguredError) {
      return NextResponse.json({ needsConfig: true })
    }
    console.error('[api/chat] error:', (err as Error)?.message ?? err)
    return NextResponse.json({ error: (err as Error)?.message ?? 'Error interno' }, { status: 502 })
  }
}