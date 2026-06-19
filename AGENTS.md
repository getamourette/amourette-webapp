<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Bartap

Live, in-bar dating app. Codename "Bartap", final name TBD. Co-founded by Aymane (New York) and Marwane (Paris). Both founders code, with both Claude Code and Codex.

**North star (internal compass):** *Turn the fear of rejection into a painless match, right where people already are: the bar.*

**Public line:** *The app that gets people in the same bar to actually talk to each other.*

You scan a QR on the way into a venue, see who is checked in tonight, like discreetly, and a chat opens only if it is mutual. No public rejection, ever.

## Where things live

This file is the single source of truth for any agent. Codex reads `AGENTS.md` natively; `CLAUDE.md` just imports it, so Claude Code shares the exact same contract. Keep this file to durable things (vision, invariants, stack, conventions) so it does not rot.

- **`AGENTS.md`** (this file): the durable engineering contract. Rarely changes.
- **`docs/roadmap.md`**: current state and the phased plan. The living status doc, updated as work ships.
- **`docs/decisions.md`**: append-only log of architecture and collaboration decisions, shared between both founders.
- **Google Doc `Bartap - Vision & Strategy`**: full product vision and strategy.
- **Code + git history**: the actual truth of what is built. Docs are the human-readable layer on top.

**This is a living set of docs.** If during any work session you spot something wrong, a missing convention, a gotcha, or a decision worth recording, update the right file on the spot (a convention goes here, a status change in `docs/roadmap.md`, a decision in `docs/decisions.md`). Do not leave it for a separate cleanup pass.

## Logging decisions (do this without being asked)

When you and a founder reach a decision during a session, a choice about architecture, data model, tooling, dependencies, or how you work, **append it to `docs/decisions.md` before the session ends**, with the date and the *why*, not just the *what*. Do not wait to be told. If you are unsure whether something counts as a decision, ask the founder rather than skip it. Keeping this log current is part of the work; a decision that lives only in a chat is a decision lost to the other founder.

## The decision filter (read before any product choice)

Every feature, every shortcut, every line of code is checked against the north star and these five invariants. They are true from v1 to maturity. If a change weakens one of them, it does not ship.

1. **Live**: it is about who is *here, now*, not a database of singles to browse from your couch.
2. **In person first**: the product is a trigger to talk IRL, not a place to chat for weeks.
3. **Discreet double opt-in**: you like in secret, a chat unlocks *only* if it is mutual. No one is ever notified they were liked and not matched. **There is no open messaging.** This is a red line: open DMs drive women off the platform and kill the app.
4. **Ephemeral presence, persistent identity**: your profile is permanent, but your presence in a venue fades when you leave it.
5. **Women first**: safety and control are non-negotiable and gate every decision. If women do not feel safe and in control, the app dies.

When in doubt: *does this reduce the social friction of the first real-life contact?* Yes, consider it. No, drop it. This is the guard rail against the bright shiny object.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict).
- **Supabase**: Postgres + Auth + Storage + Realtime. Client in `lib/supabase.ts`.
- **Tailwind CSS 4** (via `@tailwindcss/postcss`).
- Path alias `@/*` maps to the repo root (configured in `tsconfig.json`).

> Next.js 16 has breaking changes vs older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing routing or data-fetching code. See the rules block at the top of this file.

## Conventions

- **Language:** everything written to the repo is in **English**: code, identifiers, comments, docs, commit messages. The founders may talk to their agents in French, but nothing French lands in the repo.
- **TypeScript strict, no `any`.** The scaffold uses `useState<any[]>` in a few places; type new code properly and tighten existing types when you touch them.
- **Commits:** conventional (`feat:`, `fix:`, `refactor:`). Never mention AI assistants.
- **Keep it simple.** No premature abstraction. Three similar lines beat one clever abstraction. Pull tooling and structure (folders, docs, libs) when a real need appears, not preemptively.
- **Supabase access:** prefer typed queries; select only the columns you need (never leak email or phone via `select("*")`); enforce access with RLS, not client-side checks.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev      # http://localhost:3000
npm run lint     # eslint
npm run build    # production build
```

**Status and what to build next:** see `docs/roadmap.md`.
