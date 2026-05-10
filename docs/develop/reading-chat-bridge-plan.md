# Reading / Chat Bridge Plan

> Status: design accepted, foundation in progress
> Principle: reading stays primary; chat is optional and locally scoped.

## Product Shape

SwirlRead should keep two independent modes:

- **Read mode** is the default experience. A user can open a vault, read files,
  use navigation, edit lightly, and never configure or see chat.
- **Chat mode** is an optional workspace attached to a vault. It can be opened
  from the shell or a document action, but it does not own the reading route.
- **The bridge** is explicit: the user chooses when the current reading context
  is attached to a chat session. No vault content is sent or copied just because
  a document is open.

This keeps the product from becoming a chatbot with a file viewer. The reader
remains the stable surface; chat becomes a contextual companion.

## UX Model

The first cut should expose these actions:

- `Open Chat` from the shell opens the last chat session for the current vault,
  or creates a blank one.
- `Ask with this page` from a document opens chat and attaches the current file.
- `Attach linked notes` adds directly linked Markdown notes, capped by count and
  total characters.
- `Attach selection` adds only the highlighted text as a snapshot, because a
  browser text selection has no stable file offset in v1.
- `Detach context` removes bridge references from the current chat session.

The chat UI should show attached sources as small chips above the input. Clicking
a chip navigates back to the source document. This is the visible contract: chat
knows about exactly the sources shown there, nothing else.

## Persistence Rules

Chat state is local-first and Dexie-backed:

- `chatSessions` stores session metadata only.
- `chatMessages` stores user/assistant messages.
- `chatContextRefs` stores lightweight source references.

For file-backed sources, store only `vaultId`, `path`, `label`, and source type.
Read the latest content from the active `VaultFileSystem` only when sending a
message. This avoids silently duplicating the user's vault into IndexedDB.

For selected text, store a `contentSnapshot` because the source is not stable.
Keep this action explicit in the UI.

## Code Boundaries

The implementation should stay split like this:

- `core/chat/types.ts`: domain types.
- `core/chat/chat-store.ts`: Dexie CRUD for local sessions, messages, refs.
- `core/chat/context-bridge.ts`: convert the current reading surface into
  `ContextChunk[]` for AI providers.
- `ui/chat/*`: React chat surface, lazy-loaded from the app shell.
- `stores/*`: only UI state such as whether the chat panel is open.

Do not import Vue/Nuxt code from `swil-chat`. The useful parts to borrow are
the data model ideas: sessions, messages, context windows, rolling summaries,
and source chips.

## First Implementation Slice

1. Add Dexie tables and local CRUD for chat sessions/messages/context refs.
2. Add a context bridge that can build model-ready context from:
   - current document
   - direct wikilink neighbours
   - selected text
3. Add tests for persistence, vault deletion cleanup, caps, and snapshot rules.
4. Add the lazy chat route/panel after the core layer is stable.

## Later Slices

- Rolling summaries after a session exceeds a message threshold.
- Full-text-search context attachment from command palette results.
- Creator role templates as a local system prompt layer.
- Optional sidecar gateway support via OpenAI-compatible base URL.
