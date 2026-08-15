import { fullTextSearch } from '@/lib/sec'
import { NextResponse } from 'next/server'

export const revalidate = 60

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const q = sp.get('q') ?? ''
  if (!q.trim()) return NextResponse.json({ total: 0, hits: [] })
  const forms = sp.get('forms') ?? undefined
  try {
    const data = await fullTextSearch(q, { forms, from: Number(sp.get('from') ?? 0) })
    return NextResponse.json(data)
  } catch (err) {
    console.log('[v0] fts failed:', (err as Error).message)
    return NextResponse.json({ total: 0, hits: [], error: (err as Error).message }, { status: 502 })
  }
}
