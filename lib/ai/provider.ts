/**
 * LLM provider abstraction.
 *
 * Reads provider/model from env vars and constructs an AI SDK model instance
 * per request. The API key never leaves the server: this module is imported
 * only by server code, and `describe()` intentionally omits secrets so the
 * settings UI can surface status without exposing the key.
 *
 * Env vars:
 * - LLM_PROVIDER  default `openrouter` (openai | openrouter | anthropic | ollama)
 * - LLM_API_KEY   required for cloud providers, optional for ollama
 * - LLM_MODEL     default `deepseek/deepseek-chat-v3.2:free`
 * - LLM_BASE_URL  custom base URL (openai-compatible providers / ollama)
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOllama } from 'ollama-ai-provider'
import type { LanguageModel } from 'ai'

export type ProviderName = 'openai' | 'openrouter' | 'anthropic' | 'ollama'

const DEFAULT_PROVIDER: ProviderName = 'openrouter'
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3.2:free'

const BASE_URLS: Record<ProviderName, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://localhost:11434/api',
}

/** Providers that require an API key vs. a self-hosted endpoint that does not. */
const PROVIDERS_VALUE_SET: Record<string, true> = {
  openai: true,
  openrouter: true,
  anthropic: true,
  ollama: true,
}

/** Providers that require an API key vs. a self-hosted endpoint that does not. */
const KEYED_PROVIDERS: Record<ProviderName, boolean> = {
  openai: true,
  openrouter: true,
  anthropic: true,
  ollama: false,
}

export function providerName(): ProviderName {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase()
  if (raw && raw in PROVIDERS_VALUE_SET) return raw as ProviderName
  return DEFAULT_PROVIDER
}

export function modelName(): string {
  return process.env.LLM_MODEL?.trim() || DEFAULT_MODEL
}

export function configuredBaseUrl(provider: ProviderName): string {
  return process.env.LLM_BASE_URL?.trim() || BASE_URLS[provider]
}

/** True when the active provider is usable (key present, or a keyless provider). */
export function isConfigured(): boolean {
  const provider = providerName()
  if (!KEYED_PROVIDERS[provider]) return true
  const key = process.env.LLM_API_KEY?.trim()
  return Boolean(key)
}

/** Public status descriptor — never includes the API key. */
export function describe() {
  const provider = providerName()
  return {
    provider,
    model: modelName(),
    baseUrl: configuredBaseUrl(provider),
  }
}

/** Build a fresh AI SDK model for the active provider. No shared state. */
export function getModel(): { model: LanguageModel; provider: ProviderName } {
  const provider = providerName()
  const modelId = modelName()

  switch (provider) {
    case 'openrouter':
    case 'openai': {
      const client = createOpenAICompatible({
        name: provider,
        baseURL: configuredBaseUrl(provider),
        apiKey: process.env.LLM_API_KEY,
      })
      return { model: client(modelId) as unknown as LanguageModel, provider }
    }
    case 'anthropic': {
      const client = createAnthropic({ apiKey: process.env.LLM_API_KEY })
      return { model: client(modelId) as unknown as LanguageModel, provider }
    }
    case 'ollama': {
      const client = createOllama({ baseURL: configuredBaseUrl(provider) })
      return { model: client(modelId) as unknown as LanguageModel, provider }
    }
  }
}