/**
 * AIControl — Phase 3 settings UI for configuring AI providers.
 *
 * Three providers are supported in v0.2:
 *   - Anthropic (Claude) — recommended default; just needs an API key.
 *   - Xiaomi MiMo — first-class adapter with the Xiaomi base URL +
 *     model preset; user only has to paste the `tp-...` key.
 *   - OpenAI-compatible — covers OpenAI, DeepSeek, Together, Ollama,
 *     LM Studio, etc. Needs a base URL and a model id; key is optional
 *     (local backends like Ollama don't authenticate).
 *
 * Multiple providers can be configured side by side. When more than one
 * is saved, a "Default for ⌘K" picker lets the user choose which one
 * the palette `?` mode should use; otherwise the palette falls back to a
 * deterministic chain.
 *
 * Keys are written through `core/ai/key-store` (AES-GCM encrypted at
 * rest). The form discards the plaintext key from local React state
 * after a successful save so a quick devtools snoop on the React tree
 * can't recover it.
 *
 * "Test connection" sends a tiny `ask('Hello?', [])` and consumes only
 * the first chunk to verify auth + reachability without spending real
 * tokens. Errors surface with their `AIError.kind` so the user can
 * tell "wrong key" from "server unreachable".
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { createAnthropicProvider } from '@/core/ai/anthropic-provider'
import { createOpenAICompatibleProvider } from '@/core/ai/openai-compatible-provider'
import {
  XIAOMI_DEFAULT_BASE_URL,
  XIAOMI_DEFAULT_MODEL,
  createXiaomiProvider,
} from '@/core/ai/xiaomi-provider'
import {
  clearAIKey,
  getAIKey,
  getActiveProvider,
  hasAIKey,
  setAIKey,
  setActiveProvider,
} from '@/core/ai/key-store'
import { AIError, type AIProvider, type AIProviderId } from '@/core/ai/types'

type TestStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string }

interface ProviderFormState {
  apiKey: string
  baseURL: string
  model: string
  saved: boolean
  test: TestStatus
}

const EMPTY_FORM: ProviderFormState = {
  apiKey: '',
  baseURL: '',
  model: '',
  saved: false,
  test: { kind: 'idle' },
}

const PROVIDER_LABELS: Record<AIProviderId, string> = {
  anthropic: 'Anthropic',
  xiaomi: 'Xiaomi MiMo',
  'openai-compat': 'OpenAI-compatible',
}

export function AIControl(): ReactNode {
  const [activeTab, setActiveTab] = useState<AIProviderId>('anthropic')
  const [anthropic, setAnthropic] = useState<ProviderFormState>(EMPTY_FORM)
  const [xiaomi, setXiaomi] = useState<ProviderFormState>(EMPTY_FORM)
  const [openai, setOpenai] = useState<ProviderFormState>(EMPTY_FORM)
  const [defaultProvider, setDefaultProvider] = useState<AIProviderId | null>(
    null,
  )

  // Hydrate "saved" badges + meta defaults + default-provider selection
  // from the encrypted store. Plaintext keys are intentionally NOT
  // loaded into the form input — a saved key never round-trips through
  // the React tree again.
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      hasAIKey('anthropic'),
      getAIKey('xiaomi'),
      getAIKey('openai-compat'),
      getActiveProvider(),
    ]).then(([anthropicSaved, xiaomiStored, openaiStored, active]) => {
      if (cancelled) return
      setAnthropic((prev) => ({ ...prev, saved: anthropicSaved }))
      if (xiaomiStored) {
        setXiaomi((prev) => ({
          ...prev,
          saved: true,
          baseURL: xiaomiStored.meta.baseURL ?? '',
          model: xiaomiStored.meta.model ?? '',
        }))
      }
      if (openaiStored) {
        setOpenai((prev) => ({
          ...prev,
          saved: true,
          baseURL: openaiStored.meta.baseURL ?? '',
          model: openaiStored.meta.model ?? '',
        }))
      }
      setDefaultProvider(active)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const configured = useMemo<AIProviderId[]>(() => {
    const list: AIProviderId[] = []
    if (anthropic.saved) list.push('anthropic')
    if (xiaomi.saved) list.push('xiaomi')
    if (openai.saved) list.push('openai-compat')
    return list
  }, [anthropic.saved, xiaomi.saved, openai.saved])

  const handlePickDefault = useCallback(
    async (id: AIProviderId | null): Promise<void> => {
      setDefaultProvider(id)
      await setActiveProvider(id)
    },
    [],
  )

  return (
    <fieldset className="swirlread-settings__field">
      <legend className="swirlread-settings__label">AI assistant</legend>
      <p className="swirlread-settings__hint">
        Optional. Configure one or more providers to enable the <kbd>?</kbd>{' '}
        mode in the command palette. Keys are encrypted in your browser; vault
        content is never sent until you ask a question.
      </p>

      <fieldset className="swirlread-settings__field">
        <legend className="swirlread-settings__label">Provider</legend>
        <div className="swirlread-settings__segmented">
          {(
            ['anthropic', 'xiaomi', 'openai-compat'] satisfies AIProviderId[]
          ).map((id) => (
            <button
              key={id}
              type="button"
              className="swirlread-settings__segment"
              aria-pressed={activeTab === id}
              onClick={() => {
                setActiveTab(id)
              }}
            >
              {PROVIDER_LABELS[id]}
            </button>
          ))}
        </div>
      </fieldset>

      {activeTab === 'anthropic' && (
        <AnthropicForm state={anthropic} setState={setAnthropic} />
      )}
      {activeTab === 'xiaomi' && (
        <XiaomiForm state={xiaomi} setState={setXiaomi} />
      )}
      {activeTab === 'openai-compat' && (
        <OpenAICompatibleForm state={openai} setState={setOpenai} />
      )}

      {configured.length >= 2 && (
        <DefaultProviderPicker
          configured={configured}
          selected={defaultProvider}
          onSelect={(id) => void handlePickDefault(id)}
        />
      )}
    </fieldset>
  )
}

/* ─── Anthropic form ───────────────────────────────────────────────── */

