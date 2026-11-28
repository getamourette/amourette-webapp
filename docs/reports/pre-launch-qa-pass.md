# Pre-launch QA pass (#48)

Run on 2026-11-28, before the first public night (2026-12-10). Release candidate:
`main` at `7e415c2` (#612). Everything below ran against disposable CI stacks or the
development project; nothing touched production, and Stripe ran in test mode only.

## Evidence

- **Full browser suite, both engines, on the release candidate:** CI run 46173048966
  (manual dispatch on `main`, full scope).
  - Chromium mobile (Pixel 7): 608 passed, 0 failed, 0 flaky.
  - Safari WebKit (iPhone 15): 579 passed, 0 failed, 26 skipped, 3 flaky (passed on
    retry). The skips are the stated ones: 21 simulated-camera door tests, one
    native-date keyboard test, the camera-permission test, one Chromium-only photo
    draft shape, and the two WebKit quarantines (#590, #594).
  - The three WebKit retries did not reproduce locally (24 WebKit runs, all green) and
    the nightly run earlier the same day had none. They are added to #530, which
    tracks WebKit tests that pass only on retry.
- **Real Stripe test-mode Checkout:** `scripts/test-launch-channel-journey.mjs`, run
  locally on Chromium: leave Checkout, resume, pay with the 4242 card, return to
  the reservation page, reservation confirmed. PASS.
- **Legacy `paramour-*` keys (#58):** new `tests/room/legacy-storage.spec.ts`, green on
  both engines locally; shown red for each key when the value is seeded under
  another name.
- **Stuck "Amourette" screen (2026-10-23 note, #244):** a probe did six rounds of
  room → chat → back, room → profile → back and forward/back on both engines. It never
  stuck: the room came back in 1.3 to 2.2 s each time. Not reproduced, so no test was
  added.

## Journeys

`Test` = covered by a browser test that ran in the run above. `Logic` = covered by a
logic or SQL test in `npm run test:logic`. `Run` = played by the agent this pass.
`Phone` = left to the real-phone list below.

| Journey | Chromium | Safari WebKit | Covered by | Gap or defect |
| --- | --- | --- | --- | --- |
| Landing page, next-night ticket, waitlist, legal pages | Test | Test | `onboarding/landing*.spec`, `legal-pages`, `privacy-policy` | |
| Reservation form, consent, hand-off to Stripe | Test | Test | `reservations/booking.spec` (Stripe stubbed) | |
| Deposit paid on real Stripe test Checkout | Run | Not verified | `scripts/test-launch-channel-journey.mjs` | The script drives Chromium only; Apple Pay and live card in Phone list |
| Confirmation email content and private QR | Test + Logic | Test | `api/reservation-qr.spec`, `test-launch-mail`, `test-email-ui` | Delivery to a real inbox not verified (#542, #489) |
| Door: scan the QR in the founder admin | Test | Phone | `admin/door-scan`, `admin/arrival-operations` | Simulated camera cannot run on WebKit; scanner margin tracked in #484 |
| Door: manual lookup and confirm arrival | Test | Test | `admin/tonight`, `admin/arrival-operations` | |
| Profile creation at the door (photo, HEIC, consent) | Test | Test | `profile/door-onboarding`, `onboarding-flow`, `photo-*`, `heic-*` | Real camera and photo picker in Phone list |
| Profile edit | Test | Test | `profile/editor-back`, `preference-edits-ui`, `recrop-*`, `text-corrections-ui` | |
| Room: entry, feed, presence, recovery | Test | Test | `onboarding/first-entry-feed`, `room/*` | One WebKit retry (`empty-room-matches`), #530 |
| Discreet like and mutual match | Test + Logic | Test | `onboarding/arrival-to-chat`, `room/like-receipt`, `match-chat/*`, `test-like-sql` | |
| Chat: delivery, retry, typing, presence | Test | Test | `match-chat/chat.spec`, `chat-load-retry` | Chat preview journey quarantined on WebKit (#594) |
| Report and block | Test | Test | `room/report-anyone`, `match-chat/chat.spec`, `moderation/*` | |
| End of night: room and chat close, end time shown | Test + Logic | Partial | `profile/chat-preview` (venue lifecycle), `room/night-end-time`, `test-venue-night-lifecycle` | The closed-night browser steps live in the journey quarantined on WebKit (#594) |
| Founder admin on the night (Tonight, night page, reservations, removal, moderation queue, 2FA) | Test | Test | `admin/*`, `moderation/*` | Venue details focus quarantined on WebKit (#590) |
| Legacy `paramour-*` browser keys | Test | Test | `room/legacy-storage.spec` | |

No new product defect was found in this pass. Known open items that touch these
journeys stay with their issues: #607 (font spacing), #590, #594, #530, #484, #542.

## Real-phone list

Only what no automated test can prove. Owner: Marwane, on site at Amalgam before
2026-12-10, in one visit.

1. Door phone (iPhone, Safari, admin Tonight → Scan): scan a test reservation QR shown on
   another phone in the entrance light; green verdict in under 3 s, then Confirm arrival.
2. Same scan from the confirmation email opened in a mail app, at normal screen brightness (#484).
3. A guest phone scans the venue QR with the native camera app (iPhone, then Android): the room opens.
4. Profile photo: take one with the camera, then pick one from the library (HEIC on iPhone); crop and save.
5. Weakest network spot in the bar (basement, toilets): like someone and send a chat
   message; it arrives, or shows the retry and succeeds once back in range.
6. Chat keyboard on iPhone Safari and Android Chrome: the field and the last message stay
   visible above the keyboard.
7. Lock the phone for two minutes in an open chat, then unlock: new messages and the unread
   badge appear without reloading (there are no push notifications).
8. Add the site to the iPhone home screen, close it, reopen it: still signed in and back in the room.
9. Apple Pay and a real card on the live Stripe account, then the refund (#533).
