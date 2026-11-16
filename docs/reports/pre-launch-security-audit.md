# Pre-launch security audit — #44

Date: 2026-11-15. Branch: `feature/pre-launch-security-audit`. Audited commit:
`f9579bf3263bd4f94d35163b244f74c176d53d06` (`main`, also the production deployment on
that date). Status: **discovery pass complete, no remediation applied**. Every finding is
`Open` and has a sub-issue of #44.

This report is the technical source of truth for #44. It contains no secret, token, real
participant data or ready-to-run destructive payload. The repository is public, so
reproductions describe the mechanism a fixer needs, not a script.

## Read this first

No Critical finding. **Four High findings gate the production cutover (#280):**

| Finding | What is wrong | Why it gates #280 |
| --- | --- | --- |
| [SEC-001](#sec-001) | `check_in` needs no proof of being at the venue. Any session can list every venue, check in from anywhere and browse first name, photo and bio of the people in a bar tonight. Verified live. | Breaks the "Live" and "Women first" invariants the moment real women are in a room. **Decided 2026-11-16:** venue listing is closed before the pilot (this part still gates the first real night); remote check-in by someone who knows the slug is accepted for the pilot night; rotating or signed QR is deferred until after the pilot. |
| [SEC-002](#sec-002) | One unauthenticated address can fill an event's whole capacity with unpaid 30-minute holds and keep it full. Reproduced in an isolated local database. | Paid reservations open right after #280. A free, single-IP way to make the only launch event unbookable must be closed first. |
| [SEC-003](#sec-003) | `sharp` 0.34.5 has three published memory-corruption advisories, and the photo routes let a mislabelled upload reach the SVG, GIF and HEIF loaders before the type check. Loader reachability verified locally; no exploit attempted. | The photo function holds the service-role key. Fix is a dependency upgrade plus a loader block; do it before the new production key exists. |
| [SEC-004](#sec-004) | No production/development isolation: the service-role key of the database behind `getamourette.com` is also in CI, every preview deployment and every local worktree. | This is #280 itself. The finding adds the security exit conditions #280 must meet (key rotation, script target guard, no seed data in production). |

Also decide before real users, although they do not gate #280: [SEC-005](#sec-005) (a
participant removed for the night can still watch the matched partner's presence and
read the chat), [SEC-007](#sec-007) (seed accounts accept passwords derivable from this
public repository, including the outreach demo room) and [SEC-011](#sec-011) (founder
admin accounts have no MFA).

Totals: 0 Critical, 4 High, 9 Medium, 7 Low, 1 Info.

Open points for the founders are listed in [Open questions](#open-questions).

## Scope and environment

| Item | Value |
| --- | --- |
| Commit | `f9579bf` on `main` (fast-forwarded audit branch, no code change) |
| Deployed application | Production deployment of `f9579bf` on the custom domain (headers and fail-closed checks only). Preview deployments are behind Vercel authentication and were not driven. |
| Database | The single shared remote Supabase project (development, demo and current production all at once). Catalog read through the Supabase MCP; authorization tested through PostgREST, Storage and Realtime with real test tokens. |
| Stripe | Sandbox key only. No Stripe API call was made by the audit; the launch perimeter was exercised through the repository's isolated PGlite harness. |
| Access used | Service-role key (fixture setup and cleanup only), publishable key, GitHub token (`repo`, `read:org`, `project`), authenticated Vercel CLI (names and settings only, no value pulled). |
| Date | 2026-11-15, evening (UTC) |

Excluded by instruction: load and denial-of-service testing, any attack on third parties
(Stripe, Resend, Vercel, Supabase) beyond reading our own configuration, real payments,
migrations, remote configuration changes, and any contact with the `demo` venue or its
profiles.

Shared-database activity: two runs of a cross-identity probe created six test users and
one venue each, following the repository's E2E fixture convention (`e2e-<run>-…` slug,
`is_test_venue`, users tagged with the run id and `security_audit`). One temporary row
in `admins` per run was needed to exercise a real ejection. Both runs removed their
fixtures; a catalog check afterwards found zero leftover venue and zero leftover user.
One sign-in was made to a synthetic test-venue seed account (SEC-007) and signed out
without any write.

## Threat model

**Assets**

- Participant identity and presence: first name, photo, bio, gender and preferences, and
  above all *where a person is tonight*.
- Secret intent: likes that are not mutual, blocks, reports.
- Conversations between matched participants.
- Guest reservation data (name, email, payment and refund state) and the EUR 10 deposits.
- Founder capabilities: moderation, ejection, venue and night control, refunds, arrivals.
- Server secrets: Supabase service-role key, Stripe key and webhook secret, launch
  sealing key, worker secrets, Resend key.
- Availability on a live night and during the reservation window.

**Actors**

- Unauthenticated internet user (publishable key only, role `anon`).
- Anonymous session (`signInAnonymously()`, role `authenticated`): free, unlimited,
  no CAPTCHA. This is the baseline attacker for almost every finding.
- Participant in a room, including one who was matched, blocked, reported or removed.
- Guest holding a reservation capability; a person who knows a guest's email.
- Founder admin; a party who compromised a founder account, a dependency, a CI run or a
  developer machine.

**Trust boundaries**

1. Browser to Supabase (PostgREST, Storage, Realtime): enforced by grants, RLS and
   `SECURITY DEFINER` RPCs. The client is never trusted.
2. Browser to Next.js route handlers: bearer JWT validated with `auth.getUser`, or a
   sealed guest capability, or a worker secret. No cookie session exists, so CSRF does
   not apply to the participant and admin surfaces.
3. Route handlers to Supabase with the service-role key: bypasses RLS; inputs must be
   validated before this hop.
4. Stripe and Resend webhooks to route handlers: signature over the raw body.
5. `pg_cron` and `pg_net` to worker routes: secret from Vault.
6. GitHub and Vercel to production: branch rules, deployment protection, environment
   scoping.

**Attack surface inventory**

- 21 route handlers under `app/api/**` (9 launch, 1 admin refund, 6 photo, 3 email,
  2 unsubscribe), 2 non-production preview pages, 1 `proxy.ts` (URL syntax only).
- `public` schema: 32 tables (all with RLS), 159 functions (158 `SECURITY DEFINER`),
  92 callable by `authenticated`, 2 callable by `anon`. `private` schema: 35 tables,
  117 functions, not exposed by PostgREST.
- Realtime publication with 7 tables; 2 private broadcast topics; several public
  channel names built by the client.
- 4 private Storage buckets.
- 6 `pg_cron` jobs.
- GitHub repository (public), one CI workflow, Vercel project (Hobby), 9 production
  dependencies with advisories.

## Methodology

Four bounded specialist passes ran in parallel, coordinated by one agent that then
verified the leads against the deployed state:

1. Launch reservations, Stripe, guest access, QR, arrival, refunds (static review).
2. Remaining Next.js client and server surfaces (static review).
3. Deployed Supabase catalog compared with `supabase/migrations/` (read-only catalog
   queries; no application row read).
4. Infrastructure and supply chain (`npm audit`, CI, GitHub and Vercel configuration,
   git history secret scan, scripts).

Verification by the coordinator:

- **Supabase security advisors** (`get_advisors`, security).
- **Live cross-identity probes**: about 160 assertions with six test identities (two
  matched participants, a co-present third party, a complete profile that never went to
  the venue, a bare anonymous session, a temporary admin) against PostgREST, Storage and
  Realtime, plus the no-session `anon` role.
- **Production HTTP**: response headers on four pages and one unauthenticated request to
  each service route to confirm it fails closed.
- **Isolated local checks**: hold exhaustion in PGlite with the real migrations; `sharp`
  loader selection on mislabelled bytes; the repository's launch, like and discovery
  SQL suites at the audited commit (all passing).

Severity scale: **Critical** means exploitable now by an unauthenticated or anonymous
party for bulk personal data, secret likes, money or admin control. **High** means a
launch-gating break of a product invariant, a plausible path to server compromise, or a
cheap way to stop the launch. **Medium** needs a position or precondition, or harms
availability or integrity without exposing bulk data. **Low** is hardening. **Info** is
an operational gap.

## Coverage matrix

Result is one of `passed`, `finding`, `not applicable`, `not verified`. "Live" means a
real request with a test token against the deployed database or application.

### Product invariants and authorization

| Control | Result | Evidence |
| --- | --- | --- |
| `anon` (no session) reads no table and calls no RPC except the two unsubscribe functions | passed | Live: 401/42501 on 8 tables and 6 RPCs; catalog lists exactly 2 `anon`-executable functions |
| `private` and `net` schemas not reachable through PostgREST | passed | Live: `PGRST106` for both |
| A like is invisible to its target (rows, room output, room order) | passed | Live: target sees no row; `room_candidates` content and order identical before and after the secret like |
| No direct write to `likes` or `matches`; no forged liker | passed | Live: 42501 |
| A like needs the pair token and a co-present target | passed | Live: wrong token and outside target return `accepted = false` |
| Match only on a mutual like; invisible to third parties; not extendable | passed | Live |
| No open messaging: no message without a match, into another match, or as another sender | passed | Live: RLS refusal |
| Third party cannot read messages or call `match_presence_state` / `chat_partner_state` | passed | Live |
| Message body bounded by the database; no edit or delete by participants | passed | Live: 23514, 42501 |
| Message timestamp is server-owned | finding | SEC-016 |
| Profile columns limited to the public card; `select *`, `gender`, `first_name` and `photo_url` writes refused | passed | Live: 42501 |
| Profiles of people not co-present are unreadable; nothing readable after leaving | passed | Live |
| `profile_private`, `email_subscriptions`, `photo_state` are owner-only | passed | Live |
| Presence in a venue requires being at the venue | finding | SEC-001 |
| Presence rows: no insert, no change of owner or night, no update of another row | passed | Live |
| Presence timestamps are server-owned | finding | SEC-016 |
| Block: no spoofed blocker; blocked party cannot see the block, message, read history or rediscover the blocker | passed | Live |
| Report and moderation case invisible to the reported user | passed | Live |
| Removal for the night cuts the removed user's access to matched partners | finding | SEC-005 (send, re-check-in, presence revival and room are correctly refused) |
| Admin: `admins` unreadable and not self-grantable; `am_i_admin` false; admin RPCs and tables refused | passed | Live: 9 RPCs, 9 tables |
| Admin accounts are strongly authenticated | finding | SEC-011 |
| Admin RPCs authorize before taking shared locks | finding | SEC-006 |
| Storage: all buckets private; no cross-user download, list, upload or overwrite; no public URL; no `anon` list | passed | Live on 4 buckets |
| Realtime: private topics (`participant:<uid>`, `founder-moderation`) refuse other users | passed | Live: `CHANNEL_ERROR` |
| Realtime: third party receives no row for other users' matches, messages or presence | passed | Live (inserts and updates) |
| Realtime: no information through public channels or `DELETE` events | finding | SEC-015 |
| Every `SECURITY DEFINER` function pins `search_path` | passed | Catalog: 0 without |
| Every `public` table has RLS enabled | passed | Catalog: 32 of 32 |
| No residual table privilege for `anon` | finding | SEC-017 |
| Deployed schema matches the migrations in `main` | finding | SEC-018 |
| Supabase security advisors | finding | Leaked-password protection off (SEC-011); `pg_net` in `public` and 40 policy-less `private` tables are expected (no API grant); 91 definer functions callable by `authenticated` reviewed by gate |

### Reservations, deposit and arrival

| Control | Result | Evidence |
| --- | --- | --- |
| Guest and worker launch RPCs not callable by `anon` or `authenticated`; launch tables not exposed | passed | Live: 42501 or not found on 9 functions and 6 tables; catalog: only `admin_*` and `launch_venue_night` executable by `authenticated`, each gated by `is_admin()` |
| Founder launch RPCs refuse a participant | passed | Live: "not authorized" |
| Stripe webhook: raw-body signature, tolerance, event treated as a wake-up and re-fetched, amount/currency/metadata compared to the stored snapshot, idempotent | passed | Code review; `test:launch-stripe` passes. Not verified live against Stripe |
| Price, currency and return URLs are server-owned; no open redirect | passed | Code review |
| No overbooking under concurrency | passed | Code review; `test:launch-reservations` passes |
| Capacity cannot be consumed without paying | finding | SEC-002 |
| One refund per reservation, exact amount, idempotent provider call, founder-only, actor re-checked in SQL | passed | Code review; `test:launch-operations` passes; live refusal of the refund route without an admin token (403) |
| Guest capability: 256-bit secrets, hashed at rest, sealed envelope, expiry; a UUID or email alone authorizes nothing | passed | Code review; `test:launch-guest` passes |
| Magic link token stays in the URL fragment; rotation on exchange | passed | Code review |
| Recovery and waitlist responses do not reveal whether an email is known | passed | Code review |
| Checkout creation does not reveal an existing reservation | finding | SEC-019 (accepted in the policy; listed for explicit sign-off) |
| Recovery mail cannot be used to mail third parties | finding | SEC-008 |
| QR: opaque secret, night-bound, founder-only verification, no guest self-arrival | passed | Code review; `test:launch-qr`, `test:launch-arrivals` pass |
| Cancellation deadline enforced server-side | passed | Code review |
| Worker route authentication: fails closed, constant-time | passed | Code review; live 401 in production |
| Live-mode payments impossible at this commit | passed | Code requires a sandbox key; production has no Stripe or launch secret configured (routes answer 503) |
| Deployed launch HTTP flow end to end (Stripe sandbox, mail) | not verified | Production has no launch configuration and previews are protected; covered only by the isolated harness |
| Rate limiting of guest routes | finding | SEC-002, SEC-019 |

### Next.js surfaces

| Control | Result | Evidence |
| --- | --- | --- |
| Every photo route validates the JWT server-side; storage keys are server-generated and owner-bound | passed | Code review; live 401 without a token |
| Upload tickets: HMAC, owner-bound, expiring, purpose-separated | passed | Code review |
| Pixel and decompression limits, single-frame, EXIF/GPS stripping | passed | Code review; repository photo suites |
| Declared type is checked before any decoder runs | finding | SEC-003 |
| Decoder library free of known memory-safety advisories | finding | SEC-003 |
| Abuse limits on photo, review and sign-in endpoints | finding | SEC-013 |
| Cleanup, email worker and webhook routes fail closed | passed | Live: 401, 401, 400 in production |
| Resend webhook: signature, tolerance, replay dedupe | passed | Code review |
| Unsubscribe token: 256-bit, hashed, non-enumerable, GET does not mutate | passed | Code review; live uniform `false` for an unknown token |
| Marketing subscription requires proof of address ownership | finding | SEC-009 |
| No XSS sink, no `select("*")`, no open redirect, no secret in the client bundle | passed | Code review (no `dangerouslySetInnerHTML`, `innerHTML` or `eval`; three `NEXT_PUBLIC_` values, none secret) |
| Debug and preview pages unreachable in production | passed | Live: 404 for both |
| Error disclosure | passed | Routes return fixed codes; no stack trace or database message observed |
| Security headers on all pages | finding | SEC-014 |
| HSTS | passed | Live: `max-age=63072000` on the custom domain |
| CSRF | not applicable | No cookie authentication; guest mutations also require exact `Origin` and JSON |
| Secret comparison and key separation | finding | SEC-020 |

### Infrastructure and supply chain

| Control | Result | Evidence |
| --- | --- | --- |
| No secret in git history (296 commits, all refs) | passed | Regex scan for 15 key classes; `.gitignore` covers env files |
| Lockfile integrity (registry only, sha512, core packages pinned) | passed | `package-lock.json` v3 |
| Production dependencies free of known advisories | finding | SEC-003, SEC-010 |
| CI: `pull_request` trigger, read-only token, no expression injection, no secret to forks, encrypted diagnostics | passed | Workflow review |
| Production isolated from development, CI and previews | finding | SEC-004 |
| Seed and fixture accounts cannot be used by outsiders | finding | SEC-007 |
| Repository protections (secret scanning, push protection, Dependabot, branch rules) | finding | SEC-012 |
| Preview deployments require authentication; fork protection on | passed | Vercel project settings |
| Stripe key on previews is a sandbox key | not verified | Values are sensitive and were not pulled; the local key is a sandbox key |
| Vercel firewall / WAF rules | not verified | Endpoint returned nothing usable |
| Repository and organization webhooks, organization rulesets | not verified | Token lacks `admin:repo_hook` and `admin:org` |
| Supabase Auth settings: rate limits, CAPTCHA, password policy, redirect allow-list | not verified | No management API access; only public settings were read (anonymous and email sign-up enabled) and one fact observed (anonymous sign-in works without a CAPTCHA token) |
| Supabase backups / PITR, log retention | not verified | Dashboard only |
| Resend tracking setting, sending quota, domain separation | not verified | No Resend access |
| Monitoring, recovery, incident process | finding | SEC-021 |

## Findings

Every finding: owner **unassigned** (founder triage), status **Open**, retest
**Pending**.

| ID | Severity | Title | Sub-issue |
| --- | --- | --- | --- |
| SEC-001 | High | Check-in needs no proof of presence | #364 |
| SEC-002 | High | Unpaid holds can exhaust an event's capacity | #365 |
| SEC-003 | High | Vulnerable `sharp` decoders reachable by mislabelled uploads | #366 |
| SEC-004 | High | No production isolation for the service-role key | #367 |
| SEC-005 | Medium | Removed participant keeps read access to matched partners | #368 |
| SEC-006 | Medium | Global like lock is taken before authorization | #369 |
| SEC-007 | Medium | Seed accounts accept repository-derived passwords | #370 |
| SEC-008 | Medium | Recovery mail can target arbitrary addresses without payment | #371 |
| SEC-009 | Medium | Marketing subscription has no proof of address ownership | #372 |
| SEC-010 | Medium | Next.js 16.2.9 is behind 20 published advisories | #373 |
| SEC-011 | Medium | Founder admin accounts are weakly protected | #374 |
| SEC-012 | Medium | Public repository without scanning or review enforcement | #375 |
| SEC-013 | Medium | No bot protection or quota on anonymous sessions and heavy routes | #376 |
| SEC-014 | Low | No global security headers | #377 |
| SEC-015 | Low | Realtime leaks through a public channel and `DELETE` events | #378 |
| SEC-016 | Low | Server-owned columns are writable by the client | #379 |
| SEC-017 | Low | Residual table privileges for `anon` and `authenticated` | #380 |
| SEC-018 | Low | Deployed schema drifts from `main` | #381 |
| SEC-019 | Low | Launch route hardening | #382 |
| SEC-020 | Low | Secret handling hygiene | #383 |
| SEC-021 | Info | Operational gaps before launch | #384 |

<a id="sec-001"></a>
### SEC-001 — Check-in needs no proof of presence (High)

- **Surface:** `public.check_in(p_venue_id)`, `venues_select_authenticated` policy
  (`using (true)`), `public.venue_night_state(p_venue_id)`, `public.room_candidates`.
- **Prerequisites:** an anonymous session and a completed profile. No link to the venue.
- **Impact:** anyone can enumerate every venue (38 rows visible to the test outsider,
  including address, live flag and test flag), read the live participant count of any
  night, check in from anywhere, and then receive first name, photo and bio of the
  people in that bar, like them, match and chat. A person who once scanned a venue's
  static QR keeps this ability every night. This defeats invariant 1 (Live) and gives a
  remote observer the location of identifiable women in real time (invariant 5).
- **Evidence (live, test venue):** the outsider identity saw zero candidates before
  `check_in`; `check_in` returned a presence row; `room_candidates` then returned the
  three checked-in test profiles with `id, first_name, bio, photo_url, checked_in_at,
  venue_night_id, like_token`.
- **Reproduction:** with a session that has a complete profile and has never been to
  the venue, select `id` from `venues`, call `check_in` with one id, then
  `room_candidates` with the same id.
- **Pilot decision (2026-11-16, `docs/decisions.md`):** option (a) below ships before
  the pilot, so a venue is reachable only by someone who already knows its slug.
  Remote check-in by such a person is accepted for the pilot night because both
  founders are in the room and can remove a participant. Option (b) is deferred until
  after the pilot and must be revisited before any night the founders do not attend.
  The finding stays open until (a) ships; its rating describes the state found.
- **Remediation options, cheapest first:**
  (a) restrict `venues` and `venue_night_state` to what a visitor of one slug needs, so
  venues cannot be enumerated; (b) require a venue-issued proof in `check_in`, such as a
  rotating or signed nonce carried by the QR displayed at the venue; (c) add coarse
  location or staff confirmation.
- **Regression test (pilot scope):** a participant session cannot list venues, and can
  read a venue and its night state only by presenting that venue's slug; founder admin
  tooling still lists venues. **After the pilot:** `check_in` without a valid venue
  proof is refused.
- **Confidence:** high (verified live).

<a id="sec-002"></a>
### SEC-002 — Unpaid holds can exhaust an event's capacity (High)

- **Surface:** `POST /api/launch/credentials`, `POST /api/launch/checkout` (create),
  `public.launch_http_allow`, `public.prepare_launch_checkout` /
  `create_launch_reservation` (`supabase/migrations/20261007000002_launch_stripe.sql`,
  `20261007000001_launch_reservations.sql`).
- **Prerequisites:** none beyond the public event page. No payment, no verified email.
- **Impact:** a hold counts against capacity for at least 30 minutes. Creating one
  costs two requests from a budget of 30 requests per 10 minutes per address, so one
  address sustains about 45 concurrent unpaid holds. At the planned capacity of about
  50, one or two addresses keep the event "full" for as long as they like. Real guests
  are sent to the waitlist, and each fake hold also locks the email it used.
- **Evidence (isolated PGlite with the real migrations):** capacity 12; 12 holds
  created with 26 limiter-approved requests from a single bucket; reported availability
  went from 12 to 0; the next genuine reservation was refused with "event full".
- **Reproduction:** against a test night, repeat "issue a credential, create a
  reservation with a fresh email" and stop before paying; watch `available` reach 0.
- **Not covered by the policy:** `docs/launch-reservation-policy.md` disclaims only
  distributed abuse; this needs a single address.
- **Recommended remediation:** cap concurrent unpaid holds per address bucket (1 or 2)
  inside `prepare_launch_checkout`; give creation its own small budget; add a bot
  challenge on creation; add a founder command to expire a hold and an alert when
  unpaid holds dominate capacity.
- **Regression test:** the next creation from one address is refused while its allowed
  number of unpaid holds is live; a paid reservation does not count against that cap.
- **Not verified:** the deployed HTTP path (no launch configuration in production) and
  whether Stripe leaves an abandoned 3-D Secure attempt in a state that never releases
  the hold, which would make this worse.
- **Confidence:** high for the mechanism.

<a id="sec-003"></a>
### SEC-003 — Vulnerable `sharp` decoders reachable by mislabelled uploads (High)

- **Surface:** `sharp` 0.34.5 (`package.json`); `lib/server/photo-validation.ts:15-17`;
  `lib/server/prepare-photo.ts`; `app/api/profile-photo/route.ts:93`.
- **Prerequisites:** an anonymous session.
- **Impact:** `npm audit --omit=dev` lists three High advisories for this version
  (GHSA-f88m-g3jw-g9cj in libvips, GHSA-rgj7-g3m4-5g8c in libheif, GHSA-wq5f-xc86-pv6w
  in librsvg). `validatePhotoContent` accepts a file by its declared MIME type, then
  calls `sharp(...).metadata()`, and only afterwards compares the decoded format. sharp
  picks the loader from the bytes, so a file declared `image/jpeg` reaches the SVG, GIF
  or HEIF loader first. Memory corruption inside the function process would expose the
  service-role key, which bypasses every RLS control in this report.
- **Evidence (local):** with the installed sharp, SVG bytes and GIF bytes passed under
  the same options returned `format = svg` and `format = gif`, proving the loader ran
  before the rejection. No `sharp.block(...)` call exists in `app/` or `lib/`.
- **Reproduction:** call `validatePhotoContent` with a `File` whose type is
  `image/jpeg` and whose bytes are a minimal SVG; observe that the rejection happens
  after `metadata()` returns.
- **Recommended remediation:** upgrade to sharp 0.35.5 or later and re-check the
  `outputFileTracingIncludes` list in `next.config.ts`. Independently, block the
  loaders the product never needs at module load, or check magic bytes before sharp
  sees the buffer.
- **Regression test:** SVG, GIF, TIFF and AVIF bytes under a JPEG, PNG or WebP MIME are
  rejected without invoking the decoder; existing photo and HEIC suites still pass.
- **Not verified:** practical exploitability on Vercel's runtime. No exploit was
  attempted.
- **Confidence:** high on reachability, medium on impact.

<a id="sec-004"></a>
### SEC-004 — No production isolation for the service-role key (High)

- **Surface:** Vercel environment (one Supabase URL shared by Preview and Production;
  a service-role key on Preview for all branches), GitHub Actions secret
  `E2E_SUPABASE_SERVICE_ROLE_KEY`, `.env.local` in seven local checkouts,
  `scripts/prepare-worktree.mjs`, every service-role script under `scripts/` and
  `tests/helpers/`.
- **Prerequisites:** push access, or a compromised dependency, CI run, developer
  machine or agent session.
- **Impact:** the database behind the production domain is also the development,
  E2E and demo database. Any branch build, CI job or local script runs with access that
  bypasses RLS on it. The E2E suites create and delete users there daily.
- **Evidence:** `vercel env ls` (names and targets only), GitHub secret names, script
  review. None of the service-role scripts checks which project it targets. That the
  key copies belong to one project is inferred from the shared URL and from the
  2026-09-14 decision, not from values.
- **Recommended remediation:** #280. Security exit conditions to add to it:
  the production service-role key exists only in Vercel Production; Preview and CI
  point only at the development project; all keys of the current project are rotated
  after the split; a shared guard refuses to run seed, QA and E2E tooling unless the
  target project is the expected development one; production is never seeded.
- **Regression test:** a logic test for the target guard (accepts the development
  project, refuses any other); preview and CI still pass against development.
- **Confidence:** high on configuration.

<a id="sec-005"></a>
### SEC-005 — Removed participant keeps read access to matched partners (Medium)

- **Surface:** `public.eject_from_venue`, `public.moderate_case` (`remove_for_night`),
  `public.match_presence_state`, `public.chat_partner_state`,
  `private.visible_profile_ids`, `matches_select_member`, `messages_select_member`.
- **Prerequisites:** a participant with a match who is then removed by a founder.
- **Impact:** removal closes presence and blocks sending and re-entry, but deletes no
  match and no read path tests `venue_ejections`. A person removed for harassment can
  keep polling whether the matched partner is still in the bar and keep reading the
  chat, name, bio and photo until the night closes.
- **Evidence (live):** after a real `eject_from_venue` by the temporary admin, the
  removed identity received `other_is_present = true` from `match_presence_state`, the
  partner card from `chat_partner_state`, the chat history, and the partner's profile
  row. Sending, `check_in`, clearing `left_at` and `room_candidates` were refused.
- **Recommended remediation:** delete the removed user's matches for that night inside
  the ejection (the block path already does this through
  `close_interactions_after_block`), or add a not-ejected predicate to the four read
  paths.
- **Regression test:** after an ejection, the removed identity gets nothing from
  `match_presence_state`, `chat_partner_state`, `messages` and the partner's `profiles`
  row.
- **Confidence:** high (verified live).

<a id="sec-006"></a>
### SEC-006 — Global like lock is taken before authorization (Medium)

- **Surface:** `private.lock_like_eligibility()` (one database-wide advisory lock);
  `public.moderate_case`, `public.eject_from_venue`,
  `public.require_profile_text_correction`; the `aaa_like_eligibility_lock` triggers on
  `presence`, `profiles` and `blocks`.
- **Prerequisites:** any anonymous session for the admin RPC path; a checked-in
  participant for the visibility-toggle path.
- **Impact:** the three admin RPCs take the exclusive lock and only then test
  `is_admin()`. `write_like` and `room_candidates` take the shared variant, so parallel
  unauthorized calls can queue like writes for every venue. Toggling
  `presence.is_visible` additionally fans an invalidation out to every co-present
  client, each of which refetches the room.
- **Evidence (catalog):** in the deployed `moderate_case` and `eject_from_venue`, the
  lock call precedes the `is_admin()` test. A participant call is correctly refused
  with "not authorized" (live), but only after the lock.
- **Not verified:** the practical slowdown. Load testing was excluded.
- **Recommended remediation:** authorize before locking in the admin RPCs; rate-limit
  visibility toggles; consider a per-night lock key instead of a global one.
- **Regression test:** a non-admin call to each admin RPC returns its refusal without
  acquiring the advisory lock.
- **Confidence:** high on the ordering, medium on impact.

<a id="sec-007"></a>
### SEC-007 — Seed accounts accept repository-derived passwords (Medium)

- **Surface:** `scripts/seed-test-venues.mjs:55-58,87`,
  `scripts/seed-demo-venue.mjs:67,92,378`; 64 seed users in the shared database.
- **Prerequisites:** reading the public repository.
- **Impact:** seed emails and passwords follow a fixed template published in the
  repository. An outsider can sign in as a seeded profile with a pre-approved photo,
  which skips onboarding and photo moderation. From there they can change that
  profile's bio, like, match, message, block and report inside the QA rooms and, by the
  same template, the outreach demo room; combined with SEC-001 they can check that
  profile into a real venue.
- **Evidence (live):** one password sign-in to a synthetic test-venue seed account
  succeeded with credentials derived from the repository (role `authenticated`,
  profile present, not admin, present in a test venue). The session was closed without
  a write. The demo room was not touched; its accounts use the same construction in
  code.
- **Recommended remediation:** random per-run passwords, or fixtures signed in through
  admin-generated sessions; rotate the existing seed passwords; never seed the
  production project.
- **Regression test:** a sign-in with the old template fails; seed, demo and QA
  commands still work.
- **Confidence:** high for test seeds, medium for demo seeds (code only).

<a id="sec-008"></a>
### SEC-008 — Recovery mail can target arbitrary addresses without payment (Medium)

- **Surface:** `public.request_launch_access`
  (`supabase/migrations/20261013000004_launch_guest_booking.sql:79-99`), lifecycle mail
  (`20261017000001_launch_lifecycle_mail.sql:75-89`), `POST /api/launch/access`.
- **Prerequisites:** none. The reservation email is unverified by design.
- **Impact:** an attacker creates an unpaid hold with a victim's address and then
  requests recovery mail repeatedly. The cap is ten mails per reservation per day, and
  a new hold after expiry gets a new budget. The victim receives "open my reservation"
  messages from a dating-event sender; provider quota spent this way can starve the
  confirmation mails that carry the QR.
- **Evidence:** code review; the selection includes state `holding` and the recovery
  kind has no payment condition.
- **Not verified:** actual delivery and provider quota (mail is production-gated).
- **Recommended remediation:** send recovery mail only for a paid reservation, or at
  most once per unpaid hold; add a per-recipient cap across reservations and a global
  daily ceiling with an alert.
- **Regression test:** `request_launch_access` on an unpaid hold queues at most one
  mail; a second hold for the same address does not reset the budget.
- **Confidence:** medium (code only).

<a id="sec-009"></a>
### SEC-009 — Marketing subscription has no proof of address ownership (Medium)

- **Surface:** `POST /api/email/subscribe`, `public.subscribe_to_marketing_email`
  (`supabase/migrations/20260930170320_current_email_consent_versions.sql:18-83`).
- **Prerequisites:** an anonymous session; production mail delivery enabled.
- **Impact:** any session can subscribe someone else's address. The only throttle is
  five deliveries per hour per user id, and sessions are free, so welcome mail can be
  sent to third parties at will and consent is recorded for people who never gave it.
- **Context:** single opt-in is a recorded decision (`docs/decisions.md:291`). That
  decision does not address third-party abuse or the evidential value of the consent
  record.
- **Not verified:** live sending.
- **Recommended remediation:** a per-recipient cap inside the RPC (for example one
  welcome mail per address per day), and either a confirmation step before the address
  is used for campaigns or an explicit acceptance of the residual risk.
- **Regression test:** a second subscription of the same address from another session
  within the window creates no delivery.
- **Confidence:** medium (code only).

<a id="sec-010"></a>
### SEC-010 — Next.js 16.2.9 is behind 20 published advisories (Medium)

- **Surface:** `package.json` (`next` and `eslint-config-next` 16.2.9; fixed in 16.4.6).
- **Impact:** the advisories include remote code execution in `use cache`, `next/og` and
  the Image Optimization API, denial of service in Server Actions, and a proxy bypass.
  By code inspection the application uses no Server Action, no `use cache`, no
  `next/og`, no rewrite and no i18n routing, and `proxy.ts` carries no authorization.
- **Not verified:** whether `/_next/image` is served by the hosting platform's
  optimizer rather than the bundled code path named in three advisories; the
  cache-confusion advisories.
- **Recommended remediation:** upgrade both packages before launch, reading the
  upgrade notes in `node_modules/next/dist/docs/` as `AGENTS.md` requires.
- **Regression test:** the full hosted gate and a preview inspection after the upgrade;
  `npm audit --omit=dev` reports no advisory for `next`.
- **Confidence:** high on versions, medium on non-applicability.

<a id="sec-011"></a>
### SEC-011 — Founder admin accounts are weakly protected (Medium)

- **Surface:** Supabase Auth settings, `private.is_admin()`, `public.admins`.
- **Impact:** a founder account controls moderation, ejections, reports, reservation
  data, arrivals and refunds. Four weaknesses add up:
  1. No admin has a verified MFA factor, and `is_admin()` does not require one.
  2. Leaked-password protection is disabled (Supabase advisor), and the 12-character
     minimum exists only in the client.
  3. Public email sign-up is open on the same Auth instance although only founders use
     passwords.
  4. `admins` holds four stale rows for E2E fixture users created between 2026-10-07
     and 2026-11-06, left behind by interrupted test runs. Their passwords are random,
     so they are not directly usable, but the table should contain founders only.
- **Evidence:** advisor output; public Auth settings; catalog counts (two real-domain
  admins, four stale fixture admins, zero verified MFA factors).
- **Recommended remediation:** enrol TOTP for both founders and require `aal2` in
  `is_admin()`; enable leaked-password protection and a server-side minimum length;
  disable public email sign-up; delete the stale fixture rows and make fixture cleanup
  remove `admins` rows before anything else.
- **Regression test:** an admin session without a second factor is refused by an admin
  RPC; a catalog check finds no `admins` row tagged as a fixture.
- **Confidence:** high.

<a id="sec-012"></a>
### SEC-012 — Public repository without scanning or review enforcement (Medium)

- **Surface:** GitHub repository settings; ruleset "Required PR tests".
- **Impact:** the repository is public by decision (2026-09-22). Secret scanning, push
  protection, Dependabot alerts and updates, and private vulnerability reporting are
  all disabled, so a committed key would be public at once with no alert, and SEC-003
  and SEC-010 went unflagged. `main` is guarded only by two status checks that the
  admin role may bypass; there is no review, force-push or deletion rule, and a pull
  request can edit the workflow that produces the required checks. `main` deploys to
  production.
- **Evidence:** `security_and_analysis` shows every feature disabled; the ruleset has a
  single `required_status_checks` rule with an admin bypass.
- **Recommended remediation:** enable secret scanning, push protection, Dependabot
  alerts and security updates, and private vulnerability reporting (free for public
  repositories); add a minimal `dependabot.yml`; add pull-request review,
  non-fast-forward and deletion rules; restrict merges to squash; add `CODEOWNERS` for
  `.github/` and `supabase/migrations/`.
- **Regression test:** the settings API reports the features enabled; a test pull
  request cannot merge without approval.
- **Confidence:** high.

<a id="sec-013"></a>
### SEC-013 — No bot protection or quota on anonymous sessions and heavy routes (Medium)

- **Surface:** Supabase anonymous sign-in; `/api/profile-photo/prepare`, `/upload`,
  `/review`; `write_like` receipts, `track_analytics_event`, `record_venue_scan`,
  `blocks`.
- **Impact:** anonymous sessions are free and need no CAPTCHA (observed live), and
  every per-user limit in the application is therefore per free identity.
  - HEIC decoding allows two concurrent decodes per instance, up to 20 seconds each;
    two looping sessions can block iPhone onboarding during a night.
  - Upload tickets for 20 MB staging objects are unlimited.
  - `POST /api/profile-photo/review` is a public route with no client caller; when the
    review flag is on, each call is a paid vision request with no quota. The flag is
    currently off in production (live).
  - Several RPCs accept unbounded writes per user.
- **Not verified:** Supabase Auth rate limits; any platform firewall rule.
- **Recommended remediation:** CAPTCHA on anonymous sign-in; per-user counters in the
  database for tickets and staging objects; remove the public `POST` handler of the
  review route and keep the logic server-internal; bound the analytics and receipt
  writes.
- **Regression test:** the request after the allowed number in a window returns 429;
  `POST /api/profile-photo/review` returns 404 or 405 while publication still rejects a
  disapproved image.
- **Confidence:** medium.

<a id="sec-014"></a>
### SEC-014 — No global security headers (Low)

- **Surface:** `next.config.ts` sets headers only for `/events/*` and
  `/reservations/*`.
- **Evidence (live, production):** `/`, `/admin` and `/v/<slug>` return no
  Content-Security-Policy, no frame restriction, no `X-Content-Type-Options`, no
  Referrer-Policy and no Permissions-Policy. HSTS is present. `X-Powered-By` is sent.
- **Impact:** defense in depth. Founder and participant sessions share one origin and
  live in browser storage; no XSS sink exists today, but nothing would contain one.
  `/admin` is frameable.
- **Recommended remediation:** global `headers()` with `frame-ancestors 'none'`,
  `nosniff`, a strict referrer policy, a Permissions-Policy that keeps the camera for
  the arrival scanner, and a CSP started in report-only mode.
- **Regression test:** a Playwright assertion on the response headers of `/`, `/admin`
  and a venue page.

<a id="sec-015"></a>
### SEC-015 — Realtime leaks through a public channel and `DELETE` events (Low)

- **Surface:** `app/chat/[matchId]/page.tsx:580-592, 841-848` (channel
  `messages-<matchId>` without `private: true`); `postgres_changes` on `matches`,
  `messages` and `presence`.
- **Evidence (live):** a third identity that knew the match id subscribed to the chat
  channel and received the typing broadcast. The same identity also received `DELETE`
  events carrying the primary keys of other users' `matches`, `messages` and `presence`
  rows from unrelated activity in the database.
- **Impact:** typing state can be read or forged by anyone holding a match id, which a
  blocked former partner does. Deleted-row keys reveal activity volume and timing
  across all venues, without identities.
- **Recommended remediation:** make the chat channel private with a Realtime
  authorization policy limited to current match members; move the typing gate to the
  server; for deletes, rely on the existing private `participant:<uid>` invalidation
  topic instead of raw `DELETE` events.
- **Regression test:** a non-member subscription to the chat channel ends in
  `CHANNEL_ERROR`; a third party receives no event when another pair's match is
  deleted.

<a id="sec-016"></a>
### SEC-016 — Server-owned columns are writable by the client (Low)

- **Evidence (live):**
  - `messages.created_at`: an insert dated 2020 was stored as sent.
  - `profile_private.adult_confirmed_at`: an upsert dated 2001 was stored as sent.
  - `presence.last_seen_at`: an update dated 2099 was stored as sent.
- **Impact:** message order and timestamps can be falsified inside one's own match;
  the adulthood attestation timestamp has no evidential value; a client can look
  recently active forever.
- **Recommended remediation:** column-level `INSERT` on `messages` limited to
  `id, match_id, sender_id, body`; triggers that force `adult_confirmed_at` and
  `last_seen_at` to the server clock.
- **Regression test:** each of the three writes results in a server timestamp or a
  refusal.

<a id="sec-017"></a>
### SEC-017 — Residual table privileges for `anon` and `authenticated` (Low)

- **Evidence (catalog):** `anon` holds `TRUNCATE` on 7 `public` tables and
  `authenticated` on 17, including `admins`, `profiles`, `messages` and `reports`. The
  default ACL of the migration role grants `TRUNCATE`, `REFERENCES`, `TRIGGER` and
  `MAINTAIN` on every new table to both roles.
- **Impact:** not reachable through PostgREST today (no SQL surface, no GraphQL
  extension), and RLS does not guard `TRUNCATE`. It contradicts the "anon gets nothing"
  rule and would become serious with any future SQL-capable surface.
- **Recommended remediation:** revoke these four privileges on all `public` tables from
  both roles and change the default privileges so new tables start with none.
- **Regression test:** a catalog assertion that neither role holds `TRUNCATE` on any
  `public` table.

<a id="sec-018"></a>
### SEC-018 — Deployed schema drifts from `main` (Low)

- **Evidence (catalog and git):** the remote history contains
  `admin_email_campaigns`, which exists only on an unmerged branch; its two tables and
  about ten functions are deployed (service-role only). Seven migration files in `main`
  have no remote history row, although the effects checked are present. The admin
  client subscribes to `venue_nights` changes, but that table is not in the Realtime
  publication.
- **Impact:** unreviewed `SECURITY DEFINER` code handling email audiences is live, and
  the production project created for #280 cannot be rebuilt faithfully from `main`.
- **Recommended remediation:** merge or drop the campaign objects; reconcile the
  history table; build the #280 project from migrations only and diff it against the
  current one.
- **Regression test:** a catalog-versus-migrations comparison in the #280 runbook.

<a id="sec-019"></a>
### SEC-019 — Launch route hardening (Low)

Grouped by component; none allows a payment or data bypass.

- **Reservation-existence oracle.** Creating a checkout with someone's email answers
  409 only if that person holds a reservation for the night. The policy acknowledges it
  (`docs/launch-reservation-policy.md:891`); it reveals that a named person booked a
  dating event and deserves an explicit acceptance in `docs/decisions.md` or a uniform
  response.
- **Provider call before authorization.** On resume, the Stripe account lookup runs
  before the ownership check (`app/api/launch/checkout/route.ts:43` then `:52`), and
  each unbound capability gets its own budget.
- **One shared address budget.** Availability polling, credentials, creation, recovery
  and waitlist share 30 requests per 10 minutes per address, so one person behind a
  shared network (the bar's Wi-Fi) can lock everyone else out for 10 minutes.
- **Arrival QR survives an email correction.** The mailbox that first received the
  confirmation keeps a working QR; the refund still goes to the payer's card.
- **Key reuse.** `LAUNCH_SECRET_KEY` seals capabilities and keys the limiter HMAC.
- **Dead service RPCs.** `cancel_launch_reservation`,
  `find_launch_reservations_for_delivery` and `read_launch_delivery` have no caller.
- **No dispute handling.** No `charge.dispute.*` event is consumed.
- **Go-live change.** Live mode is rejected in six places today. The switch must become
  "mode equals the configured mode" everywhere, not a removal of the checks.
- **Regression tests:** resume with an unbound capability makes no provider call;
  availability polling does not consume the mutation budget.

<a id="sec-020"></a>
### SEC-020 — Secret handling hygiene (Low)

- The photo ticket HMAC is keyed with the Supabase service-role key
  (`app/api/profile-photo/upload/route.ts:16`, `prepare/route.ts:36,41`,
  `route.ts:55`). Use a dedicated secret.
- `EMAIL_WORKER_SECRET` is compared with `!==`
  (`app/api/email/process/route.ts:10`); the other worker routes use a constant-time
  comparison.
- The service-role key is in the legacy JWT format and is copied to at least nine
  places; no rotation procedure is documented.
- `lib/server/photo-*.ts` and neighbours lack the `server-only` guard (no client import
  exists today).
- **Regression tests:** unit tests for the comparison helper and for ticket
  verification under the new secret.

<a id="sec-021"></a>
### SEC-021 — Operational gaps before launch (Info)

- No error tracking, alerting or log drain; `app/api` and `lib/server` log nothing, so
  there is no server-side trail of failures or abuse.
- No documented backup and restore test, incident runbook, secret-rotation procedure or
  access list.
- Vercel is on the Hobby plan with a single owner identity shared by both founders: no
  per-person audit trail, a single point of lockout, and a possible conflict between
  paid reservations and the plan's terms (terms not re-read during the audit).
- Preview environment entries remain for deleted branches (Stripe, launch and mail
  secrets); 17 remote branches; branch auto-delete is off.
- CI actions are pinned by tag, not by commit; the hosting runtime uses Node 24 while
  CI and `.nvmrc` use 22.
- No `SECURITY.md` or disclosure contact for a public repository.

## Open questions

1. **Public visibility of this report.** The repository is public, so this report and
   the sub-issues disclose unfixed weaknesses. Reproductions were kept to mechanisms,
   but the founders should decide whether to keep the pull request open, or move the
   detail to a private security advisory until SEC-001 to SEC-003 are fixed.
2. **SEC-001** was decided on 2026-11-16 (see the finding and `docs/decisions.md`).
   Still open: the slug of a venue is printed in its static QR, so anyone who scanned
   it once keeps remote access on later nights. That is the accepted residual risk for
   the pilot, not a solved problem.
3. **SEC-002** is rated High because it can stop the one launch event at no cost. If
   the founders consider manual monitoring sufficient for a single event, record that
   acceptance.
4. **Vercel plan** (SEC-021): staying on Hobby for a paid launch is a business call.
5. **Four stale fixture rows in `admins`** (SEC-011) were left untouched: the audit
   deletes only what it created.

## Final summary

**Verified against the deployed database or application**

- The discreet double opt-in holds: a like is invisible to its target by rows, by room
  content and by room order; likes and matches cannot be written directly; a match
  appears only on mutuality.
- There is no open messaging: every attempt to write outside one's own live match was
  refused by RLS.
- Profile, private, email, photo, report, block and moderation data are isolated
  between identities; Storage is private in all four buckets; private Realtime topics
  refuse other users.
- The admin boundary holds against participants: `admins` cannot be read or
  self-granted and every admin RPC and table probed was refused.
- Launch tables and guest RPCs are unreachable from `anon` and `authenticated`.
- Service routes fail closed in production; debug pages are unreachable.
- The weaknesses in SEC-001, SEC-005, SEC-007, SEC-015 and SEC-016 are real on the
  deployed database.

**Verified in isolation only** (real migrations or real library, not the deployment)

- SEC-002 hold exhaustion (PGlite) and SEC-003 loader reachability (local sharp).
- The reservation, Stripe reconciliation, refund, guest access, QR and arrival
  controls, through the repository's own suites at the audited commit.

**Assumed from code or catalog, not exercised**

- Webhook signature handling against real Stripe and Resend deliveries.
- The deployed launch HTTP flow, mail delivery and its quotas (SEC-008, SEC-009).
- The practical effect of SEC-006 under load and of SEC-003 on the hosting runtime.
- That the service-role key copies in CI, previews and worktrees belong to the same
  project (SEC-004).
- About 220 of the 276 function bodies were compared with the migrations by name only.

**Not verified, and why**

- Supabase Auth settings, backups and log retention: no management API or dashboard
  access.
- Vercel firewall, GitHub webhooks and organization rulesets: insufficient token scope.
- Resend configuration: no access.
- Preview deployments: behind Vercel authentication.
- Anything requiring load, a real payment or a third party's systems: excluded.
- The `demo` venue: excluded by instruction.
