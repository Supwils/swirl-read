import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { __resetDbForTests, db } from '@/core/persistence/db'
import { useHintsStore } from '@/stores/hints-store'
import { HintToast } from './HintToast'

beforeEach(async () => {
  await __resetDbForTests()
  useHintsStore.setState({ seen: new Set<string>(), ready: true })
})

describe('HintToast (M9.4)', () => {
  it('renders for unseen hints once the store is ready', () => {
    render(
      <HintToast id="onboarding" title="Welcome">
        Content
      </HintToast>,
    )
    expect(screen.getByTestId('hint-toast')).toBeInTheDocument()
    expect(screen.getByText('Welcome')).toBeInTheDocument()
  })

  it('does not render for hints the user has already seen', () => {
    useHintsStore.setState({
      seen: new Set(['onboarding']),
      ready: true,
    })
    render(
      <HintToast id="onboarding" title="Welcome">
        Content
      </HintToast>,
    )
    expect(screen.queryByTestId('hint-toast')).toBeNull()
  })

  it('does not render before the store is ready', () => {
    useHintsStore.setState({ seen: new Set<string>(), ready: false })
    render(
      <HintToast id="onboarding" title="Welcome">
        Content
      </HintToast>,
    )
    expect(screen.queryByTestId('hint-toast')).toBeNull()
  })

  it('marks seen + dismisses on close click', async () => {
    render(
      <HintToast id="onboarding" title="Welcome">
        Content
      </HintToast>,
    )
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByTestId('hint-toast')).toBeNull()
    // Dexie row written so a refresh won't bring it back.
    const rows = await db.hintsSeen.toArray()
    expect(rows.map((r) => r.id)).toContain('onboarding')
  })

  it('auto-dismisses on the 12 s timer', () => {
    vi.useFakeTimers()
    try {
      render(
        <HintToast id="onboarding" title="Welcome">
          Content
        </HintToast>,
      )
      expect(screen.getByTestId('hint-toast')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(12_001)
      })
      expect(screen.queryByTestId('hint-toast')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
