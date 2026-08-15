'use client'

import { Panel, Pill } from '@/components/bits'
import { Check, Copy, Download, Terminal } from 'lucide-react'
import { useState } from 'react'

const ENDPOINTS: [string, string][] = [
  ['submissions', 'data.sec.gov/submissions/CIK##########.json'],
  ['companyfacts', 'data.sec.gov/api/xbrl/companyfacts/CIK##########.json'],
  ['companyconcept', 'data.sec.gov/api/xbrl/companyconcept/CIK…/us-gaap/{tag}.json'],
  ['frames', 'data.sec.gov/api/xbrl/frames/us-gaap/{tag}/USD/CY2024Q4I.json'],
  ['fulltext', 'efts.sec.gov/LATEST/search-index?q=…&forms=10-K'],
  ['tape', 'sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom'],
  ['archives', 'sec.gov/Archives/edgar/data/{cik}/{accession}/'],
  ['universe', 'sec.gov/files/company_tickers_exchange.json'],
]

const SNIPPET = `# 1. Declare yourself — the SEC rejects anonymous traffic
export SEC_USER_AGENT="Your Name your@email.com"

# 2. Everything for one company: filings, XBRL, insiders, 13F, documents
python edgar_extract.py company NVDA --all

# 3. Cross-sectional: one tag across every filer
python edgar_extract.py frames us-gaap Assets USD CY2024Q4I

# 4. Full-text search over every EDGAR document since 2001
python edgar_extract.py search "material weakness" --forms 10-K

# 5. Watch the live acceptance feed
python edgar_extract.py tape --watch --form 8-K`

export function ExportRail({ activeCik }: { activeCik?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(SNIPPET)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel label="Extractor script" meta="python · 0 deps" bodyClassName="p-3">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-mono text-foreground">edgar_extract.py</span> pulls every endpoint
          below into a resumable SQLite warehouse plus per-dataset CSV and JSON. Token-bucket
          throttled under the SEC 10 req/s fair-access limit, with HTTP caching and exponential
          backoff.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {['submissions', 'XBRL facts', 'frames', 'Form 3/4/5', '13F-HR', 'full text', 'documents'].map(
            (t) => (
              <Pill key={t}>{t}</Pill>
            ),
          )}
        </div>

        <a
          href="/edgar_extract.py"
          download="edgar_extract.py"
          className="mt-3 flex items-center justify-center gap-2 rounded-sm bg-accent px-3 py-2.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-accent-foreground uppercase transition-opacity hover:opacity-90"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download edgar_extract.py
        </a>

        <div className="mt-3 rounded-sm border border-border bg-background">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Terminal className="size-3 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
              quickstart
            </span>
            <button
              type="button"
              onClick={copy}
              className="ml-auto flex items-center gap-1 font-mono text-[9px] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-primary"
            >
              {copied ? (
                <Check className="size-3 text-primary" aria-hidden="true" />
              ) : (
                <Copy className="size-3" aria-hidden="true" />
              )}
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
          <pre className="scrollbar-thin max-h-56 overflow-auto px-2 py-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
            <code>{SNIPPET}</code>
          </pre>
        </div>
      </Panel>

      <Panel label="Live endpoints" meta={`${ENDPOINTS.length}`} bodyClassName="px-3 py-1">
        <dl>
          {ENDPOINTS.map(([k, v]) => (
            <div key={k} className="border-b border-border/60 py-1.5 last:border-0">
              <dt className="font-mono text-[10px] font-semibold tracking-[0.1em] text-primary uppercase">
                {k}
              </dt>
              <dd className="mt-0.5 font-mono text-[10.5px] leading-snug break-all text-muted-foreground">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      {activeCik ? (
        <Panel label="This session" bodyClassName="p-3">
          <p className="font-mono text-[11px] text-muted-foreground">
            Reproduce the loaded dossier locally:
          </p>
          <pre className="mt-2 overflow-auto rounded-sm border border-border bg-background px-2 py-2 font-mono text-[10.5px] text-accent">
            <code>{`python edgar_extract.py company ${activeCik} --all`}</code>
          </pre>
        </Panel>
      ) : null}
    </div>
  )
}
