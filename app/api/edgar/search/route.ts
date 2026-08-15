import { searchUniverse } from '@/lib/sec'
import { NextResponse } from 'next/server'

export const revalidate = 3600

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  try {
    const rows = await searchUniverse(q, 14)
    return NextResponse.json({ q, rows })
  } catch (err) {
    console.log('[v0] search failed:', (err as Error).message)
    return NextResponse.json({ q, rows: [], error: (err as Error).message }, { status: 502 })
  }
}
