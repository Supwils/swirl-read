/**
 * Lazy ChatPage wrapper. Keeps the optional chat surface out of the main
 * reading bundle until the user explicitly opens chat.
 */

import { lazy, type ReactNode } from 'react'
import { ChunkBoundary } from '@/ui/components/ChunkBoundary'

const ChatPage = lazy(() =>
  import('@/ui/chat/ChatPage').then((m) => ({ default: m.ChatPage })),
)

export function LazyChatPage(): ReactNode {
  return (
    <ChunkBoundary label="chat surface">
      <ChatPage />
    </ChunkBoundary>
  )
}
