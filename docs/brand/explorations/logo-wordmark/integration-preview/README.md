# Logo integration preview — issue #39

Alignment review completed on September 8, 2026; final PR delivery is
authorized. These captures record the pre-delivery implementation. The PR
and project board own publication status. Physical shortcut checks remain pending.

## Alignment update

The current `index.html` compares the first integration with the updated
artwork alignment: 52 matched pairs (23 states at each mobile width and six
desktop states). `initial.html` preserves the original checkpoint comparison;
all its screenshots remain intact. The additional states show the first-entry
reminder and the email invitation, reached with an accelerated test clock.

The visible A now aligns with adjacent text on the room, waiting room,
profile editor, age confirmation, email preferences, admin and password-reset
headers, plus the two room dialogs. The full canvas moves into existing
outside space by its supplied left margin; it is not cropped or resized.
Centered compositions keep their axis. `aligned.json` records the new capture
geometry; `after.json` retains the first integration for comparison.

## What is captured

The gallery compares the real Next.js production renderer before integration
(checkpoint `4c7c9a8758f164be1197ba553c3716c36f8a28ce`) and the local implementation.
The initial gallery contains 48 matched pairs: 21 states at 390 × 844 and 320 × 740, plus six
representative desktop states at 1280 × 900. Images are full-page captures;
long forms extend below the viewport. Click either image to inspect its PNG.

All personal and venue states are simulated. The existing illustrated test
portraits, profile names, biography, long venue name, room count, presence and
conversation are synthetic. The match reveal is reached by clicking the real
like control and returning a mocked match. No React state or page DOM is
replaced to manufacture a screen. The unsubscribe route shows the real
service-unavailable state against the fictitious backend.

The screenshot harness uses isolated browser contexts and intercepts the
fictitious `https://logo-preview.invalid` Supabase hostname. It aborts other
external browser requests, closes WebSocket attempts, and fails on unexpected
API requests. The build also uses that fictitious hostname, so server rendering
cannot contact the shared Supabase project. No fixture reset, real sign-in,
scan record, check-in, like, match, subscription or message is written.

Captures use Chromium, English, device scale factor 1 and reduced motion.
They validate layout, not physical iOS keyboard behavior or installed shortcut
selection. Existing onboarding and chat source files remain unchanged.

## Review details

- New visitor: complete vertical B1 + More presence signature, ruby.
- Returning visitor: ruby wordmark, with profile and active conversation.
- Existing in-app brand positions: cream wordmark at 192px whole-file width.
- Profile/age headers wrap the language control when necessary. At widths below
  360px, the waiting room reserves a separate line for its fixed language control.
- Admin uses a cream wordmark on a small velvet backing because its existing
  header is light. This treatment retains the approved cream usage on the light admin header.
- Public loading/error marks reserve the welcome canvas. Existing centered
  gate layouts and their content transitions remain; the intrinsic image
  dimensions prevent additional layout shifts while SVG files load.
- The favicon and touch-icon files are unchanged F1 and B1 exports respectively.
  No web app manifest, service worker, PWA or store configuration is added.
  Actual shortcut selection and masking remain a physical-device check.

## Reproduce the historical after captures

Use integration commit `78ee866` for the historical `aligned` phase.
From the repository root, build and start a dedicated local server with fake
public Supabase configuration (these values override `.env.local`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://logo-preview.invalid NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=preview-only-not-a-real-key npm run build
NEXT_PUBLIC_SUPABASE_URL=https://logo-preview.invalid NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=preview-only-not-a-real-key npm run start -- --hostname 127.0.0.1 --port 3100
```

In a second terminal:

```bash
node tests/brand/capture.mjs aligned
node tests/brand/verify.mjs
node tests/brand/gallery.mjs
```

The `before` captures were taken from the checkpoint's compiled application
before integration. Do not overwrite them by running `capture.mjs before`
against the integrated app. This standalone harness does not load the chat
suite's shared-database setup. `before.json`, `after.json` and `aligned.json` record routes,
viewport sizes, text samples, overflow results and rendered logo dimensions.

## Verification

`npm run lint` and `npm run build` pass. The capture harness checks full-file
logo minimums, viewport bounds, horizontal overflow and the visible A
position relative to the neighboring text block. It also checks the
room menu, non-interactive brand elements, room gesture pass-through, language
menu access/focus restoration, profile field focus, onboarding's absence of
branding, and match CTA visibility. The separate verification script checks
served asset bytes, icon metadata and ordinary/reduced-motion loading rules.

All 39 files listed by the v1 manifest retain their expected SHA-256 hashes.
Existing graphic sources and exploration files are unchanged. Only this new
gallery folder is copied into the existing preview service's `round-04/` tree;
the service configuration and root redirect remain unchanged.

Accessible gallery:
`http://100.100.155.8:8079/round-04/integration-preview/`.

The original capture pass performed no Git publication or shared-data mutation.
Marwane subsequently approved the alignment and requested final PR delivery.
Merging and physical phone-shortcut validation remain separate.

## Deployed final-delivery inspection

The final branch incorporates upstream corrections #224, #225 and #239:
the returning landing has no chat links, the first-entry reminder has no
duplicate logo, and profile exits do not substitute a test venue. Historical
comparisons above deliberately retain the previously approved states.

The `preview` capture phase checks the current application. Set
`BRAND_PREVIEW_URL` to its confirmed Vercel deployment and load the matching
`NEXT_PUBLIC_SUPABASE_URL` (for example with Node's `--env-file=.env.local`).
Run `node tests/brand/capture.mjs preview` and `node tests/brand/verify.mjs`
with those variables. `BRAND_CAPTURE_OUTPUT` can redirect captures outside
the repository. Real application assets come from Vercel; all browser
Supabase calls and WebSockets remain intercepted with synthetic data.
The unsubscribe route without a token renders the deployed invalid-link
state. Its server-side token-validation RPC is read-only; browser interception
does not replace this server call. It performs no subscription mutation.
