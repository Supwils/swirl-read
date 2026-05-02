import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CsvRenderer } from './CsvRenderer'

describe('CsvRenderer (M7.3)', () => {
  it('renders the first row as table header and remaining rows as body', () => {
    render(
      <CsvRenderer delimiter="," source={'name,age\nAlice,30\nBob,25\n'} />,
    )

    expect(
      screen.getAllByRole('columnheader').map((c) => c.textContent),
    ).toEqual(['name', 'age'])
    const bodyCells = screen.getAllByRole('cell').map((c) => c.textContent)
    expect(bodyCells).toEqual(['Alice', '30', 'Bob', '25'])
  })

  it('preserves CJK content in cells', () => {
    render(<CsvRenderer delimiter="," source={'姓名,年龄\n张三,28\n'} />)
    expect(screen.getByText('张三')).toBeInTheDocument()
    expect(screen.getByText('28')).toBeInTheDocument()
  })

  it('supports tab-separated values', () => {
    render(<CsvRenderer delimiter={'\t'} source={'a\tb\nc\td'} />)
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getByText('c')).toBeInTheDocument()
    expect(screen.getByText('d')).toBeInTheDocument()
  })

  it('caps visible body rows and offers a "Show all" button', async () => {
    const lines = ['col']
    for (let i = 1; i <= 1500; i++) lines.push(`row${i}`)
    render(<CsvRenderer delimiter="," source={lines.join('\n')} />)

    // Header + 1000 visible body rows. The 1500th row is hidden.
    expect(screen.queryByText('row1500')).toBeNull()
    expect(screen.getByText('row1')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /show all/i }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /show all/i }))
    expect(screen.getByText('row1500')).toBeInTheDocument()
  })

  it('shows a calm empty state for an empty file', () => {
    render(<CsvRenderer delimiter="," source="" />)
    expect(screen.getByText(/this file looks empty/i)).toBeInTheDocument()
  })
})
