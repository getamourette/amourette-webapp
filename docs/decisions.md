# Decisions

Append-only log of architecture and collaboration decisions, shared between both founders. Newest at the bottom. Record the *why*, not just the *what*. Product and strategy decisions live in the Google Doc; this file is for how we build and work.

## 2026-06-19

- **`AGENTS.md` is the single source of truth for agents.** Codex reads `AGENTS.md` natively and `CLAUDE.md` only imports it, so both agents and both founders share one contract instead of two that drift. *Why:* we work with multiple agents (Claude Code, Codex) and a second founder; divergent instructions are how agents end up working blind.
- **Keep Aymane's scaffold as the technical base; rebuild the core mechanic on top.** The scaffold (signup, global directory, open DM) is kept for its working Supabase wiring, but the discreet-like + match-gate mechanic is built over it rather than starting from scratch. *Why:* the wiring is reusable; the open-DM flow violates the discreet double opt-in invariant and cannot ship as is.
- **Phase 1 build order: Bloc 0 (foundations), then 2 (like/match), then 1 (presence), then 3 (chat gate), then 4 (safety).** *Why:* the like/match mechanic is the hypothesis the whole product rests on, so it comes right after the data model it depends on.
- **Repo language is English, conversation can be French.** Code, comments, docs and commits are English; talking to agents in French is fine. *Why:* durable artifacts must be readable by both founders and any future contributor.
- **`docs/` holds the shared roadmap and decision log.** `docs/roadmap.md` for status and plan, `docs/decisions.md` for decisions. *Why:* Todoist is personal to Marwane and Aymane cannot see it; the shared trace must live in the repo.
