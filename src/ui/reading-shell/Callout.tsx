import type { ReactNode } from 'react'
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  HelpCircle,
  Info,
  Lightbulb,
  ListOrdered,
  Quote,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react'

interface CalloutDefinition {
  Icon: LucideIcon
  defaultTitle: string
  cssClass: string
}

/**
 * Mapping of every Obsidian callout type to its visual identity.
 *
 * Aliases (`tldr` → `summary`, `cite` → `quote`, etc.) are normalized to
 * their canonical form via {@link CALLOUT_ALIASES}. Unknown types fall
 * back to `note` so unfamiliar markup never breaks rendering.
 */
const CALLOUT_DEFINITIONS: Record<string, CalloutDefinition> = {
  note: { Icon: Info, defaultTitle: 'Note', cssClass: 'callout--note' },
  info: { Icon: Info, defaultTitle: 'Info', cssClass: 'callout--info' },
  tip: { Icon: Lightbulb, defaultTitle: 'Tip', cssClass: 'callout--tip' },
  hint: { Icon: Lightbulb, defaultTitle: 'Hint', cssClass: 'callout--tip' },
  important: {
    Icon: Zap,
    defaultTitle: 'Important',
    cssClass: 'callout--important',
  },
  success: {
    Icon: CheckCircle2,
    defaultTitle: 'Success',
    cssClass: 'callout--success',
  },
  done: {
    Icon: CheckCircle2,
    defaultTitle: 'Done',
    cssClass: 'callout--success',
  },
  question: {
    Icon: HelpCircle,
    defaultTitle: 'Question',
    cssClass: 'callout--question',
  },
  faq: {
    Icon: HelpCircle,
    defaultTitle: 'FAQ',
    cssClass: 'callout--question',
  },
  warning: {
    Icon: AlertTriangle,
    defaultTitle: 'Warning',
    cssClass: 'callout--warning',
  },
  caution: {
    Icon: AlertTriangle,
    defaultTitle: 'Caution',
    cssClass: 'callout--warning',
  },
  attention: {
    Icon: AlertTriangle,
    defaultTitle: 'Attention',
    cssClass: 'callout--warning',
  },
  failure: {
    Icon: XCircle,
    defaultTitle: 'Failure',
    cssClass: 'callout--failure',
  },
  fail: {
    Icon: XCircle,
    defaultTitle: 'Fail',
    cssClass: 'callout--failure',
  },
  missing: {
    Icon: XCircle,
    defaultTitle: 'Missing',
    cssClass: 'callout--failure',
  },
  danger: {
    Icon: Zap,
    defaultTitle: 'Danger',
    cssClass: 'callout--danger',
  },
  error: {
    Icon: Zap,
    defaultTitle: 'Error',
    cssClass: 'callout--danger',
  },
  bug: { Icon: Bug, defaultTitle: 'Bug', cssClass: 'callout--bug' },
  example: {
    Icon: ListOrdered,
    defaultTitle: 'Example',
    cssClass: 'callout--example',
  },
  quote: { Icon: Quote, defaultTitle: 'Quote', cssClass: 'callout--quote' },
  cite: { Icon: Quote, defaultTitle: 'Cite', cssClass: 'callout--quote' },
  abstract: {
    Icon: ClipboardList,
    defaultTitle: 'Abstract',
    cssClass: 'callout--abstract',
  },
  summary: {
    Icon: ClipboardList,
    defaultTitle: 'Summary',
    cssClass: 'callout--abstract',
  },
  tldr: {
    Icon: ClipboardList,
    defaultTitle: 'TL;DR',
    cssClass: 'callout--abstract',
  },
  todo: {
    Icon: CheckSquare,
    defaultTitle: 'Todo',
    cssClass: 'callout--todo',
  },
}

const FALLBACK_DEFINITION: CalloutDefinition = {
  Icon: Info,
  defaultTitle: 'Note',
  cssClass: 'callout--note',
}

interface CalloutProps {
  'data-callout-type'?: string
  'data-callout-title'?: string
  children?: ReactNode
}

export function Callout(props: CalloutProps): ReactNode {
  const rawType = (props['data-callout-type'] ?? 'note').toLowerCase()
  const def = CALLOUT_DEFINITIONS[rawType] ?? FALLBACK_DEFINITION
  const title = props['data-callout-title'] ?? def.defaultTitle
  const Icon = def.Icon

  return (
    <aside
      className={`swilread-callout ${def.cssClass}`}
      data-callout-type={rawType}
    >
      <header className="swilread-callout__header">
        <Icon className="swilread-callout__icon" size={16} aria-hidden="true" />
        <span className="swilread-callout__title">{title}</span>
      </header>
      <div className="swilread-callout__body">{props.children}</div>
    </aside>
  )
}
