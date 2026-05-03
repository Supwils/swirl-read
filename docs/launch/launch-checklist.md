# SwirlRead — Launch Checklist (M9.8)

> Run through this list before flipping the repo public and posting Show
> HN. Everything below is one-time setup; the goal is to leave nothing
> until "after the post is live."

## Pre-flight (do this on a quiet weekday)

### 1. Repo state

- [ ] `pnpm check` clean on `main`
- [ ] CI green on `main` (the `.github/workflows/ci.yml` workflow runs
      on push)
- [ ] `docs/develop/work-log.md` has an entry for the launch itself
      (date, commit SHA, deploy URL)
- [ ] No `TODO(M9.x)` comments left referring to launch-blocking work
- [ ] `LICENSE` copyright line names a real entity (replace
      "SwirlRead contributors" if a single human or org wants the line)

### 2. Domain + Vercel

- [ ] Domain registered (`swirlread.app` is the design-doc placeholder
      — verify availability or pick a substitute)
- [ ] Vercel project created and linked to this repo via the GitHub
      integration
- [ ] `vercel link` run locally; the resulting `.vercel/project.json`
      gives you the `orgId` + `projectId`
- [ ] GitHub repo secrets set: - `VERCEL_TOKEN` — from <https://vercel.com/account/tokens> - `VERCEL_ORG_ID` — from `.vercel/project.json` - `VERCEL_PROJECT_ID` — same
- [ ] Manual `vercel --prod` succeeds at least once
- [ ] Domain pointed at the Vercel project (DNS ANAME / CNAME per
      Vercel's instructions)
- [ ] HTTPS certificate issued (Vercel does this automatically)
- [ ] Production URL renders the landing page; "Try with sample vault"
      works end-to-end

### 3. Browser sanity check

Open the production URL in:

- [ ] Chrome (latest stable)
- [ ] Edge (latest stable)
- [ ] Brave (latest stable)
- [ ] Arc
- [ ] Firefox — sample vault must work; "Open my vault" should show
      the `unsupported-browser` message gracefully (no crash, no blank
      page)
- [ ] Safari — same as Firefox; FSAPI not available
- [ ] Mobile Chrome on Android — sample vault, no real-folder picker

For each: pick three sample-vault notes, hover a wikilink (popover
loads), open the command palette (`⌘K` / `Ctrl+K`), switch themes,
toggle zen mode (F).

### 4. Repository surface

- [ ] `README.md` screenshots filled in (currently text-only) —
      sepia + dark theme captures of the sample vault
- [ ] GitHub repo description set (one-line, ≤ 110 chars)
- [ ] GitHub topics set: `markdown`, `reading`, `local-first`,
      `obsidian`, `knowledge-management`, `react`, `typescript`,
      `vite`
- [ ] Repo "About" panel filled (description, website URL, topics)
- [ ] License visible (GitHub auto-detects `LICENSE`)
- [ ] Issues enabled, Discussions enabled, Wiki disabled, Projects
      enabled with a v0.2 board
- [ ] CODEOWNERS file (optional — only if multiple maintainers exist
      yet)
- [ ] First few "good first issue" labels populated from the
      polish backlog

### 5. Social

- [ ] Twitter / X handle reserved (or use existing)
- [ ] GitHub release `v0.1.0` cut with the Show HN-ready copy as the
      release notes
- [ ] Show HN draft polished (see `show-hn.md`)
- [ ] Twitter announcement draft polished (see `announcement.md`)
- [ ] OG image generated for `index.html` (sepia screenshot + wordmark)

## Launch day

Pick a weekday morning (US time zones get peak HN traffic). In order:

1. [ ] Push the `v0.1.0` tag (triggers the deploy workflow as a sanity
       run; should be a no-op if already deployed)
2. [ ] Post Show HN — title, link, no marketing fluff
3. [ ] Tweet the announcement, link to Show HN comment thread
4. [ ] Cross-post to relevant communities (r/ObsidianMD,
       r/SideProject, lobste.rs if you have an invite, knowledge-mgmt
       Discord servers you're already in — **don't spam**)
5. [ ] Be available in the HN thread for the first 6 hours; answer
       every top-level comment within 30 minutes

## Post-launch (first 48 hours)

- [ ] Bug-triage incoming issues; tag with severity
- [ ] Don't ship features in response to single-user requests; collect
      patterns first
- [ ] Note traffic, browser breakdown, and "Try sample vault" → "Open
      my vault" conversion (Vercel Analytics, if enabled — keep
      privacy-friendly)
- [ ] Post a 48-hour retro to `docs/launch/launch-retro.md` (template
      to be added if/when the retro happens)

## What we are NOT doing on launch day

- Discord / Slack server — premature; the issue tracker handles it
- Pricing / sponsorship — v1 ships free; revisit only if hosting costs
  become real
- A waitlist landing page — the product _is_ the landing page
- Automated analytics that touch user vault content — see
  `CLAUDE.md` constraints
- Roadmap public commitments — Phase 2 (lightweight editing) is real
  but not promised
