# Bar connectivity matrix

- Issue: #244 (initialization failures and unstable connectivity in bar journeys)
- Code: `main` at `3bd32ac` plus the pull request that adds this file
- Method: automated browser tests on Chromium mobile (Pixel 7 profile) and the
  non-blocking WebKit iPhone job in CI. Each test cuts or degrades the network at
  the real request (`route.abort('internetdisconnected')`, a 503, a request that
  never answers, or the browser's own offline switch) and closes Realtime, so only
  the action under test reloads data.
- Not done: testing on a physical phone on a real bar network, Wi-Fi to mobile
  data handover, and iOS background/resume. The `online` and `visibilitychange`
  recovery paths are exercised in the browser, not on a device.

Update this file when a journey's behavior under a bad network changes.

## Matrix

| Journey | Condition | Observed behavior | Test |
|---|---|---|---|
| Home page, first visit | Sign-in fails | "Couldn't load Amourette. Nothing was lost." with Try again; also retries when the network or the screen comes back | `tests/room/session-start-recovery.spec.ts` |
| QR entry, first scan | Sign-in fails | Room error screen with Retry and automatic retries | `tests/room/session-start-recovery.spec.ts` |
| QR entry, first scan | Sign-in never answers | Auth request gives up after 15 s (`lib/auth-request-timeout.ts`), then the Retry screen | `tests/room/session-start-recovery.spec.ts`, `scripts/test-auth-request-timeout.mts` |
| QR entry, returning guest | Token refresh fails on the network | "Reconnecting…", same identity, profile and match kept (#480, #529) | `tests/room/session-refresh.spec.ts`, `scripts/test-guest-session.mts` |
| QR entry, returning guest | Server revoked the session | Told the session ended; only the guest starts a new one (#529) | `tests/room/session-refresh.spec.ts` |
| QR entry | Venue, night or feed read fails | Retry button, automatic retry with backoff, on `online` and on screen return (#486, #554) | `tests/room/entry-recovery.spec.ts` |
| Room goes live | Every phone re-enters at once and one read fails | Re-entry spread over 1.5 s, room opens without a reload (#554) | `tests/room/entry-recovery.spec.ts` |
| Database read | Request hangs | Gives up after 15 s (`db.timeout`) and shows the screen's retry path (#554) | Not provoked in a browser (named on #554) |
| Onboarding | First profile read fails | Retry, never the empty wizard (#554) | `tests/profile/profile-load-retry.spec.ts` |
| Onboarding | Sign-in fails on the form | Retry | `tests/room/session-start-recovery.spec.ts` |
| Onboarding, photo | Converter busy | Automatic retry with a status, then a clear message (#548) | `tests/profile/door-onboarding.spec.ts` |
| Onboarding, save | Answer lost after the profile was created | Lands in the room instead of a 409 loop (#548) | `tests/profile/door-onboarding.spec.ts` |
| Onboarding, photo | Temporary upload failure | Photo recovers, draft kept | `tests/profile/photo-recovery.spec.ts`, `tests/profile/photo-draft-storage.spec.ts` |
| Room | Profile review read fails | Feed stays on screen (#554) | `tests/room/entry-recovery.spec.ts` |
| Room | Participant revision read fails | Only that read retries, with backoff (#554) | `tests/room/entry-recovery.spec.ts` |
| Like | Response lost after the server saved it | Server reread shows the saved like, no duplicate request, no invented match | `tests/match-chat/like-authorization.spec.ts` |
| Like | Room reread fails after a like | Last confirmed state, "Check again" | `tests/match-chat/like-authorization.spec.ts`, `tests/room/like-receipt.spec.ts` |
| Chat | Opening fails | Retry, unsent message kept (#554) | `tests/match-chat/chat-load-retry.spec.ts` |
| Chat | Send fails | Message marked failed; retry keeps the same id, one row | `tests/match-chat/chat.spec.ts`, `scripts/test-chat-delivery.ts` |
| Block | Request cut | Error shown, person stays, next tap blocks once | `tests/room/safety-network.spec.ts` |
| Report | Request cut | Error shown, never "sent"; next tap sends once | `tests/room/safety-network.spec.ts` |

## Remaining gaps

- Physical device runs (iPhone Safari on a real bar network, background/resume,
  Wi-Fi to mobile data): not done; the browser tests above are the evidence.
- An Auth request that hangs during a background token refresh is bounded by the
  same 15 s timeout but is not provoked in a browser: it ends on the
  "Reconnecting…" path already tested with a refused network.
