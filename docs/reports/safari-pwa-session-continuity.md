# Safari to Home Screen session continuity — physical test report

Issue: #119  
Status: **physical validation pending**  
Test device: iPhone 17 Pro, iOS 26.5.2  
Theoretical platform floor: iOS/iPadOS 17.2  
Android regression: not yet tested

## Decision

**PENDING — neither GO nor NO-GO can be stated before the physical-device matrix is complete.**

A successful cookie copy immediately after installation is necessary but insufficient. A GO requires the same `auth.uid()` and JWT `session_id` through every B scenario below, including deliberately stale refresh-token chains and lifecycle recovery. Any new anonymous user, lost identity, global session revocation, or detached business state is a NO-GO.

## Builds under test

| Build | Auth storage | URL / commit | Purpose |
|---|---|---|---|
| A | Supabase JS default (`localStorage`) | `main` preview: _record before testing_ | Negative control |
| B | `@supabase/ssr` cookies | branch preview: _record before testing_ | Continuity candidate |

Both builds must point at the same shared development Supabase project. Clear the build's Safari website data and remove its Home Screen installation before each clean run. Do not reset the shared test venues while another founder is using them.

## Evidence rules

At every checkpoint, export the lab JSON and record the filename here. The export includes timestamps, display context, UID, `session_id`, token expiry, Auth events, Realtime status and RLS-visible business rows, but never access or refresh token values. Use a precisely identified primary test identity and a separate actor; record their UIDs so their rows and `auth.users` entries can be deleted individually after testing.

## Matrix

| ID | Checkpoint | Expected | UID | `session_id` | Evidence | Result |
|---|---|---|---|---|---|---|
| A1 | Safari after QR + profile | Baseline identity | | | | Pending |
| A2 | First launch from Home Screen | Different UID | | | | Pending |
| B1 | Safari after profile + `test-empty` | Waiting room, baseline identity | | | | Pending |
| B2 | Safari after `test-crowded` check-in | Presence and state attached | | | | Pending |
| B3 | First Home Screen launch | Same UID and session | | | | Pending |
| B4 | PWA business-state check | Profile/presence/like/match/message intact | | | | Pending |
| B5 | Secondary actor event | Realtime event received + snapshot resynced | | | | Pending |
| B6 | Refresh PWA → Safari → PWA | Identity/session unchanged | | | | Pending |
| B7 | PWA twice, then stale Safari | No revocation or new user | | | | Pending |
| B8 | Safari twice, then stale PWA | No revocation or new user | | | | Pending |
| B9 | Force-close and reopen both | State/session recovered | | | | Pending |
| B10 | PWA background 15–30 min | Realtime reconnect + resync | | | | Pending |
| B11 | Install before profile creation | Discontinuity observed and UX exclusion recorded | | | | Pending |

## Database verification and cleanup

After B5 and again after refresh stress, verify with founder-gated database tooling that profiles, presence, likes, matches and messages remain attached to the original UID. Do not modify the schema or Auth configuration. Record exact test UIDs and row IDs in a private testing note if they contain personal data; delete only those identified POC users and their data after evidence has been retained.

## Security and migration assessment

- Cookie-backed browser auth uses JavaScript-readable, non-`HttpOnly` cookies because the browser client must rotate tokens. XSS therefore remains the primary token-theft risk; the migration does not remove the need for strict output handling and a strong Content Security Policy.
- Cookie attachment broadens the CSRF threat model for any server endpoint that treats cookies as authority. SameSite cookies help, but state-changing server routes must still validate origin and/or CSRF tokens. Existing Supabase browser calls retain bearer-token and RLS enforcement.
- Any response carrying rotated auth cookies must remain private and uncached. The POC propagates the cache headers emitted by `@supabase/ssr`, and the lab route is force-dynamic.
- Safari and the installed app receive the same token chain at install time, then maintain separate cookie jars. Supabase refresh tokens rotate; reuse detection and stale-token ancestry are therefore the central go/no-go risk this experiment tests.
- A production migration would replace the shared browser client with `createBrowserClient`, add and maintain `@supabase/ssr`, add a request proxy that validates/refreshes claims and propagates cookies/cache headers, audit every authenticated cache boundary, test sign-in/sign-out/recovery/admin flows, add CSRF/CSP hardening where needed, and run iOS plus Android regression. No database migration is implied.

## Consequences for #120–#122

- **GO:** #120 may implement the real manifest/install UX while explicitly preventing “install before identity/profile exists”; #121 and #122 may build on the preserved UID, subject to Android regression and the security work above.
- **NO-GO:** do not base Push work on anonymous Safari-to-PWA handoff. Revisit the identity bridge (for example an explicit account/link step) before #120–#122 proceed.

## Final cleanup gate

Before opening the final PR, remove `/session-continuity-lab`, the temporary manifest/icon use, `proxy.ts`, `@supabase/ssr`, and the cookie-backed client change. Retain only this completed report, the dated decision in `docs/decisions.md`, and any necessary roadmap update. Confirm the POC's identified test users/data are deleted. No production Auth migration ships from #119.
