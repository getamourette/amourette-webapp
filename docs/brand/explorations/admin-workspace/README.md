# Admin venue workspace comparison — #162

Local exploration, 2026-10-01. After comparing both variants, Aymane selected
**A — Venue page**. The prototype remains comparison evidence; production
implementation and verification are separate, and shipping is not authorized.

## Open the comparison

From this worktree:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://workspace-preview.invalid NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=preview-only-not-a-real-key npm run dev -- --hostname 127.0.0.1 --port 3162
```

Open <http://127.0.0.1:3162/admin/workspace-preview> on this computer. The route is
available only in development; production rendering returns not found. Dummy
Supabase settings isolate the root application's auth listener as well as this
preview. Do not run the comparison on an existing server connected to the shared
database. No sign-in is needed and no real venue or participant data is loaded.

The comparison renders inside the application using its actual global admin
styles, fonts and `BrandLogo`. The admin header markup is reproduced for context;
the comparison does not render the authenticated workspace or execute its
commands. It is an interactive layout exploration. The selected production
implementation is described separately below.

## Compare

- **A — Venue page:** nights occupy the main column; permanent venue details sit
  in a compact side panel. On narrow screens the details follow the night list.
- **B — Tabs:** nights and venue details occupy separate views. The venue header
  and production QR entry remain visible across both sections.
- Both use the same fixtures, active-night card, upcoming list, collapsed
  read-only history, focused night editor and independent details form.
- Try the empty, long-name and failed-night-loading scenarios. Return to the
  venue list to see the upcoming-only count (2 rather than all 6 sample nights).
- The initial comparison concerned content layout. The selected implementation
  retains the existing `/admin` route, as described below.

## Interaction limits

Venue-name/location saves and pause/reopen affect memory only. Reload resets
them. Schedule controls demonstrate the editing layout but do not save; submit
reports this explicitly. QR graphics and copy/download controls are placeholders.
Deletion is disabled. These controls do not demonstrate production validation,
timezone changes, lifecycle races, RLS, cancellation or error recovery.

The selected implementation preserves the existing independent venue save,
schedule locks, production QR destination, terminal-night restrictions and
test-venue protections. The original list counted all nights as "Upcoming nights";
the selected implementation counts only upcoming nights.

## Local review

With the server running, execute:

```sh
node docs/brand/explorations/admin-workspace/capture.mjs
```

This standalone script does not load the shared Playwright configuration or
database fixtures. It refuses external browser requests, checks the key simulated
interactions and captures both variants at 1440, 390 and 320 CSS pixels. Captures
are design review evidence only. No full validation suite or hosted/Vercel gate is
needed for choosing a local prototype; those gates remain outstanding for the
eventual implementation. Physical-device testing is not claimed.

On 2026-10-01, targeted ESLint and TypeScript checks passed. The standalone browser
check passed at all three widths with no backend requests. Agent screenshot review
covered the desktop variants, mobile overview, narrow schedule editor and read-only
history. Aymane selected A after review; deployed verification remains pending.

## Selected layout implementation

The working `/admin` renderer now implements A in `app/admin/VenueWorkspace.tsx`.
It keeps the existing founder gate and RPCs. The dedicated comparison URL above
continues to display the preserved synthetic prototypes; it does not demonstrate
the production commands. The local server described above intentionally cannot
authenticate against the shared project.

Implementation validation on 2026-10-01:

- Targeted ESLint, TypeScript, `test:admin-review` and `test:venue-time` passed.
- The production build passed after allowing Google Fonts network access; the
  first sandboxed attempt failed to fetch fonts.
- The focused admin browser regressions use mocked transport and no real accounts
  or venues. They cover independent venue saves, schedule updates/addition,
  chronological upcoming counts, production QR output, errors with draft retention,
  read-only history, refresh-driven locks, pause/reopen, cancellation confirmation,
  protected test venues and independent venue creation.
- Agent inspection covered the actual admin renderer at desktop, 390 px and
  320 px, including the history dialog. Keyboard focus outlines and the mobile
  closing-time annotation were refined after inspection.
- The initial development browser run stalled because the test harness closed
  Next's HMR socket before hydration. It now permits only the application's Next
  socket while closing Supabase sockets. Focused regressions then passed. A refresh
  assertion was scoped to `main` to distinguish the application error from Next's
  route announcer; the expected error behavior was preserved.

Additional visual review on 2026-10-01 exercised the actual renderer at 1440,
820, 390 and 320 CSS pixels with mocked backend responses. All four focused
browser scenarios passed, covering schedule editing, retained save errors, QR,
waiting/launch, empty states, long names and keyboard navigation. No fixture
accounts were created. Targeted ESLint, TypeScript and `git diff --check` passed
after the fixes; the full build was not repeated.

This review fixed narrow-screen schedule buttons being clipped, forward Tab
escaping the intended dialog cycle, focused fields being obscured by the sticky
footer, and maximum-length unbroken names overflowing dialogs or venue cards.
Final screenshot inspection confirmed readable controls and wrapping. Desktop
has a clear distinction between nights and permanent venue details; mobile is
usable but requires more scrolling, including the existing tall admin header.
Saved evidence: [desktop](review/overview-1440.png),
[phone](review/overview-390.png), [narrow schedule](review/schedule-focused-320.png)
and [phone QR](review/qr-390.png). These are local browser captures, not physical
device or authenticated remote integration evidence.

No shared database changes, branch push, PR promotion or shipping occurred. The
hosted gate, authenticated Vercel interaction review and physical-device checks
remain outstanding. Do not describe this as Ready for review.