function AnthropicForm({
  state,
  setState,
}: {
  state: ProviderFormState
  setState: React.Dispatch<React.SetStateAction<ProviderFormState>>
}): ReactNode {
  const handleSave = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!state.apiKey) return
      await setAIKey('anthropic', state.apiKey)
      setState({
        apiKey: '',
        baseURL: '',
        model: '',
        saved: true,
        test: { kind: 'idle' },
      })
    },
    [state.apiKey, setState],
  )

  const handleClear = useCallback(async () => {
    await clearAIKey('anthropic')
    setState(EMPTY_FORM)
  }, [setState])

  const handleTest = useCallback(async () => {
    setState((prev) => ({ ...prev, test: { kind: 'running' } }))
    try {
      const stored = await getAIKey('anthropic')
      const apiKey = state.apiKey || stored?.apiKey
      if (!apiKey) {
        setState((prev) => ({
          ...prev,
          test: { kind: 'error', message: 'No API key configured' },
        }))
        return
      }
      const provider = createAnthropicProvider({ apiKey })
      await pingProvider(provider)
      setState((prev) => ({ ...prev, test: { kind: 'ok' } }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        test: { kind: 'error', message: errorMessage(err) },
      }))
    }
  }, [state.apiKey, setState])

  return (
    <form
      onSubmit={(e) => void handleSave(e)}
      className="swirlread-settings__field"
    >
      <label className="swirlread-settings__label" htmlFor="ai-anthropic-key">
        API key
        {state.saved && <SavedBadge />}
      </label>
      <input
        id="ai-anthropic-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={
          state.saved ? '••••••••  (leave blank to keep current)' : 'sk-ant-...'
        }
        value={state.apiKey}
        onChange={(event) => {
          setState((prev) => ({
            ...prev,
            apiKey: event.target.value,
            test: { kind: 'idle' },
          }))
        }}
        className="swirlread-settings__input"
      />
      <FormActions
        onTest={() => void handleTest()}
        onClear={state.saved ? () => void handleClear() : undefined}
        canSave={state.apiKey.length > 0}
        test={state.test}
      />
    </form>
  )
}

