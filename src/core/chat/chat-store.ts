import {
  db,
  type ChatContextRefRow,
  type ChatMessageRow,
  type ChatSessionRow,
} from '@/core/persistence/db'
import type { VaultId } from '@/core/vault'
import { registerVaultDeletionHook } from '@/stores/vault-lifecycle'
import type {
  ChatContextRef,
  ChatContextRefDraft,
  ChatMessage,
  ChatMessageRole,
  ChatSession,
  ChatSessionMode,
} from './types'

interface CreateChatSessionInput {
  vaultId?: VaultId | null
  title?: string
  mode?: ChatSessionMode
}

interface AppendMessageInput {
  role: ChatMessageRole
  content: string
  model?: string | null
  createdAt?: Date
}

export async function createChatSession(
  input: CreateChatSessionInput = {},
): Promise<ChatSession> {
  const now = new Date()
  const title = input.title?.trim()
  const session: ChatSession = {
    id: makeId('chat'),
    vaultId: input.vaultId ?? null,
    title: title && title.length > 0 ? title : 'New Chat',
    mode: input.mode ?? 'chat',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  }
  await db.chatSessions.put(sessionToRow(session))
  return session
}

export async function getChatSession(
  sessionId: string,
): Promise<ChatSession | null> {
  const row = await db.chatSessions.get(sessionId)
  return row ? rowToSession(row) : null
}

export async function listChatSessions(
  vaultId: VaultId,
  options: { includeArchived?: boolean } = {},
): Promise<ChatSession[]> {
  const rows = await db.chatSessions.where('vaultId').equals(vaultId).toArray()
  return rows
    .filter(
      (row) =>
        options.includeArchived === true || row.archivedAtMs === undefined,
    )
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .map(rowToSession)
}

export async function renameChatSession(
  sessionId: string,
  title: string,
): Promise<ChatSession | null> {
  const row = await db.chatSessions.get(sessionId)
  if (!row) return null
  const updated: ChatSessionRow = {
    ...row,
    title: title.trim() || row.title,
    updatedAtMs: Date.now(),
  }
  await db.chatSessions.put(updated)
  return rowToSession(updated)
}

export async function archiveChatSession(sessionId: string): Promise<void> {
  const row = await db.chatSessions.get(sessionId)
  if (!row) return
  const now = Date.now()
  await db.chatSessions.put({
    ...row,
    archivedAtMs: now,
    updatedAtMs: now,
  })
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.chatSessions, db.chatMessages, db.chatContextRefs],
    async () => {
      await db.chatSessions.delete(sessionId)
      await db.chatMessages.where('sessionId').equals(sessionId).delete()
      await db.chatContextRefs.where('sessionId').equals(sessionId).delete()
    },
  )
}

export async function appendChatMessage(
  sessionId: string,
  input: AppendMessageInput,
): Promise<ChatMessage> {
  const createdAt = input.createdAt ?? new Date()
  const message: ChatMessage = {
    id: makeId('msg'),
    sessionId,
    role: input.role,
    content: input.content,
    model: input.model ?? null,
    createdAt,
  }

  await db.transaction('rw', [db.chatMessages, db.chatSessions], async () => {
    await db.chatMessages.put(messageToRow(message))
    const session = await db.chatSessions.get(sessionId)
    if (session) {
      await db.chatSessions.put({
        ...session,
        updatedAtMs: Math.max(session.updatedAtMs, createdAt.getTime()),
      })
    }
  })

  return message
}

export async function getChatMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  const rows = await db.chatMessages
    .where('[sessionId+createdAtMs]')
    .between([sessionId, 0], [sessionId, Number.POSITIVE_INFINITY])
    .toArray()
  return rows.map(rowToMessage)
}

