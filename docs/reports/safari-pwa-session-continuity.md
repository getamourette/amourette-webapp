# Safari to Home Screen session continuity — physical test report

- Issue: #119
- Status: **NO-GO — refresh-token divergence reproduced on a physical iPhone**
- Test device: iPhone 17 Pro running iOS 26.5.2 (confirmed in Settings); exported UA independently reports `iPhone OS 18_7` and Safari `Version/26.5.2`
- Theoretical platform floor: iOS/iPadOS 17.2
- Android regression: not run because the candidate architecture failed its iOS gate

## Decision

**NO-GO for sharing one copied Supabase anonymous session between Safari and the installed PWA.**

The installation handoff succeeded: Safari and the PWA recovered UID `d96286db-d603-43e3-ad01-e7828bb40fc8` and session `cc3f770f-0b42-4c00-b4ec-834d55472e11`. Normal alternating refreshes also succeeded. The decisive stale-context test failed, however: after Safari rotated twice, the PWA's refresh at `2026-07-26T14:45:36.300Z` returned `Invalid Refresh Token: Already Used`.

This is not cleared by the unchanged UID immediately afterward. The PWA still held an access token valid until `2026-07-26T15:44:52Z`, so authenticated reads could continue temporarily while long-term renewal was already broken. Supabase documents `refresh_token_already_used` as a revoked token outside the reuse interval; reuse outside the current-token-parent exception can terminate the session token family. This is the exact divergence risk the gate was designed to detect.

## Builds under test

| Build | Auth storage | URL / commit | Purpose |
|---|---|---|---|
| A | Supabase JS default (`localStorage`) | commit `eda06ac` · `https://qr-web-app-git-feature-safari-pwa-session-con-2d6864-tothe-moon.vercel.app` | Negative control |
| B | `@supabase/ssr` cookies | commits `0f0b630`–`1d2a00c` · `https://qr-web-app-git-feature-safari-pwa-session-continuity-tothe-moon.vercel.app` | Continuity candidate |

Both builds must point at the same shared development Supabase project. Clear the build's Safari website data and remove its Home Screen installation before each clean run. Do not reset the shared test venues while another founder is using them.

## Evidence rules

At every checkpoint, export the lab JSON and record the filename here. The export includes timestamps, display context, UID, `session_id`, token expiry, Auth events, Realtime status and RLS-visible business rows, but never access or refresh token values. Use a precisely identified primary test identity and a separate actor; record their UIDs so their rows and `auth.users` entries can be deleted individually after testing.

## Matrix

| ID | Checkpoint | Expected | UID | `session_id` | Evidence | Result |
|---|---|---|---|---|---|---|
| A1 | Safari after QR + profile | Baseline identity | Not retained | Not retained | Founder observation | Pass |
| A2 | First launch from Home Screen | Different UID | Not retained | Not retained | Founder confirmed Safari/PWA UIDs differed | Pass |
| B1 | Safari after profile + `test-empty` | Waiting room, baseline identity | `d96286db-…` | `cc3f770f-…` | Safari export, snapshot `14:46:20Z` | Pass |
| B2 | Safari after check-in | Presence and state attached | `d96286db-…` | `cc3f770f-…` | Presence `ce4a5f84-…` in `test-empty` | Pass (test-empty; test-crowded not checked in) |
| B3 | First Home Screen launch | Same UID and session | `d96286db-…` | `cc3f770f-…` | PWA and Safari exports | Pass |
| B4 | PWA business-state check | Profile/presence/like/match/message intact | `d96286db-…` | `cc3f770f-…` | Profile + presence visible; likes/matches/messages empty | Partial |
| B5 | Secondary actor event | Realtime event received + snapshot resynced | | | | Pending |
| B6 | Refresh PWA → Safari → PWA | Identity/session unchanged | `d96286db-…` | `cc3f770f-…` | PWA `14:44:29Z`, Safari `14:44:43Z`, PWA `14:44:52Z` | Pass |
| B7 | PWA twice, then stale Safari | No revocation or new user | | | | Pending |
| B8 | Safari twice, then stale PWA | No revocation or new user | `d96286db-…` | `cc3f770f-…` | Safari refreshes `14:45:23Z` + `14:45:24Z`; PWA failure `14:45:36Z` | **Fail — NO-GO** |
| B9 | Force-close and reopen both | State/session recovered | `d96286db-…` | `cc3f770f-…` | Both exports retain identity and state | Pass before access-token expiry |
| B10 | PWA background 15–30 min | Realtime reconnect + resync | | | | Pending |
| B11 | Install before profile creation | Discontinuity observed and UX exclusion recorded | | | | Pending |

