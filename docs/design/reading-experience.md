# SwilRead — Reading Experience Design

> Status: Decided 2026-05-01 · Living document

This document captures the visual and interaction design of the core reading experience. It is the product's identity.

---

## Design Philosophy

> **Dive in and emerge in the field of knowledge.**

SwilRead is to Markdown vaults what Kindle is to ebooks: a tool that disappears so the content can take center stage. Every UI decision must serve immersion. Anything that pulls the reader's attention away from the text is a defect.

This is the opposite of an editor-first app. An editor surrounds the content with tools. SwilRead surrounds the content with whitespace. If editing exists, it must be subordinate to reading and short-lived.

---

## Layout: Immersive Single-Column

```
┌─────────────────────────────────────────────────────────────┐
│ ▏░░░░░░░░░░░░░░░░░░░░ progress bar (top, 2px) ░░░░░░░░░░░░░ │
│                                                             │
│                                                             │
│                                                             │
│              ┌─────────────────────────────┐                │
│              │                             │                │
│              │   Centered content column   │                │
│              │   ~720px max width          │                │
│              │                             │                │
│              │   Beautiful typography      │                │
│              │   65–72 chars per line      │                │
│              │   1.7x line height          │                │
│              │                             │                │
│              └─────────────────────────────┘                │
│                                                             │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
   ↑ left edge hover  → file tree slides in (auto-hides)
                       right edge hover → TOC slides in
                       top hover        → toolbar slides down
                       ⌘K               → command palette
                       F                → zen mode (full immersion)
                       ⌘B               → toggle file tree pin
```

### Why single-column

- Reading research consistently shows 50–75 characters per line is optimal for comprehension
- Multi-column layouts force the eye to track UI chrome instead of content
- Single column scales gracefully from desktop to tablet to phone (no responsive nightmares)

### Why hover-summoned UI

- Default state shows ONLY content — the user enters "reading flow"
- UI is one mouse movement away when needed, zero cognitive cost when not
- Auto-hide after 2s of inactivity returns to immersive state

### Three depth levels

1. **Default reading** — content + thin top progress bar + minimal corner indicators
2. **Working** — hover summons sidebar / TOC / toolbar (auto-hide)
3. **Zen mode (F key)** — absolutely nothing visible except text. Even progress bar hides.

---

## Typography System

### Font Stack

**Default body (serif, optimized for long-form reading)**:

```css
font-family:
  'Source Serif 4',
  /* Latin */ 'Source Han Serif SC',
  /* Simplified Chinese */ 'Source Han Serif TC',
  /* Traditional Chinese */ Georgia,
  'Songti SC',
  serif;
```

**Alternative body (sans-serif)**:

```css
font-family:
  'Inter',
  'PingFang SC',
  'Helvetica Neue',
  -apple-system,
  sans-serif;
```

**Code blocks (monospace)**:

```css
font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
```

**Headings**: same as body but bolder. Don't introduce a third font family — it adds cognitive load.

### Why Source Serif + Source Han Serif

