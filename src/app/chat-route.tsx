/**
 * Lazy ChatPage wrapper. Keeps the optional chat surface out of the main
 * reading bundle until the user explicitly opens chat.
 */

import { lazy, Suspense, type ReactNode } from 'react'

const ChatPage = lazy(() =>
  import('@/ui/chat/ChatPage').then((m) => ({ default: m.ChatPage })),
)

export function LazyChatPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <ChatPage />
    </Suspense>
  )
}
