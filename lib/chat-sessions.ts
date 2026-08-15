/**
 * Chat session persistence — localStorage-backed.
 *
 * Each session stores its turns (user + assistant messages) and the raw
 * message history sent to the LLM. Sessions survive page refresh and
 * can be resumed or deleted.
 */

import type { ChatInputMessage } from '@/lib/ai/agent'
import type { PanelPayload } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────

export type Turn = {
  role: 'user' | 'assistant'
  content: string
  panels: PanelPayload[]
}

export type ChatSession = {
  id: string
  title: string
  turns: Turn[]
  messages: ChatInputMessage[]
  createdAt: string
  updatedAt: string
}

// ─── Storage keys ─────────────────────────────────────────────────────────

const SESSIONS_KEY = 'edgar-chat-sessions'
const ACTIVE_KEY = 'edgar-chat-active'

// ─── Helpers ──────────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function isoNow(): string {
  return new Date().toISOString()
}

function readSessions(): ChatSession[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeSessions(sessions: ChatSession[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

function readActiveId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACTIVE_KEY)
}

function writeActiveId(id: string | null): void {
  if (typeof window === 'undefined') return
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

// ─── Public API ───────────────────────────────────────────────────────────

export function listSessions(): ChatSession[] {
  return readSessions().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export function getSession(id: string): ChatSession | null {
  return readSessions().find((s) => s.id === id) ?? null
}

export function getActiveSession(): ChatSession | null {
  const id = readActiveId()
  return id ? getSession(id) : null
}

export function createSession(firstMessage?: string): ChatSession {
  const sessions = readSessions()
  const id = uid()
  const title = firstMessage
    ? firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '…' : '')
    : 'Nueva sesión'
  const session: ChatSession = {
    id,
    title,
    turns: [],
    messages: [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
  }
  sessions.push(session)
  writeSessions(sessions)
  writeActiveId(id)
  return session
}

export function updateSession(
  id: string,
  patch: Partial<Pick<ChatSession, 'turns' | 'messages' | 'title'>>,
): ChatSession | null {
  const sessions = readSessions()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx === -1) return null
  Object.assign(sessions[idx], patch, { updatedAt: isoNow() })
  writeSessions(sessions)
  return sessions[idx]
}

export function deleteSession(id: string): void {
  const sessions = readSessions().filter((s) => s.id !== id)
  writeSessions(sessions)
  if (readActiveId() === id) writeActiveId(null)
}

export function setActiveSession(id: string): void {
  writeActiveId(id)
}

export function clearAllSessions(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSIONS_KEY)
  localStorage.removeItem(ACTIVE_KEY)
}
