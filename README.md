# Portalv5 — EDGAR Extraction Terminal

Real-time SEC EDGAR extraction terminal. Live filing tape, full-text search, XBRL company facts, insider transactions and one-click JSON/CSV export.

## Status

**Proyecto pausado hasta conseguir los primeros 3 clientes B2B.**

## Tech Stack

- Next.js 16 (App Router)
- React 19
- Tailwind CSS 4
- Vercel AI SDK (Anthropic / OpenAI / Ollama)
- SEC EDGAR public APIs

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `SEC_USER_AGENT` | Required by SEC APIs — your app name + contact email |
| `ANTHROPIC_API_KEY` | Optional — for AI chat panel (Anthropic) |
| `OPENAI_API_KEY` | Optional — for AI chat panel (OpenAI) |

## License

Private — all rights reserved.
