import { getLatestFilings } from '@/lib/sec'
import { NextResponse } from 'next/server'

export const revalidate = 0

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const form = sp.get('form') ?? ''
  const count = Math.min(Number(sp.get('count') ?? 40), 100)
  try {
    const items = await getLatestFilings(count, form)
    return NextResponse.json(
      { ts: new Date().toISOString(), count: items.length, items },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.log('[v0] tape failed:', (err as Error).message)
    return NextResponse.json({ items: [], error: (err as Error).message }, { status: 502 })
  }
}
