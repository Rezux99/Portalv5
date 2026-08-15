import { Shell } from '@/components/shell'
import { getLatestFilings, type TapeItem } from '@/lib/sec'

export const revalidate = 30

export default async function Page() {
  let tape: TapeItem[] = []
  try {
    tape = await getLatestFilings(40)
  } catch {
    tape = []
  }
  return <Shell tape={tape} />
}
