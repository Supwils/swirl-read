# SwirlRead — Launch Docs (M9.8)

> Status: **drafts**, not yet executed. The actual launch is a
> day-of-action; these files prepare for it.

## Read in this order

1. [`launch-checklist.md`](./launch-checklist.md) — every box that
   needs ticking before the production URL goes public. Treat as a
   one-time pre-flight; don't deploy if any box is empty.
2. [`show-hn.md`](./show-hn.md) — Hacker News title + first comment
   draft. Edit before posting.
3. [`announcement.md`](./announcement.md) — Twitter / Mastodon /
   Reddit / Lobste.rs variants. Pick what matches the channel.

## What "M9.8 done" looks like

- Domain registered, DNS pointed at Vercel
- `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` set as repo
  secrets
- `.github/workflows/deploy.yml` succeeds on a push to `main`
- Production URL renders the landing page in a Chromium browser
- `v0.1.0` tag cut on GitHub with the Show HN copy as release notes
- Show HN posted; first 6 hours of comments answered
- Twitter announcement live, linked to the HN thread

## Things deliberately not in scope here

- Vercel Analytics opt-in (privacy posture is "no tracking" by default;
  revisit only if hosting decisions need real numbers)
- A waitlist / email signup (the product _is_ the landing page)
- Sponsored posts / paid promo (let HN front-page traffic be the test)
- A Discord (premature; GitHub issues handles it)

## After launch

A separate `launch-retro.md` should be written 48 hours after going
live. Capture: traffic numbers, browser breakdown, "Try sample vault"
→ "Open my vault" conversion, top three issues filed, and what we
got wrong about the messaging. That's how we steer the v0.2 roadmap.
