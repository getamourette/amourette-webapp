# Server quotas bound free anonymous sessions; CAPTCHA stays deferred

**Date:** 2026-11-25 · **Issue:** #376 (SEC-013)

## Decision

1. **Per-account quotas in the database**, with no step added to the guest's
   path: 30 photo upload permissions per hour and none while 10 staging objects
   wait; 500 like request receipts per participant per night; 120 analytics
   events per hour. Over quota, the photo routes answer 429. When the optional paid review is on, each
   publication claims a permission too, so a refused photo cannot be resubmitted
   for review without bound.
2. **The public `POST /api/profile-photo/review` route is removed.** It had no
   client caller and each call was a paid vision request when the review flag is
   on. The review is a server module that only publication calls.
3. **CAPTCHA on anonymous sign-in is not added in this change.** The decision of
   2026-11-19 (`docs/decisions.md`, risk accepted until the week after the first
   night) stands; it is proposed to the founder separately (see below).

## Why

Anonymous sessions are free, so any limit keyed on a user id is a limit per free
identity. The quotas do not stop someone creating many sessions, but they bound
what each session costs: 20 MB staging objects, HEIC conversions (each needs an
upload permission), and rows that otherwise grow until the night ends. Supabase
already caps anonymous sign-ins at 300 per hour per address, so the total is
bounded too. The values sit far above what one guest does in a night: a few photo
choices, at most a few dozen likes.

A CAPTCHA on the entry path is the only control that addresses session creation
itself, but it is friction (or a risk of friction) for the guest scanning at the
door, and every option needs an external account: Cloudflare Turnstile (free,
invisible in most cases, configured in Supabase Auth with a Cloudflare account)
or hCaptcha (free tier, more visible challenges). That is a founder choice, not
part of this change.

## Rejected

- **Per-IP limits in the application.** Guests of one venue share the venue
  Wi-Fi or a carrier NAT; an address limit would refuse real guests first.
  Supabase's sign-in limit already covers the address dimension.
- **Revoking `track_analytics_event`.** Bounding it keeps the option to use it
  without reopening the hole.