/* ─── Xiaomi MiMo form ─────────────────────────────────────────────── */

function XiaomiForm({
  state,
  setState,
}: {
  state: ProviderFormState
  setState: React.Dispatch<React.SetStateAction<ProviderFormState>>
}): ReactNode {
  const handleSave = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!state.apiKey && !state.saved) return
      // Persist baseURL / model only when the user explicitly overrode
      // the defaults. Empty meta keeps {@link createXiaomiProvider}'s
      // built-in fallbacks authoritative — and lets us upgrade those
      // defaults later without rewriting saved rows.
      const meta: { baseURL?: string; model?: string } = {}
      if (state.baseURL) meta.baseURL = state.baseURL
      if (state.model) meta.model = state.model
      // Re-saving with a blank key keeps the prior key when state.saved
      // is true. setAIKey('', ...) would wipe the secret, so we route
      // through getAIKey to preserve it.
      const apiKey =
        state.apiKey.length > 0
          ? state.apiKey
          : ((await getAIKey('xiaomi'))?.apiKey ?? '')
      await setAIKey('xiaomi', apiKey, meta)
      setState((prev) => ({
        ...prev,
        apiKey: '',
        saved: true,
        test: { kind: 'idle' },
      }))
    },
    [state.apiKey, state.baseURL, state.model, state.saved, setState],
  )

  const handleClear = useCallback(async () => {
    await clearAIKey('xiaomi')
    setState(EMPTY_FORM)
  }, [setState])

  const handleTest = useCallback(async () => {
    setState((prev) => ({ ...prev, test: { kind: 'running' } }))
    try {
      const stored = await getAIKey('xiaomi')
      const apiKey = state.apiKey || stored?.apiKey
      if (!apiKey) {
        setState((prev) => ({
          ...prev,
          test: { kind: 'error', message: 'No API key configured' },
        }))
        return
      }
      const provider = createXiaomiProvider({
        apiKey,
        ...(state.baseURL && { baseURL: state.baseURL }),
        ...(state.model && { model: state.model }),
      })
      await pingProvider(provider)
      setState((prev) => ({ ...prev, test: { kind: 'ok' } }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        test: { kind: 'error', message: errorMessage(err) },
      }))
    }
  }, [state.apiKey, state.baseURL, state.model, setState])

  return (
    <form
      onSubmit={(e) => void handleSave(e)}
      className="swirlread-settings__field"
    >
      <label className="swirlread-settings__label" htmlFor="ai-xiaomi-key">
        API key
        {state.saved && <SavedBadge />}
      </label>
      <input
        id="ai-xiaomi-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={
          state.saved ? '••••••••  (leave blank to keep current)' : 'tp-...'
        }
        value={state.apiKey}
        onChange={(event) => {
          setState((prev) => ({
            ...prev,
            apiKey: event.target.value,
            test: { kind: 'idle' },
          }))
        }}
        className="swirlread-settings__input"
      />

      <label className="swirlread-settings__label" htmlFor="ai-xiaomi-base">
        Base URL{' '}
        <span className="swirlread-settings__hint">
          (optional — defaults to the Xiaomi token-plan endpoint)
        </span>
      </label>
      <input
        id="ai-xiaomi-base"
        type="url"
        autoComplete="off"
        spellCheck={false}
        placeholder={XIAOMI_DEFAULT_BASE_URL}
        value={state.baseURL}
        onChange={(event) => {
          setState((prev) => ({
            ...prev,
            baseURL: event.target.value,
            test: { kind: 'idle' },
          }))
        }}
        className="swirlread-settings__input"
      />

      <label className="swirlread-settings__label" htmlFor="ai-xiaomi-model">
        Model{' '}
        <span className="swirlread-settings__hint">
          (optional — defaults to {XIAOMI_DEFAULT_MODEL})
        </span>
      </label>
      <input
        id="ai-xiaomi-model"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={XIAOMI_DEFAULT_MODEL}
        value={state.model}
        onChange={(event) => {
          setState((prev) => ({
            ...prev,
            model: event.target.value,
            test: { kind: 'idle' },
          }))
        }}
        className="swirlread-settings__input"
      />
      <FormActions
        onTest={() => void handleTest()}
        onClear={state.saved ? () => void handleClear() : undefined}
        canSave={state.apiKey.length > 0 || state.saved}
        test={state.test}
      />
    </form>
  )
}

