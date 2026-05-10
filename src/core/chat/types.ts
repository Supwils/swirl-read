import type { VaultId, VaultPath } from '@/core/vault'

export type ChatSessionMode = 'chat' | 'creator'

export type ChatMessageRole = 'user' | 'assistant' | 'system'

export type ChatContextSourceType =
  | 'current-document'
  | 'linked-document'
  | 'manual-file'
  | 'selection'

export interface ChatSession {
  id: string
  vaultId: VaultId | null
  title: string
  mode: ChatSessionMode
  createdAt: Date
  updatedAt: Date
  archivedAt: Date | null
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  model: string | null
  createdAt: Date
}

export interface ChatContextRef {
  id: string
  sessionId: string
  vaultId: VaultId
  sourceType: ChatContextSourceType
  label: string
  path: VaultPath | null
  pinned: boolean
  createdAt: Date
  /** Present only for context that cannot be re-read from a vault path. */
  contentSnapshot: string | null
}

export type ChatContextRefDraft = Omit<
  ChatContextRef,
  'id' | 'sessionId' | 'createdAt'
>