export async function replaceChatContextRefs(
  sessionId: string,
  refs: ChatContextRefDraft[],
): Promise<ChatContextRef[]> {
  const now = new Date()
  const rows = refs.map((ref) =>
    contextRefToRow({
      ...ref,
      id: makeId('ctx'),
      sessionId,
      createdAt: now,
    }),
  )

  await db.transaction('rw', db.chatContextRefs, async () => {
    await db.chatContextRefs.where('sessionId').equals(sessionId).delete()
    if (rows.length > 0) await db.chatContextRefs.bulkPut(rows)
  })

  return rows.map(rowToContextRef)
}

export async function getChatContextRefs(
  sessionId: string,
): Promise<ChatContextRef[]> {
  const rows = await db.chatContextRefs
    .where('[sessionId+createdAtMs]')
    .between([sessionId, 0], [sessionId, Number.POSITIVE_INFINITY])
    .toArray()
  return rows.map(rowToContextRef)
}

export async function forgetVault(vaultId: VaultId): Promise<void> {
  const sessionIds = await db.chatSessions
    .where('vaultId')
    .equals(vaultId)
    .primaryKeys()
  await db.transaction(
    'rw',
    [db.chatSessions, db.chatMessages, db.chatContextRefs],
    async () => {
      if (sessionIds.length > 0) {
        await db.chatSessions.bulkDelete(sessionIds)
        await db.chatMessages.where('sessionId').anyOf(sessionIds).delete()
      }
      await db.chatContextRefs.where('vaultId').equals(vaultId).delete()
    },
  )
}

function makeId(prefix: string): string {
  const random =
    globalThis.crypto && 'randomUUID' in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

function sessionToRow(session: ChatSession): ChatSessionRow {
  return {
    id: session.id,
    ...(session.vaultId ? { vaultId: session.vaultId } : {}),
    title: session.title,
    mode: session.mode,
    createdAtMs: session.createdAt.getTime(),
    updatedAtMs: session.updatedAt.getTime(),
    ...(session.archivedAt
      ? { archivedAtMs: session.archivedAt.getTime() }
      : {}),
  }
}

function rowToSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    vaultId: row.vaultId ?? null,
    title: row.title,
    mode: row.mode === 'creator' ? 'creator' : 'chat',
    createdAt: new Date(row.createdAtMs),
    updatedAt: new Date(row.updatedAtMs),
    archivedAt:
      row.archivedAtMs === undefined ? null : new Date(row.archivedAtMs),
  }
}

function messageToRow(message: ChatMessage): ChatMessageRow {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    ...(message.model ? { model: message.model } : {}),
    createdAtMs: message.createdAt.getTime(),
  }
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  const role =
    row.role === 'assistant' || row.role === 'system' ? row.role : 'user'
  return {
    id: row.id,
    sessionId: row.sessionId,
    role,
    content: row.content,
    model: row.model ?? null,
    createdAt: new Date(row.createdAtMs),
  }
}

function contextRefToRow(ref: ChatContextRef): ChatContextRefRow {
  return {
    id: ref.id,
    sessionId: ref.sessionId,
    vaultId: ref.vaultId,
    sourceType: ref.sourceType,
    label: ref.label,
    ...(ref.path ? { path: ref.path } : {}),
    pinned: ref.pinned,
    createdAtMs: ref.createdAt.getTime(),
    ...(ref.contentSnapshot ? { contentSnapshot: ref.contentSnapshot } : {}),
  }
}

function rowToContextRef(row: ChatContextRefRow): ChatContextRef {
  const sourceType =
    row.sourceType === 'linked-document' ||
    row.sourceType === 'manual-file' ||
    row.sourceType === 'selection'
      ? row.sourceType
      : 'current-document'
  return {
    id: row.id,
    sessionId: row.sessionId,
    vaultId: row.vaultId,
    sourceType,
    label: row.label,
    path: row.path ?? null,
    pinned: row.pinned,
    createdAt: new Date(row.createdAtMs),
    contentSnapshot: row.contentSnapshot ?? null,
  }
}

// Register at module load — chat persistence is per-vault, no in-memory
// store so the hook just runs the Dexie cleanup we already export above.
registerVaultDeletionHook(async (vaultId) => {
  await forgetVault(vaultId)
})