/* ─── OpenAI-compatible form ───────────────────────────────────────── */

function OpenAICompatibleForm({
  state,
  setState,
}: {
  state: ProviderFormState
  setState: React.Dispatch<React.SetStateAction<ProviderFormState>>
}): ReactNode {
  const handleSave = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!state.baseURL || !state.model) return
      await setAIKey('openai-compat', state.apiKey, {
        baseURL: state.baseURL,
        model: state.model,
      })
      setState((prev) => ({
        ...prev,
        apiKey: '',
        saved: true,
        test: { kind: 'idle' },
      }))
    },
    [state.apiKey, state.baseURL, state.model, setState],
  )

  const handleClear = useCallback(async () => {
    await clearAIKey('openai-compat')
    setState(EMPTY_FORM)
  }, [setState])

  const handleTest = useCallback(async () => {
    setState((prev) => ({ ...prev, test: { kind: 'running' } }))
    try {
      const stored = await getAIKey('openai-compat')
      const apiKey = state.apiKey || (stored?.apiKey ?? '')
      const baseURL = state.baseURL || stored?.meta.baseURL
      const model = state.model || stored?.meta.model
      if (!baseURL || !model) {
        setState((prev) => ({
          ...prev,
          test: {
            kind: 'error',
            message: 'Base URL and model are required',
          },
        }))
        return
      }
      const provider = createOpenAICompatibleProvider({
        apiKey,
        baseURL,
        model,
      })
      await pingProvider(provider)
      setState((prev) => ({ ...prev, test: { kind: 'ok' } }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        test: { kind: 'error', message: errorMessage(err) },
      }))
    }
  }, [state.apiKey, state.baseURL, state.model, setState])

  return (
    <form
      onSubmit={(e) => void handleSave(e)}
      className="swirlread-settings__field"
    >
      <label className="swirlread-settings__label" htmlFor="ai-openai-base">
        Base URL
        {state.saved && <SavedBadge />}
      </label>
      <input
        id="ai-openai-base"
        type="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="https://api.openai.com/v1"
        value={state.baseURL}
        onChange={(event) => {
          setState((prev) => ({
            ...prev,
            baseURL: event.target.value,
            test: { kind: 'idle' },
          }))
        }}
        className="swirlread-settings__input"
      />

      <label className="swirlread-settings__label" htmlFor="ai-openai-model">
        Model
      </label>
      <input
        id="ai-openai-model"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="gpt-4o-mini, deepseek-chat, llama3, ..."
        value={state.model}
        onChange={(event) => {
          setState((prev) => ({
            ...prev,
            model: event.target.value,
            test: { kind: 'idle' },
          }))
        }}
        className="swirlread-settings__input"
      />

      <label className="swirlread-settings__label" htmlFor="ai-openai-key">
        API key{' '}
        <span className="swirlread-settings__hint">
          (leave blank for local Ollama / LM Studio)
        </span>
      </label>
      <input
        id="ai-openai-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={
          state.saved ? '••••••••  (leave blank to keep current)' : 'sk-...'
        }
        value={state.apiKey}
        onChange={(event) => {
          setState((prev) => ({
            ...prev,
            apiKey: event.target.value,
            test: { kind: 'idle' },
          }))
        }}
        className="swirlread-settings__input"
      />
      <FormActions
        onTest={() => void handleTest()}
        onClear={state.saved ? () => void handleClear() : undefined}
        canSave={state.baseURL.length > 0 && state.model.length > 0}
        test={state.test}
      />
    </form>
  )
}

/* ─── Default-provider picker ──────────────────────────────────────── */

