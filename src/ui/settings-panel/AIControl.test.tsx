import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { __resetDbForTests, db } from '@/core/persistence/db'
import {
  getAIKey,
  getActiveProvider,
  hasAIKey,
  setAIKey,
} from '@/core/ai/key-store'
import { AIControl } from './AIControl'

beforeEach(async () => {
  await __resetDbForTests()
})

afterEach(async () => {
  await __resetDbForTests()
})

describe('AIControl', () => {
  it('renders the Anthropic form by default and an empty key field', async () => {
    render(<AIControl />)
    expect(
      await screen.findByRole('button', { name: 'Anthropic' }),
    ).toHaveAttribute('aria-pressed', 'true')
    const keyInput = screen.getByLabelText(/API key/i)
    expect((keyInput as HTMLInputElement).value).toBe('')
    expect(keyInput.getAttribute('type')).toBe('password')
  })

  it('saves an Anthropic key, clears the input, and shows the Saved badge', async () => {
    const user = userEvent.setup()
    render(<AIControl />)

    const keyInput = await screen.findByLabelText(/API key/i)
    await user.type(keyInput, 'sk-ant-test')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      expect(await hasAIKey('anthropic')).toBe(true)
    })
    // Plaintext should not stay in the form input.
    expect((keyInput as HTMLInputElement).value).toBe('')
    expect(screen.getByLabelText('Saved')).toBeInTheDocument()
  })

  it('hydrates the Saved badge for a previously-stored Anthropic key on mount', async () => {
    await setAIKey('anthropic', 'sk-ant-prev')

    render(<AIControl />)

    expect(await screen.findByLabelText('Saved')).toBeInTheDocument()
  })

  it('switches to the OpenAI-compatible form and reveals base URL + model fields', async () => {
    const user = userEvent.setup()
    render(<AIControl />)

    await user.click(screen.getByRole('button', { name: 'OpenAI-compatible' }))

    expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Model/i)).toBeInTheDocument()
  })

  it('hydrates OpenAI-compatible meta (baseURL + model) but never the plaintext key', async () => {
    await setAIKey('openai-compat', 'sk-secret', {
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    })

    const user = userEvent.setup()
    render(<AIControl />)
    await user.click(screen.getByRole('button', { name: 'OpenAI-compatible' }))

    const baseURL = await screen.findByLabelText(/Base URL/i)
    const model = screen.getByLabelText(/^Model/i)
    const key = screen.getAllByLabelText(/API key/i)[0]

    await waitFor(() => {
      expect((baseURL as HTMLInputElement).value).toBe(
        'https://api.deepseek.com/v1',
      )
    })
    expect((model as HTMLInputElement).value).toBe('deepseek-chat')
    expect((key as HTMLInputElement).value).toBe('')
  })

  it('saves a Xiaomi MiMo key without requiring base URL or model', async () => {
    const user = userEvent.setup()
    render(<AIControl />)

    await user.click(screen.getByRole('button', { name: 'Xiaomi MiMo' }))

    const keyInput = await screen.findByLabelText(/^API key/i)
    await user.type(keyInput, 'tp-xiaomi-test')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      expect(await hasAIKey('xiaomi')).toBe(true)
    })
    const stored = await getAIKey('xiaomi')
    expect(stored?.apiKey).toBe('tp-xiaomi-test')
    // Defaults are not persisted unless the user overrode them — keeping
    // saved meta empty lets us evolve the defaults later.
    expect(stored?.meta.baseURL).toBeUndefined()
    expect(stored?.meta.model).toBeUndefined()
    expect((keyInput as HTMLInputElement).value).toBe('')
  })

  it('persists Xiaomi base URL + model overrides when the user provides them', async () => {
    const user = userEvent.setup()
    render(<AIControl />)

    await user.click(screen.getByRole('button', { name: 'Xiaomi MiMo' }))

    await user.type(
      await screen.findByLabelText(/^API key/i),
      'tp-xiaomi-override',
    )
    await user.type(
      screen.getByLabelText(/Base URL/i),
      'https://example.test/v1',
    )
    await user.type(screen.getByLabelText(/^Model/i), 'mimo-thinking')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      const stored = await getAIKey('xiaomi')
      expect(stored?.meta.baseURL).toBe('https://example.test/v1')
      expect(stored?.meta.model).toBe('mimo-thinking')
    })
  })

  it('shows the default-provider picker only when 2+ providers are configured', async () => {
    await setAIKey('anthropic', 'sk-ant-prev')
    render(<AIControl />)

    // One configured → no default picker (the only one is implicitly default).
    await screen.findByLabelText('Saved')
    expect(screen.queryByText(/Default for ⌘K/i)).not.toBeInTheDocument()
  })

  it('lets the user pick Xiaomi as the default provider for ⌘K', async () => {
    await setAIKey('anthropic', 'sk-ant-prev')
    await setAIKey('xiaomi', 'tp-xiaomi-prev')

    const user = userEvent.setup()
    render(<AIControl />)

    // The picker only appears once both saved badges have hydrated.
    const picker = await screen.findByText(/Default for ⌘K/i, undefined, {
      timeout: 2000,
    })
    expect(picker).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Xiaomi MiMo/i }))

    await waitFor(async () => {
      expect(await getActiveProvider()).toBe('xiaomi')
    })
  })

  it('clearing the picked default falls back to "Auto"', async () => {
    await setAIKey('anthropic', 'sk-ant-prev')
    await setAIKey('xiaomi', 'tp-xiaomi-prev')

    const user = userEvent.setup()
    render(<AIControl />)

    // Hydrate the picker first.
    await screen.findByText(/Default for ⌘K/i, undefined, { timeout: 2000 })

    await user.click(screen.getByRole('radio', { name: /Xiaomi MiMo/i }))
    await waitFor(async () => {
      expect(await getActiveProvider()).toBe('xiaomi')
    })

    await user.click(screen.getByRole('radio', { name: /^Auto/i }))
    await waitFor(async () => {
      expect(await getActiveProvider()).toBeNull()
    })
  })

  it('clears a saved key and removes the Saved badge', async () => {
    await setAIKey('anthropic', 'sk-ant-prev')

    const user = userEvent.setup()
    render(<AIControl />)

    expect(await screen.findByLabelText('Saved')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear key' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Saved')).not.toBeInTheDocument()
    })
    expect(await db.aiKeys.count()).toBe(0)
  })
})
