import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetDbForTests } from '@/core/persistence/db'
import {
  appendChatMessage,
  archiveChatSession,
  createChatSession,
  deleteChatSession,
  forgetVault,
  getChatContextRefs,
  getChatMessages,
  listChatSessions,
  replaceChatContextRefs,
} from './chat-store'

beforeEach(async () => {
  await __resetDbForTests()
})

afterEach(async () => {
  await __resetDbForTests()
})

describe('chat-store', () => {
  it('creates and lists sessions newest-first per vault', async () => {
    const older = await createChatSession({
      vaultId: 'vault-a',
      title: 'Older',
    })
    const newer = await createChatSession({
      vaultId: 'vault-a',
      title: 'Newer',
    })
    await createChatSession({ vaultId: 'vault-b', title: 'Other' })

    await appendChatMessage(older.id, {
      role: 'user',
      content: 'bump older',
      createdAt: new Date('2099-01-02T00:00:00Z'),
    })
    await appendChatMessage(newer.id, {
      role: 'user',
      content: 'newer but not bumped',
      createdAt: new Date('2099-01-01T00:00:00Z'),
    })

    const sessions = await listChatSessions('vault-a')
    expect(sessions.map((s) => s.title)).toEqual(['Older', 'Newer'])
  })

  it('round-trips messages in chronological order', async () => {
    const session = await createChatSession({ vaultId: 'vault-a' })
    await appendChatMessage(session.id, {
      role: 'assistant',
      content: 'second',
      createdAt: new Date('2099-01-01T00:00:02Z'),
      model: 'test-model',
    })
    await appendChatMessage(session.id, {
      role: 'user',
      content: 'first',
      createdAt: new Date('2099-01-01T00:00:01Z'),
    })

    const messages = await getChatMessages(session.id)
    expect(messages.map((m) => m.content)).toEqual(['first', 'second'])
    expect(messages[1]?.model).toBe('test-model')
  })

  it('replaces context refs without touching messages', async () => {
    const session = await createChatSession({ vaultId: 'vault-a' })
    await appendChatMessage(session.id, { role: 'user', content: 'hello' })

    await replaceChatContextRefs(session.id, [
      {
        vaultId: 'vault-a',
        sourceType: 'current-document',
        label: 'index.md',
        path: 'index.md',
        pinned: true,
        contentSnapshot: null,
      },
    ])
    await replaceChatContextRefs(session.id, [
      {
        vaultId: 'vault-a',
        sourceType: 'selection',
        label: 'Selection from index.md',
        path: 'index.md',
        pinned: true,
        contentSnapshot: 'selected text',
      },
    ])

    const refs = await getChatContextRefs(session.id)
    expect(refs).toHaveLength(1)
    expect(refs[0]?.sourceType).toBe('selection')
    expect(refs[0]?.contentSnapshot).toBe('selected text')
    expect(await getChatMessages(session.id)).toHaveLength(1)
  })

  it('archives sessions out of the default list', async () => {
    const session = await createChatSession({ vaultId: 'vault-a' })
    await archiveChatSession(session.id)

    expect(await listChatSessions('vault-a')).toHaveLength(0)
    expect(
      await listChatSessions('vault-a', { includeArchived: true }),
    ).toHaveLength(1)
  })

  it('deletes a session and cascades messages and context refs', async () => {
    const session = await createChatSession({ vaultId: 'vault-a' })
    await appendChatMessage(session.id, { role: 'user', content: 'hello' })
    await replaceChatContextRefs(session.id, [
      {
        vaultId: 'vault-a',
        sourceType: 'current-document',
        label: 'index.md',
        path: 'index.md',
        pinned: true,
        contentSnapshot: null,
      },
    ])

    await deleteChatSession(session.id)

    expect(await getChatMessages(session.id)).toHaveLength(0)
    expect(await getChatContextRefs(session.id)).toHaveLength(0)
    expect(
      await listChatSessions('vault-a', { includeArchived: true }),
    ).toHaveLength(0)
  })

  it('forgetVault clears sessions, messages, and refs for one vault only', async () => {
    const a = await createChatSession({ vaultId: 'vault-a' })
    const b = await createChatSession({ vaultId: 'vault-b' })
    await appendChatMessage(a.id, { role: 'user', content: 'a' })
    await appendChatMessage(b.id, { role: 'user', content: 'b' })
    await replaceChatContextRefs(a.id, [
      {
        vaultId: 'vault-a',
        sourceType: 'current-document',
        label: 'a.md',
        path: 'a.md',
        pinned: true,
        contentSnapshot: null,
      },
    ])

    await forgetVault('vault-a')

    expect(
      await listChatSessions('vault-a', { includeArchived: true }),
    ).toHaveLength(0)
    expect(await getChatMessages(a.id)).toHaveLength(0)
    expect(await listChatSessions('vault-b')).toHaveLength(1)
    expect(await getChatMessages(b.id)).toHaveLength(1)
  })
})
