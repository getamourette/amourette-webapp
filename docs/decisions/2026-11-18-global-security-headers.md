# Global security headers, CSP observed before it is enforced

Date: 2026-11-18 (#377, SEC-014)

Pages, API routes, static files and the responses built by `proxy.ts`
now carry HSTS, `nosniff`, a referrer policy, a Permissions-Policy, framing
protection and a Content Security Policy, set in `next.config.ts` from
`lib/security-headers.ts`. Redirects issued by the framework itself (such as a
trailing-slash redirect) are not covered.

- **The full CSP ships as `Content-Security-Policy-Report-Only`.** Why: it cannot
  be validated on real phones before the pilot, and a blocked photo, Realtime
  socket or script during a venue night costs more than a policy that only
  observes. The audit asked for report-only as the starting point.
- **Framing is blocked for real** with `X-Frame-Options: DENY` and an enforced
  `Content-Security-Policy: frame-ancestors 'none'`. Why: a report-only policy
  enforces nothing, so its `frame-ancestors` would not protect `/admin`, and
  nothing legitimate frames the app.
- **The observed policy allows inline scripts and styles.** Why: Next.js inlines
  its bootstrap scripts, and removing `'unsafe-inline'` needs a per-request nonce,
  which forces every page to render dynamically. That trade-off is decided when
  the policy is enforced, not now.
- **Allowed origins are derived from `NEXT_PUBLIC_SUPABASE_URL` at build time**
  (HTTPS for REST, Auth and Storage; WSS for Realtime). Why: preview, development
  and the future EU production project each get their own origin without a
  second setting. Stripe needs no entry: Checkout is a top-level navigation.
- **HSTS repeats the value the audit observed on the production domain**
  (`max-age=63072000`), without
  `includeSubDomains` or `preload`. Why: those commit every subdomain of
  `getamourette.com`, mail and tracking hosts included, and preload is slow to undo.
- **API routes get `Referrer-Policy: no-referrer` from the configuration.** Why:
  under `next start`, configured headers replace the ones a route handler sets
  (behavior on Vercel's router is checked on the preview), and several launch
  and unsubscribe handlers already relied on `no-referrer`; a global default would
  have silently weakened them. `tests/security/headers.spec.ts` guards this.
- **Still open:** where reports go (`CSP_REPORT_URI` is empty, so violations only
  reach the browser console), when to enforce the policy and whether to pay for
  nonces, and `includeSubDomains`/`preload` for HSTS.
