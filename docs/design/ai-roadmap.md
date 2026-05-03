# SwirlRead — AI Roadmap

> Status: Decided 2026-05-01 — **AI deferred to Phase 2** · Living document

---

## Philosophy

> AI serves reading, not replaces it.

AI features are **additive**, not central. SwirlRead must be a great reading experience without AI. AI is a Phase 2+ feature that makes a great experience even better.

---

## Phase Plan

### Phase 1 (MVP) — Zero AI

**Decision**: Ship a beautiful, fully-functional reading experience without any AI integration whatsoever.

**Reasoning**:

- The reading experience itself is the core differentiator (immersive, vault-aware, beautiful)
- AI without strong reading UX is just another ChatGPT wrapper
- Building AI features adds significant complexity (provider abstraction, key management, embedding pipeline)
- Most users will judge the product on the first 10 seconds of opening a document — not on AI capabilities

**What this means concretely**:

- No ⌘K AI mode
- No "explain this" buttons
- No semantic search
- No TL;DR generation
- Settings panel has no AI section

**Phase 1 ships when**: reading any markdown file feels delightful, navigation is smooth, themes work, and it's measurably better than VS Code preview / Obsidian reading mode.

---

### Phase 2 — Direct Reading Enhancement

First AI features to ship after the reading experience is solid:

- **⌘K `?` mode**: ask a question, AI answers using the currently open file (+ wikilinked files, 1 hop)
- **Inline explain**: select text → "explain simpler" / "what does this mean?"
- **Auto TL;DR**: long documents (>2000 words) get an optional summary at the top
- **Smart highlight**: AI marks the 3 most important sentences in long documents (visual cue, not a modal)

No vault-wide indexing yet. AI only sees what's currently in view.

---

### Phase 3 — Cross-Vault Recall (Killer Feature)

This is where SwirlRead becomes irreplaceable:

- **Local embeddings**: `transformers.js` runs in-browser, indexes the entire vault to IndexedDB
  - Default model: `Xenova/all-MiniLM-L6-v2` (30MB, English-tuned)
  - Chinese-heavy vaults: `Xenova/bge-small-zh-v1.5` (auto-detected)
  - Index build runs in Web Worker, lazy-loaded only when AI features are first used
- **"What do I know about X?"**: cross-vault semantic search, returns top-N relevant passages with source citations
- **Related panel**: while reading, side panel shows passages from elsewhere in the vault that are semantically similar
- **Contradiction detection**: AI flags passages that disagree with the current page (advanced)

Privacy guarantee: embeddings are computed locally, never sent to an API. Only the user's actual question + retrieved chunks are sent on demand.

---

### Phase 4 — Active Learning

- "Quiz me on this" mode (generates questions from content)
- Auto-generate flashcards
- Spaced repetition queue
- Reading insights ("you haven't reviewed this topic in 30 days")

---

### Phase 5 — Goal-Driven Modes

- Interview Prep: paste a JD, get curated reading list from vault
- Project Research: input a topic, get aggregated relevant material
- Writing Assist: pull citations from vault for outside writing tools

---

## API Access Model

This is a unique area for SwirlRead — most AI tools force users to either pay a subscription or paste an API key. SwirlRead aims to support **multiple access paths** so users can leverage credits they already have.

### Tier 1: User-supplied API Key (always available, MVP-ready when AI ships)

The simplest, most universal model. User pastes their key into settings:

- Anthropic API key (Claude — default recommendation)
- OpenAI API key
- DeepSeek API key (cheap; user already has one in many cases)
- Custom OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, etc. — for local LLM hosts)

Key stored in IndexedDB (Web) or OS Keychain (Tauri version).

### Tier 2: CLI Credential Bridge (exploration — Phase 2+ research)

**The idea (your insight, 2026-05-01)**:

Many developers already have active subscriptions or unused credits in CLI tools:

- **Claude Code CLI** (Anthropic) — credentials at `~/.claude/.credentials.json`
- **Cursor CLI** — its own credential store
- **OpenAI Codex CLI** — uses OpenAI auth
- **GitHub Copilot CLI** — GitHub OAuth

Why this matters: subscribed developers often have **unused token allowances** in their existing CLI subscriptions. If SwirlRead can route AI requests through those credentials, users get AI features for free (in marginal cost terms).

**Feasibility analysis**:

| Platform               | Reading CLI credentials                                               | Verdict                 |
| ---------------------- | --------------------------------------------------------------------- | ----------------------- |
| Web App (FSAPI)        | ❌ Cannot access `~/.claude/` etc. (browser sandbox)                  | Not possible directly   |
| Browser Extension      | ⚠️ Can do native messaging to a host helper, complex                  | Possible but expensive  |
| Local Companion Daemon | ✅ Small local process exposes `localhost:port` API; web app calls it | Works, requires install |
| Tauri Desktop          | ✅ Native filesystem access; trivially read credential files          | Best path               |

**Recommended path**:

- Web MVP: Tier 1 only (user pastes API key)
- Tauri desktop release: Tier 2 — auto-detect Claude Code CLI credentials, offer "Use my Claude Code subscription"
- Web Phase 3+ (optional): a tiny local daemon (`swirlread-bridge`) that exposes credentials over localhost; web app detects it and offers "Connect to local CLI"

**Important clarification**:

- We do NOT want to "steal" user tokens or do anything sketchy
- The flow is explicit: user must opt in, sees what's being shared, can revoke any time
- The bridge daemon is open source and inspectable
- This is just a UX convenience: "you already have credits, why not use them"

### Tier 3: Hosted SwirlRead AI (paid SaaS, future)

For users who don't want to deal with API keys at all:

- Subscription includes baseline AI quota
- Backend proxies to Anthropic with rate limiting
- This is part of the SaaS revenue model (see `open-source-strategy.md`)

---

## Provider Abstraction

```typescript
interface AIProvider {
  ask(prompt: string, context: ContextChunk[]): AsyncIterable<string>
  embed(texts: string[]): Promise<Float32Array[]>
  summarize(text: string): Promise<string>
}

// Implementations:
class AnthropicProvider implements AIProvider { ... }      // Phase 2
class OpenAIProvider implements AIProvider { ... }         // Phase 2
class DeepSeekProvider implements AIProvider { ... }       // Phase 2
class OpenAICompatibleProvider implements AIProvider { ... }  // covers Ollama, LM Studio
class LocalEmbeddingProvider { embed via transformers.js }    // Phase 3
class CLICredentialProvider implements AIProvider { ... }     // Tauri / bridge
```

Adding a new provider is a single file. The UI is provider-agnostic.

---

## Privacy Guarantees

These are non-negotiable and enforced architecturally:

1. **Vault content never auto-uploads.** Every API call is a result of explicit user action.
2. **Embeddings always computed locally.** The user's vector index never leaves the device unless the user opts into cloud sync (Phase 3+ paid feature, with full disclosure).
3. **API keys stored encrypted.** IndexedDB with subtle crypto, or OS keychain in Tauri.
4. **Open source = verifiable.** Anyone can read the code and confirm there's no backdoor telemetry.
5. **No usage analytics by default.** Optional opt-in if we ever want telemetry; off by default.

---

## What We Will NOT Build

To keep the product focused:

- ❌ **An AI chat sidebar** that's permanently visible (that's ChatGPT, not SwirlRead)
- ❌ **AI that auto-edits your files** (the user owns their content)
- ❌ **AI that generates new content** unprompted (we read; we don't write for you)
- ❌ **Provider lock-in** — every AI feature must work across providers
- ❌ **Mandatory cloud features** for AI (must work fully offline once configured)