function DefaultProviderPicker({
  configured,
  selected,
  onSelect,
}: {
  configured: AIProviderId[]
  selected: AIProviderId | null
  onSelect: (id: AIProviderId | null) => void
}): ReactNode {
  // The fallback chain (Anthropic > Xiaomi > OpenAI-compat) is what
  // applies when the user hasn't picked a default; the "Auto" option
  // makes that fallback explicit in the UI so the radio always has a
  // selected value.
  const effective = selected ?? null
  return (
    <fieldset className="swirlread-settings__field">
      <legend className="swirlread-settings__label">Default for ⌘K</legend>
      <p className="swirlread-settings__hint">
        Pick which configured provider answers when you press <kbd>?</kbd> in
        the command palette.
      </p>
      <div className="swirlread-settings__radio-group">
        <label className="swirlread-settings__radio">
          <input
            type="radio"
            name="ai-default-provider"
            value=""
            checked={effective === null}
            onChange={() => {
              onSelect(null)
            }}
          />
          <span>Auto (Anthropic → Xiaomi → OpenAI-compatible)</span>
        </label>
        {configured.map((id) => (
          <label key={id} className="swirlread-settings__radio">
            <input
              type="radio"
              name="ai-default-provider"
              value={id}
              checked={effective === id}
              onChange={() => {
                onSelect(id)
              }}
            />
            <span>{PROVIDER_LABELS[id]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/* ─── Shared bits ──────────────────────────────────────────────────── */

function FormActions({
  onTest,
  onClear,
  canSave,
  test,
}: {
  onTest: () => void
  onClear: (() => void) | undefined
  canSave: boolean
  test: TestStatus
}): ReactNode {
  return (
    <div className="swirlread-settings__ai-actions">
      <button
        type="submit"
        className="swirlread-settings__ai-btn"
        disabled={!canSave}
      >
        Save
      </button>
      <button
        type="button"
        className="swirlread-settings__ai-btn"
        onClick={onTest}
        disabled={test.kind === 'running'}
      >
        {test.kind === 'running' ? (
          <>
            <Loader2 size={12} aria-hidden="true" className="is-spinning" />
            Testing…
          </>
        ) : (
          'Test connection'
        )}
      </button>
      {onClear && (
        <button
          type="button"
          className="swirlread-settings__ai-btn"
          onClick={onClear}
        >
          Clear key
        </button>
      )}
      <TestStatusBadge status={test} />
    </div>
  )
}

function TestStatusBadge({ status }: { status: TestStatus }): ReactNode {
  if (status.kind === 'idle' || status.kind === 'running') return null
  if (status.kind === 'ok') {
    return (
      <span className="swirlread-settings__ai-status swirlread-settings__ai-status--ok">
        <CheckCircle2 size={14} aria-hidden="true" />
        Connected
      </span>
    )
  }
  return (
    <span
      className="swirlread-settings__ai-status swirlread-settings__ai-status--err"
      title={status.message}
    >
      <XCircle size={14} aria-hidden="true" />
      {status.message}
    </span>
  )
}

function SavedBadge(): ReactNode {
  return (
    <span className="swirlread-settings__ai-saved" aria-label="Saved">
      Saved
    </span>
  )
}

/**
 * Send the smallest possible request and read the first chunk only.
 * Verifies auth + reachability without burning real tokens or waiting
 * for a long response.
 */
async function pingProvider(provider: AIProvider): Promise<void> {
  const controller = new AbortController()
  const iter = provider.ask('Reply with just the word ok.', [], {
    signal: controller.signal,
  })
  try {
    for await (const chunk of iter) {
      if (chunk.length > 0) {
        controller.abort()
        return
      }
    }
  } catch (err) {
    // The abort itself surfaces as an AIError(aborted); that's fine —
    // we only got here because we received a chunk first.
    if (err instanceof AIError && err.kind === 'aborted') return
    throw err
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof AIError) {
    switch (err.kind) {
      case 'auth':
        return 'Invalid API key'
      case 'rate-limited':
        return 'Rate limited — try again'
      case 'network':
        return 'Network / endpoint unreachable'
      case 'malformed-response':
        return 'Unexpected response shape'
      default:
        return err.message
    }
  }
  // Non-AIError throwables (e.g. a TypeError) can carry the base URL or other
  // config in their message — don't surface it verbatim in the UI.
  return 'Something went wrong. Check your settings and try again.'
}
