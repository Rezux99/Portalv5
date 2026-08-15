import { resolveCik } from '@/lib/sec'
import { buildCompanyPayload } from '@/lib/dossier'
import { NextResponse } from 'next/server'

export const revalidate = 120

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('cik')?.trim()
  if (!raw) return NextResponse.json({ error: 'cik required' }, { status: 400 })

  try {
    const cik = await resolveCik(raw)
    if (!cik) return NextResponse.json({ error: `No EDGAR entity for "${raw}"` }, { status: 404 })
    return NextResponse.json(await buildCompanyPayload(cik))
  } catch (err) {
    console.log('[v0] company failed:', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
