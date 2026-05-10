import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  FileText,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  X,
} from 'lucide-react'
import { resolveActiveProvider } from '@/core/ai/resolve-active-provider'
import { AIError, type ContextChunk } from '@/core/ai/types'
import {
  appendChatMessage,
  createChatSession,
  getChatContextRefs,
  getChatMessages,
  getChatSession,
  listChatSessions,
  replaceChatContextRefs,
} from '@/core/chat/chat-store'
import {
  buildReadingContextRefs,
  loadContextChunksForRefs,
} from '@/core/chat/context-bridge'
import type {
  ChatContextRef,
  ChatMessage,
  ChatSession,
} from '@/core/chat/types'
import type { VaultId } from '@/core/vault'
import { getAdapter } from '@/stores/vault-store'

const HISTORY_CONTEXT_LIMIT = 12

interface ChatMessageView extends ChatMessage {
  streaming?: boolean
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'streaming'; providerLabel: string }
  | { kind: 'error'; message: string }

export function ChatPage(): ReactNode {
  const { vaultId, sessionId } = useParams<{
    vaultId: VaultId
    sessionId?: string
  }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [refs, setRefs] = useState<ChatContextRef[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const attachPath = searchParams.get('attach')

  const loadActiveSession = useCallback(
    async (id: string): Promise<void> => {
      const [session, nextMessages, nextRefs] = await Promise.all([
        getChatSession(id),
        getChatMessages(id),
        getChatContextRefs(id),
      ])
      if (!session || session.vaultId !== vaultId) {
        throw new Error('Chat session not found for this vault.')
      }
      setActiveSession(session)
      setMessages(nextMessages)
      setRefs(nextRefs)
      setStatus({ kind: 'idle' })
    },
    [vaultId],
  )

  const refreshSessions = useCallback(async (): Promise<ChatSession[]> => {
    if (!vaultId) return []
    const next = await listChatSessions(vaultId)
    setSessions(next)
    return next
  }, [vaultId])

  useEffect(() => {
    if (!vaultId) return
    let cancelled = false

    void (async () => {
      setStatus({ kind: 'loading' })
      try {
        const nextSessions = await listChatSessions(vaultId)
        if (cancelled) return
        setSessions(nextSessions)

        if (!sessionId) {
          const target =
            nextSessions[0] ??
            (await createChatSession({
              vaultId,
              title: 'Reading chat',
            }))
          if (cancelled) return
          const suffix = attachPath
            ? `?attach=${encodeURIComponent(attachPath)}`
            : ''
          void navigate(`/app/${vaultId}/__chat__/${target.id}${suffix}`, {
            replace: true,
          })
          return
        }

        await loadActiveSession(sessionId)
      } catch (err) {
        if (!cancelled) setStatus({ kind: 'error', message: errorText(err) })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [attachPath, loadActiveSession, navigate, sessionId, vaultId])

  useEffect(() => {
    if (!vaultId || !activeSession || !attachPath) return
    let cancelled = false
    void (async () => {
      const adapter = getAdapter(vaultId)
      if (!adapter) {
        setStatus({
          kind: 'error',
          message: 'Open or re-authorize this vault before attaching context.',
        })
        return
      }
      const drafts = await buildReadingContextRefs({
        vaultId,
        adapter,
        currentPath: attachPath,
        includeLinkedDocuments: false,
      })
      if (cancelled) return
      const nextRefs = await replaceChatContextRefs(activeSession.id, drafts)
      if (cancelled) return
      setRefs(nextRefs)
      setSearchParams({}, { replace: true })
      setStatus({ kind: 'idle' })
    })()
    return () => {
      cancelled = true
    }
  }, [activeSession, attachPath, setSearchParams, vaultId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const currentDocumentRef = useMemo(
    () => refs.find((ref) => ref.sourceType === 'current-document' && ref.path),
    [refs],
  )

  async function handleNewChat(): Promise<void> {
    if (!vaultId) return
    const session = await createChatSession({ vaultId, title: 'Reading chat' })
    await refreshSessions()
    void navigate(`/app/${vaultId}/__chat__/${session.id}`)
  }

  async function handleDetachContext(): Promise<void> {
    if (!activeSession) return
    const nextRefs = await replaceChatContextRefs(activeSession.id, [])
    setRefs(nextRefs)
  }

  async function handleAttachLinked(): Promise<void> {
    if (!vaultId || !activeSession || !currentDocumentRef?.path) return
    const adapter = getAdapter(vaultId)
    if (!adapter) {
      setStatus({
        kind: 'error',
        message: 'Open or re-authorize this vault before attaching context.',
      })
      return
    }
    const nextDrafts = await buildReadingContextRefs({
      vaultId,
      adapter,
      currentPath: currentDocumentRef.path,
      includeLinkedDocuments: true,
    })
    const snapshots = refs.filter((ref) => ref.contentSnapshot)
    const nextRefs = await replaceChatContextRefs(activeSession.id, [
      ...nextDrafts,
      ...snapshots.map((ref) => ({
        vaultId: ref.vaultId,
        sourceType: ref.sourceType,
        label: ref.label,
        path: ref.path,
        pinned: ref.pinned,
        contentSnapshot: ref.contentSnapshot,
      })),
    ])
    setRefs(nextRefs)
  }

  async function handleSend(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!activeSession || status.kind === 'streaming') return
    const content = draft.trim()
    if (!content) return
    setDraft('')

    const historyBeforeSend = messages
    const userMessage = await appendChatMessage(activeSession.id, {
      role: 'user',
      content,
    })
    const tempAssistant: ChatMessageView = {
      id: `streaming-${Date.now().toString(36)}`,
      sessionId: activeSession.id,
      role: 'assistant',
      content: '',
      model: null,
      createdAt: new Date(),
      streaming: true,
    }
    setMessages((prev) => [...prev, userMessage, tempAssistant])

    const resolved = await resolveActiveProvider()
    if (!resolved) {
      setStatus({
        kind: 'error',
        message: 'No AI provider configured. Open Settings to add one.',
      })
      setMessages((prev) => prev.filter((m) => m.id !== tempAssistant.id))
      return
    }

    setStatus({ kind: 'streaming', providerLabel: resolved.label })
    let assistantText = ''
    try {
      const context = await buildSendContext(refs, historyBeforeSend)
      const stream = resolved.provider.ask(content, context)
      for await (const chunk of stream) {
        assistantText += chunk
        setMessages((prev) =>
          prev.map((message) =>
            message.id === tempAssistant.id
              ? { ...message, content: assistantText }
              : message,
          ),
        )
      }

      const persisted = await appendChatMessage(activeSession.id, {
        role: 'assistant',
        content: assistantText,
        model: resolved.label,
      })
      setMessages((prev) =>
        prev.map((message) =>
          message.id === tempAssistant.id ? persisted : message,
        ),
      )
      setStatus({ kind: 'idle' })
      await refreshSessions()
    } catch (err) {
      setStatus({ kind: 'error', message: errorText(err) })
      if (!assistantText.trim()) {
        setMessages((prev) => prev.filter((m) => m.id !== tempAssistant.id))
      } else {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === tempAssistant.id
              ? { ...message, streaming: false }
              : message,
          ),
        )
      }
    }
  }

  if (!vaultId) return null

  return (
    <main className="swirlread-chat">
      <aside className="swirlread-chat__sessions" aria-label="Chat sessions">
        <div className="swirlread-chat__sessions-header">
          <p>Chats</p>
          <button
            type="button"
            className="swirlread-chat__icon-btn"
            aria-label="New chat"
            onClick={() => void handleNewChat()}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="swirlread-chat__session-list">
          {sessions.map((session) => (
            <Link
              key={session.id}
              to={`/app/${vaultId}/__chat__/${session.id}`}
              className="swirlread-chat__session-link"
              aria-current={
                session.id === activeSession?.id ? 'page' : undefined
              }
            >
              <MessageCircle size={14} aria-hidden="true" />
              <span>{session.title}</span>
            </Link>
          ))}
        </div>
      </aside>

      <section className="swirlread-chat__main" aria-label="Chat">
        <header className="swirlread-chat__header">
          <div>
            <p className="swirlread-chat__eyebrow">Reading chat</p>
            <h1>{activeSession?.title ?? 'Chat'}</h1>
          </div>
          <Link to={`/app/${vaultId}`} className="swirlread-chat__back">
            Back to reading
          </Link>
        </header>

        <ContextBar
          refs={refs}
          vaultId={vaultId}
          canAttachLinked={Boolean(currentDocumentRef?.path)}
          onAttachLinked={() => void handleAttachLinked()}
          onDetach={() => void handleDetachContext()}
        />

        {status.kind === 'loading' ? (
          <div className="swirlread-chat__loading">
            <Loader2 size={16} className="swirlread-chat__spinner" />
            Loading chat...
          </div>
        ) : (
          <div className="swirlread-chat__messages">
            {messages.length === 0 && (
              <div className="swirlread-chat__empty">
                <MessageCircle size={22} aria-hidden="true" />
                <p>Start a chat, or attach the document you are reading.</p>
              </div>
            )}
            {messages.map((message) => (
              <article
                key={message.id}
                className={`swirlread-chat__message swirlread-chat__message--${message.role}`}
              >
                <p className="swirlread-chat__message-role">
                  {message.role === 'assistant' ? 'Assistant' : 'You'}
                  {message.model ? ` · ${message.model}` : ''}
                </p>
                <div className="swirlread-chat__message-body">
                  {message.content}
                  {message.streaming && (
                    <span className="swirlread-chat__cursor">▋</span>
                  )}
                </div>
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {status.kind === 'error' && (
          <p className="swirlread-chat__error" role="alert">
            {status.message}
          </p>
        )}
        {status.kind === 'streaming' && (
          <p className="swirlread-chat__status">
            Answering with {status.providerLabel}...
          </p>
        )}

        <form className="swirlread-chat__composer" onSubmit={handleSend}>
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
            placeholder="Ask about the attached sources, or chat normally..."
            rows={3}
            disabled={status.kind === 'streaming'}
          />
          <button
            type="submit"
            className="swirlread-chat__send"
            disabled={!draft.trim() || status.kind === 'streaming'}
            aria-label="Send message"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  )
}

function ContextBar({
  refs,
  vaultId,
  canAttachLinked,
  onAttachLinked,
  onDetach,
}: {
  refs: ChatContextRef[]
  vaultId: VaultId
  canAttachLinked: boolean
  onAttachLinked: () => void
  onDetach: () => void
}): ReactNode {
  return (
    <div className="swirlread-chat__context">
      <div className="swirlread-chat__context-chips">
        <span className="swirlread-chat__context-label">Sources</span>
        {refs.length === 0 ? (
          <span className="swirlread-chat__context-empty">None attached</span>
        ) : (
          refs.map((ref) =>
            ref.path ? (
              <Link
                key={ref.id}
                to={`/app/${vaultId}/${ref.path}`}
                className="swirlread-chat__source"
                title={ref.path}
              >
                <FileText size={12} aria-hidden="true" />
                <span>{ref.label}</span>
              </Link>
            ) : (
              <span key={ref.id} className="swirlread-chat__source">
                <FileText size={12} aria-hidden="true" />
                <span>{ref.label}</span>
              </span>
            ),
          )
        )}
      </div>
      <div className="swirlread-chat__context-actions">
        <button
          type="button"
          onClick={onAttachLinked}
          disabled={!canAttachLinked}
        >
          <Link2 size={13} aria-hidden="true" />
          Linked notes
        </button>
        <button type="button" onClick={onDetach} disabled={refs.length === 0}>
          <X size={13} aria-hidden="true" />
          Detach
        </button>
      </div>
    </div>
  )
}

async function buildSendContext(
  refs: ChatContextRef[],
  history: ChatMessageView[],
): Promise<ContextChunk[]> {
  const chunks = await loadContextChunksForRefs(refs, {
    resolveVault: (vaultId) => getAdapter(vaultId),
  })
  const transcript = history
    .filter((message) => message.role !== 'system')
    .slice(-HISTORY_CONTEXT_LIMIT)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n\n')
  if (transcript.trim()) {
    chunks.push({
      source: 'conversation so far',
      content: transcript,
    })
  }
  return chunks
}

function errorText(err: unknown): string {
  if (err instanceof AIError) return err.message
  return err instanceof Error ? err.message : String(err)
}
