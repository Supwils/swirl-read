import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { DocumentPage } from './DocumentPage'
import { FSAPIVaultAdapter } from '@/core/vault'
import { mockRoot } from '@/core/vault/__test-helpers__/mock-fs'
import { useVaultStore, __resetAdaptersForTests } from '@/stores/vault-store'
import { __resetDbForTests } from '@/core/persistence/db'

beforeEach(async () => {
  await __resetDbForTests()
  __resetAdaptersForTests()
  useVaultStore.setState({
    registeredVaults: [],
    activeVaultId: null,
    ready: true,
  })
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: '/app/:vaultId/*', element: <DocumentPage /> }],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

async function registerSampleVault() {
  const root = mockRoot('supwil', {
    'index.md': '# Welcome to my Vault\n\nThis is **bold** text.',
    knowledge: {
      'react.md': `# React

Some notes about React.

## Hooks

- useState
- useEffect
- useMemo

\`\`\`ts
const [count, setCount] = useState(0)
\`\`\`
`,
    },
    'logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    'metadata.json': '{"version": 1}',
  })
  const adapter = FSAPIVaultAdapter.fromHandle(root, {
    id: 'supwil-doc',
    name: 'supwil',
  })
  await useVaultStore.getState().registerVault(adapter)
  return adapter
}

describe('DocumentPage — markdown rendering', () => {
  it('renders a markdown file from the registered vault', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/index.md')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /welcome to my vault/i }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('renders nested markdown with headings, lists, and code blocks', async () => {
    await registerSampleVault()
    const { container } = renderAt('/app/supwil-doc/knowledge/react.md')

    // Wait for an element only the rendered markdown produces — page
    // header alone matches /react/i so we'd race the loading state.
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /hooks/i }),
      ).toBeInTheDocument()
    })
    // List items appear as their own list elements
    const listItems = container.querySelectorAll('ul li')
    const itemTexts = Array.from(listItems).map((li) => li.textContent)
    expect(itemTexts).toContain('useState')
    expect(itemTexts).toContain('useEffect')
    expect(itemTexts).toContain('useMemo')

    // Shiki tokenizes the code into per-token spans; assert against the
    // <pre>'s aggregated textContent rather than searching for a single span.
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain('const [count, setCount] = useState(0)')
  })

  it('shows missing-vault state when vault id is unknown', async () => {
    renderAt('/app/never-registered/some.md')
    expect(
      await screen.findByText(/not registered in the current session/i),
    ).toBeInTheDocument()
  })

  it('shows missing-file state when path resolves but file does not exist', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/does-not-exist.md')

    expect(
      await screen.findByText(/file not found in this vault/i),
    ).toBeInTheDocument()
  })

  it('renders non-markdown text files as a code block (fallback path)', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/metadata.json')

    await waitFor(() => {
      expect(screen.getByText(/"version": 1/)).toBeInTheDocument()
    })
    // Not rendered through markdown pipeline — should appear in a <pre>
    const pre = screen.getByText(/"version": 1/).closest('pre')
    expect(pre).not.toBeNull()
  })

  it('shows the vault id and file path in the page header', async () => {
    await registerSampleVault()
    renderAt('/app/supwil-doc/knowledge/react.md')

    await waitFor(() => {
      expect(screen.getByText('supwil-doc')).toBeInTheDocument()
    })
    expect(screen.getByText('knowledge/react.md')).toBeInTheDocument()
  })
})