## Database verification and cleanup

After B5 and again after refresh stress, verify with founder-gated database tooling that profiles, presence, likes, matches and messages remain attached to the original UID. Do not modify the schema or Auth configuration. Record exact test UIDs and row IDs in a private testing note if they contain personal data; delete only those identified POC users and their data after evidence has been retained.

The exported RLS-visible state ties profile `d96286db-d603-43e3-ad01-e7828bb40fc8` and presence `ce4a5f84-3b39-4610-aacc-003d1077e906` to the same UID in both contexts. No likes, matches or messages existed in the supplied evidence, so those continuity checks and the secondary-actor test were not completed. They cannot reverse the refresh failure and are unnecessary for the NO-GO decision.

## Realtime observation

Foreground transitions repeatedly produced a transient `CHANNEL_ERROR`, followed by `SUBSCRIBED` roughly 0.7–1.2 seconds later and a successful snapshot resync. This did not detach identity or business state and is not the NO-GO cause. The final Safari export happened during one such transition and therefore records `CHANNEL_ERROR`; the prior cycles demonstrate recovery, but production UX should avoid exposing this transient transport state as a persistent error.

## Security and migration assessment

- Cookie-backed browser auth uses JavaScript-readable, non-`HttpOnly` cookies because the browser client must rotate tokens. XSS therefore remains the primary token-theft risk; the migration does not remove the need for strict output handling and a strong Content Security Policy.
- Cookie attachment broadens the CSRF threat model for any server endpoint that treats cookies as authority. SameSite cookies help, but state-changing server routes must still validate origin and/or CSRF tokens. Existing Supabase browser calls retain bearer-token and RLS enforcement.
- Any response carrying rotated auth cookies must remain private and uncached. The POC propagates the cache headers emitted by `@supabase/ssr`, and the lab route is force-dynamic.
- Safari and the installed app receive the same token chain at install time, then maintain separate cookie jars. Supabase refresh tokens rotate; reuse detection and stale-token ancestry are therefore the central go/no-go risk this experiment tests.
- A production migration would replace the shared browser client with `createBrowserClient`, add and maintain `@supabase/ssr`, add a request proxy that validates/refreshes claims and propagates cookies/cache headers, audit every authenticated cache boundary, test sign-in/sign-out/recovery/admin flows, add CSRF/CSP hardening where needed, and run iOS plus Android regression. No database migration is implied.

## Consequences for #120–#122

- **GO:** #120 may implement the real manifest/install UX while explicitly preventing “install before identity/profile exists”; #121 and #122 may build on the preserved UID, subject to Android regression and the security work above.
- **NO-GO (observed):** do not base Push work on one anonymous session copied from Safari into a separately evolving PWA cookie jar. Reframe #120 around an explicit identity-link/upgrade mechanism or a PWA-owned session established after installation; keep #121–#122 blocked until that bridge is proven. Merely extending the refresh-token reuse interval or disabling reuse detection would weaken a security control and is not recommended.

## Final cleanup

Completed before the final PR:

- removed `/session-continuity-lab`, the temporary manifest/icon use, `proxy.ts`, `@supabase/ssr`, and the cookie-backed client change;
- restored the production client and dependency tree exactly to `main`;
- deleted the three identified anonymous Auth users from tests A and B (`b9d78e5d-f25f-4243-ac85-2e23bb7a6cb4`, `9f068be6-c89b-44a9-9ec2-f55aaea4e6c8`, and `d96286db-d603-43e3-ad01-e7828bb40fc8`);
- verified that no Auth users, profiles, or presence rows remain for those IDs;
- retained only this report and the dated decision in `docs/decisions.md`.

No production Auth migration ships from #119.

## References

- WebKit, [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- WebKit, [WebKit Features in Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
- Supabase, [Server-Side Rendering](https://supabase.com/docs/guides/auth/server-side)
- Supabase, [Advanced SSR guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- Supabase, [User sessions and refresh-token reuse detection](https://supabase.com/docs/guides/auth/sessions)
- Supabase, [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)