- Free (open source from Adobe/Google)
- Designed to pair: same x-height, same metrics, same visual weight
- Excellent for mixed Chinese/English text (Wilson's vault is bilingual)
- Renders beautifully at all sizes
- Self-hostable, no Google Fonts dependency

### Reading-tuned defaults

| Property          | Value                            | Why                                            |
| ----------------- | -------------------------------- | ---------------------------------------------- |
| Body font size    | 18px                             | Comfortable for sustained reading              |
| Line height       | 1.7                              | Generous breathing room                        |
| Max content width | 720px (~70 chars)                | Optimal reading line length                    |
| Paragraph spacing | 1.4em                            | Clear paragraph separation without losing flow |
| H1 size           | 2.4em                            | Strong but not aggressive                      |
| H2 size           | 1.8em                            | Clear hierarchy                                |
| H3 size           | 1.4em                            | Distinct from body                             |
| Code block bg     | Subtle tint of theme             | Doesn't compete with prose                     |
| Link color        | Theme accent, underline on hover | Discoverable but not distracting               |

All of these are user-adjustable via settings, persisted to IndexedDB.

---

## Theme System

Five themes shipping with v1:

### 1. Sepia (Default) ⭐

- Background: `#f4ecd8` (warm cream)
- Text: `#3a2f24` (warm brown-black)
- Accent: `#8b6f47` (muted gold)
- Like a quality paperback book; reduces blue light fatigue

### 2. Light

- Background: `#fafaf8` (slightly off-white, easier than pure white)
- Text: `#1a1a1a` (near-black, not pure black)
- Accent: `#0066cc`
- For daylight reading; more contrast than sepia

### 3. Dark

- Background: `#1e1e1e` (warm dark grey, not pure black)
- Text: `#d4d4d4` (light grey, not pure white)
- Accent: `#7eb6ff`
- For evening reading; reduced contrast prevents eye strain

### 4. OLED Black

- Background: `#000000` (true black for OLED screens)
- Text: `#cccccc`
- Accent: `#ff9d4d`
- For OLED phones / monitors; saves battery; deep immersion

### 5. Auto

- Follows system preference (`prefers-color-scheme`)
- Sepia in light mode, Dark in dark mode

### Theme decisions

- **No syntax-highlighted code blocks fighting the theme**: code uses theme-tuned monochromatic styling with minimal color (operators / strings / comments only)
- **Images get a subtle border in dark themes** to prevent harsh edges
- **Tables get muted alternating rows**, not bold lines

---

## Interaction Details

### Scroll & Progress

- **Smooth scroll** with native momentum
- **Top progress bar** (2px, theme accent color) shows position in current document
- **Scroll memory**: returning to a previously-read document restores scroll position
- **Soft shadow at top/bottom** when content extends beyond viewport (subtle indicator)

### Navigation gestures

- **Hover left edge (50px zone)** → file tree slides in from left over 200ms
- **Hover right edge** → TOC slides in from right
- **Hover top edge** → toolbar slides down (breadcrumb, theme toggle, settings, ⌘K hint)
- **Move mouse to center for 2s** → all UI auto-hides
- **`⌘B`** → pin/unpin file tree (for users who want it always visible)
- **`F`** → toggle zen mode (hides everything including progress bar)
- **`⌘K`** → command palette (always available)
- **`Esc`** → close any open panel / exit zen mode

### Wikilinks

- Internal links (`[[page]]`) styled distinctly from external links
- **Hover preview**: hovering over `[[page]]` shows a 400ms-delayed popover with the first 200 chars of the target document
- **Click**: navigate to that page (history is preserved)
- **`⌘+Click`**: open in a side-by-side reading pane (Phase 2)

### Code blocks

- Subtle background tint (theme-aware, low contrast)
- Filename / language label in top-right corner if specified (`​```typescript filename="app.ts"`)
- Copy button appears on hover, top-right
- No line numbers by default (cleaner reading); toggle in settings

### Images

- Centered, max-width 100% of content column
- Subtle rounded corners (4px)
- Click to expand full-screen lightbox
- Captions (from alt text or italic line below) styled distinctly

### Quick Edit Mode (Phase 2)

- Enter from the current document only, via an `Edit` action in the top hover toolbar
- Switch the page from rendered reading view to a clean source-text editor for the same file
- Preserve the same theme, typography scale, and overall calm visual tone; this is a repair surface, not an IDE
- Support only text-oriented operations in MVP of editing:
  - fix typos
  - rewrite sentences
  - update links and frontmatter values
  - find / replace within the current file
- Primary actions:
  - `Save` — writes the Markdown file, re-renders, returns to reading mode
  - `Cancel` — abandons the draft and returns to reading mode
  - `Esc` — closes transient UI first; if clean, exits edit mode
- Explicit non-goals:
  - no block handles
  - no slash menu
  - no drag/drop media insertion
  - no multi-file editing
  - no WYSIWYG reconstruction of Markdown structure

---

## Settings Panel (Hover top → click gear)

Minimum settings for v1:

```
Theme:           [Sepia] [Light] [Dark] [OLED] [Auto]
Body font:       [Serif (default)] [Sans-serif] [System]
Font size:       [— Aa +]   currently 18px
Line height:     [— ▍ +]   currently 1.7
Content width:   [Narrow] [Medium] [Wide]
                 (640 / 720 / 880 px)
Reading mode:    [Default] [Compact] [Zen-on-by-default]

Show TOC:        [Auto] [Always] [Never]
Show file tree:  [Hover] [Pinned] [Hidden]

Reset to defaults
```

All preferences saved to IndexedDB, scoped per-vault.

---

## Mobile Reading Behavior

- File tree: bottom sheet (swipe up)
- TOC: floating button bottom-right that expands
- Settings: same gear button, opens as full-screen modal
- Pinch-to-zoom adjusts font size with smooth re-flow
- Long-press on text → highlight (Phase 2 annotations feature)

(Note: actual mobile support depends on FSAPI / iCloud workarounds — see `gaps-and-open-questions.md#PG-03`. The visual design is defined here for when the access layer is solved.)

---

## What This Means for Implementation

The visual style is opinionated and consistent. This means:

- **One CSS theme system** (CSS variables drive everything)
- **No theme plugins / community CSS** in v1 — too easy to break the design philosophy
- **Typography library** built once, reused everywhere
- **Component library**: prose, code, callout, link-preview — all theme-aware

If a feature can't be made beautiful within this design philosophy, it's the wrong feature for this product.
