# Photo preparation and recrop measurements — #289

Date: 2026-10-08. Baseline application: `e68999a` (merged #288 plus timing
instrumentation). Fix branch: `fix/photo-preparation-recrop-delays`.

## Evidence boundary

The founder's approximately 10-second Files preparation and 9-second reopen
reports are estimates from an iPhone 13 Pro Max, with iOS 26.6.2 as supplied by
the tester. The exact source, delivered MIME, Safari version, network and whether
the second wait starts at Back or Recrop remain unavailable. Measurements below
use synthetic sources on macOS, not that physical iPhone. They identify costly
paths but do not claim to reproduce either device estimate exactly.

The benchmark source is a generated 3024×2016, genuine 10-bit Display P3 HEIC:
5,926,594 bytes, a gradient with deterministic high-frequency texture. It is a
6.1-megapixel stress input, not a camera photograph. Baseline normalized PNG:
30,527,918 bytes deployed (30,527,925 with local Sharp). Chromium mobile uses
the repository's Pixel 7 configuration; local Chromium/WebKit comparisons use
the iPhone 13 Pro Max viewport preset. Emulation does not establish phone speed.

## Baseline

Authenticated preview preparation used real private staging and isolated password
fixtures. No profile was published, migration applied or permanent QA room reset.
The preview was inspected with the documented `E2E_BASE_URL` workflow and the
project's existing automation credential scoped only to the application origin.

| Stage | First measured selection | Second measured selection |
| --- | ---: | ---: |
| Input-to-usable controls (automation wall time) | 32,726 ms | 33,688 ms |
| Session / upload permission | 226 ms | 443 ms |
| Original upload | 4,662 ms | 5,149 ms |
| Conversion request to response headers | 4,171 ms | 4,259 ms |
| Server staged-source download | 321 ms | 409 ms |
| Server conversion total | 3,666 ms | 3,716 ms |
| Worker/import startup | 104 ms | 110 ms |
| WASM module initialization | 119 ms | 114 ms |
| HEIC native decode | 1,190 ms | 1,201 ms |
| Native sample extraction | 708 ms | 727 ms |
| PNG encoding / rendering metadata | 1,328 ms | 1,365 ms |
| Normalized PNG body download | 22,645 ms | 22,493 ms |
| Browser Blob assembly | 15 ms | 18 ms |
| Cropper mount-to-usable | 473 ms | 472 ms |

These values overlap: server stages are contained in the conversion request and
conversion total. Do not sum all rows. Body transfer dominated this connection
(approximately 10.8 Mbit/s effective PNG throughput). Files-picker time before
the input change is outside the application timer.

Two successfully measured same-page reopens had prepared-Blob cache hits, no
preparation requests, and mount-to-ready times of 470 and 459 ms. The cropper
still allocated a fresh source URL, performed multiple image decode calls and
regenerated display PNGs. Browser decode measurements were approximately
186–351 ms per call, with overlapping calls; preview generation approximately
106–289 ms. Automation tap-to-ready was 1,892 and 1,005 ms, including action and
polling overhead. Repeated conversion was not the ordinary-reopen cause.

The baseline harness successfully recorded both preparations and two reopens,
then timed out attempting Recrop after the second confirmation advanced the
wizard to gender. This was a harness navigation error; all recorded operations
had reached enabled controls. The corrected harness goes Back after every
confirmation and awaits dialog dismissal. This partial measurement run is not
reported as a passing regression suite.

`X-Photo-Process-First-Request` was false on both measured conversion requests.
Worker startup is measured directly on every conversion. First route-module
invocation and request-to-header timing are available for new deployments, but
they do not separately prove a Vercel platform cold-start duration. No precise
platform cold-start claim is made without corresponding platform evidence.

## Changes and provisional targets

- Use adaptive PNG filtering at compression level 3. Filtering is lossless;
  original files, RGB ICC, 16-bit normalized samples, orientation, pixel/byte
  limits and native server crop outputs remain authoritative. The representative
  local PNG becomes 17,941,036 bytes: 41.2% fewer transfer bytes. Local conversion
  increases from 1.57–1.68 seconds to 1.99–2.21 seconds; this optimizes total
  network preparation, not CPU encoding speed.
- Retain the accepted source URL and decoded image across same-page recropping,
  and at most two recent display-preview promises. Failed work is evicted.
  The candidate has a separate lifetime and replaces the accepted source only
  after confirmation. Cancelled/invalid replacement preserves the accepted file,
  crops and rendering cache.
- Preserve owner/revision/version invalidation, correction-source reauthorization
  and page-scoped disposal. Successful IndexedDB restoration now retains its
  source URL even when it generates a separate portrait preview. The initial
  authentication subscription replacement cannot dispose another initialization
  operation's resources.
- Keep processing status accurate through decoding, crop restoration and required
  preview generation; cancellation remains available.

Under Aymane's delegated task approval, provisional verification targets are
at least 30% fewer response bytes, at least 20% lower complete preparation time
on the same representative connection, and warm cropper mount-to-ready below
150 ms on the measured desktop engines with zero repeated preparation/decode/
export work. The proposed reporting-device same-session recrop target is below
one second from tap to usable restored controls. Confirm the device target with
its real baseline before treating issue acceptance as complete.

The 4032×3024 synthetic 12.2-megapixel stress input previously exceeded the
unchanged 50 MiB normalized-output limit. The optimized full-resolution 16-bit
result is 34,718,863 bytes from an 11,689,536-byte HEIC; local conversion took
3,807 ms. No resizing or source-limit increase was used.

## Verification and reporting-device protocol

### Deployed comparison

The fixed application at `d413367` was measured on
`https://amourette-webapp-7tpz4nlbw-tothe-moon.vercel.app`, sequentially after the
baseline, on the same computer, connection, source and Chromium configuration.
Both selections and all four reopens completed successfully. Network variation
and the small sample prevent a percentile or universal speed claim.

| Stage | First fixed selection | Second fixed selection |
| --- | ---: | ---: |
| Input-to-usable controls (automation wall time) | 24,999 ms | 23,488 ms |
| Session / upload permission | 862 ms | 409 ms |
| Original upload | 4,971 ms | 5,023 ms |
| Conversion request to response headers | 5,119 ms | 4,912 ms |
| Server staged-source download | 539 ms | 601 ms |
| Server conversion total | 4,276 ms | 4,133 ms |
| Worker/import startup | 271 ms | 117 ms |
| WASM module initialization | 131 ms | 104 ms |
| HEIC native decode | 1,196 ms | 1,200 ms |
| Native sample extraction | 702 ms | 704 ms |
| PNG encoding / rendering metadata | 1,808 ms | 1,808 ms |
| Normalized PNG body download | 12,725 ms | 11,856 ms |
| Browser Blob assembly | 7 ms | 13 ms |
| First detached browser decode | 177 ms | 186 ms |
| Cropper mount-to-usable | 464 ms | 460 ms |

The deployed PNG is 17,941,029 bytes, 41.2% smaller. Mean body-download time is
45.5% lower and mean complete preparation wall time is 27.0% lower. Encoding is
slower, as expected; the smaller transfer more than offsets it on this connection.
The provisional 30% byte and 20% complete-preparation targets pass here.

All four fixed reopens reused the accepted source. Mount-to-ready was
26.5, 16.2, 23.2 and 16.2 ms; there were zero `prepare.*`, `crop.decode` or
`crop.preview` measures. Automation tap-to-enabled was 80, 412, 62 and 429 ms,
including action/polling delays. Cache ages were 152–633 ms. Both fixed conversion
requests again reported `firstProcessRequest=false`; worker startup is measured,
but platform cold-start duration remains unseparated.

A generated 3024×2016 JPEG comparison (2,051,639 bytes) needed no upload,
conversion or normalized download before cropping. Its two input-to-usable wall
times were 504 and 477 ms, with native browser decode 96 ms and cropper readiness
346 and 324 ms. Warm cropper readiness was 16–24 ms with zero preparation,
decode or export measures. This isolates the local-image path; it does not prove
what the iPhone Photos picker delivers, and JPEG is not a replacement for the
precision-preserving HEIC pipeline.

### Local browser engines and cache lifetime

Data-free local production runs mock transport only and use the full normalized
source. The first preparation includes mocked body transfer and is not a server
or network benchmark. Before/after cropper measurements use the same iPhone
viewport preset; desktop engines are not the reporting phone.

| Engine | Before first mount | Before warm mounts | After first mount | After warm mounts |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 456 ms | 468–484 ms | 444 ms | 16–18 ms |
| WebKit 26.5 | 659 ms | 295–401 ms | 680 ms | 16–21 ms |

Each fixed engine decoded once for first open, then reused decoded pixels and
display previews on immediate reopening. The 150 ms warm readiness target passes.
The final Chromium run was serialized after deployed tests. A later reopening
after a 15-second wait retained a 16,195 ms-old cache, reached readiness in 16 ms
and issued no preparation, decode or export work. Immediate tap wall times include
automation scheduling, so the application mount measure is reported separately.

The rendering cache has no clock expiry: its lifetime is the mounted page and
accepted source. Revision/version/account changes, replacement confirmation and
unmount release it. Cancellation preserves it. IndexedDB preserves the original
file and independent crops across reload, but the page must prepare/decode anew.
Browser regressions verify these boundaries and correction-source reauthorization.

### Regression and visual review

Existing HEIC logic checks compare native decoded samples, ICC, all eight
orientations, crop/recrop pixels and refusal/cancellation behavior. Existing large
draft and independent-framing browser assertions are retained. New browser
coverage checks warm decode reuse, cancellation after successful replacement,
cold-decode cancellation with late completion, exact source-URL reuse and no
additional preparation/download, together with existing revision/account checks.

All 17 focused browser regressions passed against the fixed Vercel preview:
`heic-photo`, `recrop-loading`, `recrop-source-loading`, `crop-zoom` and
`crop-interactions`. The route/source fixtures cover explicit slow/failure states;
the separate preparation benchmark uses real staging and conversion. Local HEIC
sample/ICC/orientation/crop/cancellation logic and photo-validation checks passed,
as did TypeScript, lint and production build. The final full hosted gate is
recorded in the PR and decision log after completion; draft PR browser skips are
not counted as browser coverage.

Agent visual review inspected actual deployed screenshots of first preparation,
warm reopened portrait crops, 320 px loading/ready/error states, independent round
crops and EN/FR/ES previews. Cancellation and confirmation remain reachable;
processing/error text and localized labels fit the supported narrow viewport.
Held-key, pointer, gesture and focus-return behavior are covered by the focused
journeys. Physical safe areas, Photos/Files delivery and software-keyboard behavior
remain part of the reporting-device review.

For the reporting iPhone:

1. Use the same original source and network for baseline/fix deployments. Record
   browser/iOS versions, extension, actual delivered MIME, bytes and dimensions.
2. Compare Files HEIC, Photos selection and JPEG. Photos may deliver a converted
   format; record it rather than assuming HEIC.
3. Record input change → visible photo → usable controls; confirm distinct portrait
   and round crops, go Back, and separately time Recrop → visible/restored/usable.
4. Repeat immediate and later same-page reopening, then separately test reload
   and draft restoration. The original draft still requires preparation after
   reload; the decoded cache is not persisted.
5. Inspect cancel during preparation and cold decoding, invalid replacement,
   successfully prepared replacement then Cancel, and portrait/round independence.
   The previous accepted selection must survive every cancelled/invalid attempt.
6. Read bounded `photo.*` Performance measures and authenticated `Server-Timing`
   through Safari's inspector. Compare several warm repetitions and separately
   labelled first-module observations; keep full source bytes and credentials
   out of public evidence. Do not call a small-sample maximum a p95.

### Follow-up after the reporting-device retest (2026-10-09)

Aymane selected a HEIC on the current preview and reported at least 20 seconds
before seeing it. This estimate fails the intended first-selection experience;
the earlier 27% relative improvement must not be presented as device acceptance.
It is consistent with the synthetic fixed benchmark's 23–25 seconds, dominated
by transferring the original and the full 16-bit PNG.

The follow-up attempts actual native HEIC decode with a 2.5-second capability
deadline, then immediately shows the unchanged original for crop positioning.
Preparation still uploads/converts in parallel and blocks confirmation until
strict server validation succeeds. Matching oriented dimensions allow the client
to cancel the unneeded PNG body; mismatches/missing headers use the existing full
PNG fallback. Refusal/cancellation restores the previous selection. No stored
source or crop output is resized, quantized or converted on the client.

The local macOS WebKit capability probe decoded the full 3024×2016 source and
generated a display preview in 254 ms; Chromium refused native HEIC and uses the
fallback. Native image support is documented in
[WebKit's Safari 17 release](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/).
Actual capability is tested rather than inferred from a browser version. This
probe is not an iPhone timing or an end-to-end application result.

Sequential real deployed WebKit runs used the same 5,926,594-byte source and
connection: before at `8f73891` / `amourette-webapp-ppdduysoi-tothe-moon.vercel.app`,
after at `4db71fe` / `amourette-webapp-389hm6xih-tothe-moon.vercel.app`.

| Measurement | Before native display, two selections | After native display, two selections |
| --- | ---: | ---: |
| Selection → enabled crop gestures, automation wall time | 23,847 / 24,382 ms | 987 / 720 ms |
| Selection → validated confirmation, automation wall time | 24,144 / 24,698 ms | 11,609 / 12,324 ms |
| Native decode / selection display scheduled | Not used | 40 / 41 ms; 38 / 39 ms |
| Cropper interactive measure | Not separately instrumented | 713 / 436 ms |
| Original upload | 5,084 / 4,250 ms | 5,633 / 6,516 ms |
| Conversion request to headers | 4,946 / 4,693 ms | 4,880 / 4,941 ms |
| Server conversion | 4,310 / 4,085 ms | 4,367 / 4,140 ms |
| Full normalized PNG body download | 11,001 / 12,720 ms; 17,941,029 bytes | Cancelled after validated matching headers |
| Warm mount-to-ready, four reopens | 17–28 ms | 19–25 ms |

The native source is decoded before the cropper mounts. `selection.visible` means
the source is ready and the display state is scheduled, not a measured screen
paint. Gesture-enabled automation wall time includes input and polling overhead;
the screenshots confirm the image is present while confirmation is still disabled.
The mean observed gesture wait drops 96.5%; validated-confirmation wall time drops
51.0%. Upload was slower in the after runs, reinforcing that these small samples
do not establish a universal network guarantee. The response body can buffer some
bytes before cancellation: this avoids the complete PNG download, not necessarily
every transferred byte. Both conversions reported a non-first module invocation.
Native preview orientation/framing matches server dimensions for all eight
fixtures; an 8-bit browser-canvas display comparison averaged 0.373 channel levels
of difference for every orientation. Server native-sample checks remain exact.

The provisional native-capable device target is photo-visible/adjustable within
one second on the same representative source. Report confirmation separately:
upload and strict conversion still took 11–12 seconds here and overlap the user's
crop positioning. Native warm recrop remains below one second with no repeated
preparation, decode or preview exports. Non-native browsers retain the previously
measured PNG fallback latency. Physical iPhone acceptance remains outstanding.

All 19 existing focused photo/crop/source and real staging cases passed locally.
The four new delayed-native cases passed after correcting their ambiguous status
locator and using the existing English processing text. They verify adjustable
cropping with confirmation disabled, preserved gestures after successful
validation, refusal/cancellation retaining the accepted image, late completion,
warm reopening and dimension-mismatch fallback. Native precision/ICC/orientation/
refusal logic, lint, TypeScript and production build also passed. New deployed
before/after measurements are above. All 21 focused interaction cases also passed
on the updated deployed preview in one minute; owned test fixtures were cleaned.
Agent visual review inspected native-loading and validated-ready screenshots at
the reporting phone's viewport preset. A separate real WebKit run passed native
loading, ready and actual PQ-HDR refusal in French and Spanish at 320×568. The
processing status and Cancel remained in view, there was no horizontal overflow,
and refusal retained the previous image. Agent inspected these localized states.
Fresh full hosted coverage is recorded in
the PR and decision log after completion; the earlier 156-case pass is not evidence
for this new runtime.

The first fresh full hosted run for this follow-up,
[37984648119](https://github.com/getamourette/amourette-webapp/actions/runs/37984648119),
passed lint, logic, PostgreSQL ordering, build and HTTP contracts. Browser coverage
passed 158 of 160 cases, including every photo/native-preview/recrop/source case.
Failures were the room correction popup at `unified-profile-review.spec.ts:169`
and the first-entry room primer at `arrival-to-chat.spec.ts:9`. Both expected a
dialog that was not found; the initial CI causes remain unconfirmed. The correction
popup failure occurs before opening a profile editor, on unchanged room behavior.
Both tests passed three focused local production repetitions each on port 3002
with unchanged code/assertions (six passes; owned fixtures cleaned). A fresh full
hosted recheck follows this evidence; failed coverage is not treated as approval.

After refreshing with main `779db62`, the unchanged photo implementation was
checked at `1a000fa` on
`https://amourette-webapp-lhbtdxprr-tothe-moon.vercel.app/v/test-crowded`.
Two additional real WebKit selections became adjustable in 736 / 599 ms.
Validated confirmation took 17,974 / 10,679 ms: original upload varied from
11,307 to 4,896 ms, while server conversion stayed at 4,334 / 4,073 ms. This
reinforces the separate, network-dependent confirmation limit. Four immediate
warm readiness measures were 15–34 ms. An additional two-minute idle check
reopened the same source in 196 ms automation wall time (47 ms cropper readiness;
cache age 120,238 ms), with no preparation request, explicit decode or preview
export. Owned fixtures were cleaned, and agent inspected the refreshed preview's
native-loading and ready screenshots.

Fresh full hosted
[37989012153](https://github.com/getamourette/amourette-webapp/actions/runs/37989012153)
on head `1a000fab3766dcaf057d1947b52edcdc6df5de16`, base
`779db62be19ea08b418f672710ae4dae422f7798`, passed lint, logic, PostgreSQL ordering,
build and HTTP contracts, plus 162 of 163 browser cases. Every photo/native/crop/
recrop/source/staging case and the common arrival-to-chat journey passed. The
same room correction test failed earlier this time, waiting for the room's Leave
button at `unified-profile-review.spec.ts:164`, before submitting any correction
or opening a profile editor. Its encrypted CI trace cannot be inspected without
the diagnostic key, which is unavailable in this worktree. Ten subsequent
repetitions of that unchanged test passed on the deployed preview. Its hosted
cause remains unconfirmed; focused passes do not replace the failing full gate.
No room code or expectations were changed, and another full run was not started
without a confirmed fix or additional diagnostic evidence. The earlier
old-base recheck `37988366754` was cancelled for the main refresh and supplies no
validation evidence. Shared QA venues remained healthy without any reset.

The PR remains draft until required validation and the reporting-device acceptance
evidence are complete. Physical Photos/Files delivery and precise platform cold
starts remain explicitly unverified.

### Follow-up diagnosis of the hosted gate

Private inspection of the recovered encrypted traces established the remaining
failure causes rather than relying on isolated retries:

- `37989012153`: room prerequisites consumed about eight seconds, then the
  intentional arrival doorway needed its 2.2-second minimum. The Leave assertion
  started at navigation and expired just before readiness. The test now waits for
  a successful completed discovery response before its unchanged UI assertion.
- `37984648119`, combined correction: a valid `my_profile_review` response took
  8,670 ms. A routine 15-second interval invalidated that in-flight read, discarding
  the correction and starting a redundant trailing read after the assertion's
  deadline. Periodic reads now use the coordinator's idle-only `poll()`; actual
  signals/actions still invalidate stale responses immediately. The deterministic
  regression failed against the old interval behavior and passes after the fix,
  including coalescing, mutation precedence, retry backoff and disposal.
- `37984648119`, arrival primer: eligible candidates were returned, but a live room
  refresh took about 6.6 seconds while the UI deadline was already running. The
  journey now waits for each participant's actual eligible-peer discovery response
  before asserting both primers. All original privacy, matching and chat
  assertions remain required.

The recovery job only read existing artifacts and returned fresh ciphertext to
an ephemeral local key. It made no database changes and counts as no test coverage.
Its temporary workflow, helper and public key were removed before final validation.

The subsequent full hosted run
[38001133216](https://github.com/getamourette/amourette-webapp/actions/runs/38001133216)
passed lint, logic, PostgreSQL ordering, build and HTTP contracts, plus 162/163
browser cases. Every photo case and both previously failing room journeys passed.
The remaining no-venue profile-creation navigation assertion started before
publication completed. Private trace inspection confirmed successful publication:
permission took 284 ms, upload 1,586 ms and the final API request 8,070 ms. The
response arrived at the 10-second navigation deadline, with the page still Saving.
The test now waits for a completed 200 publication response before its unchanged
home URL, profile-link and zero-presence assertions. Publication errors still fail.

Real WebKit measurements of the updated deployed application at `da39343` /
`https://amourette-webapp-ospudc2xd-tothe-moon.vercel.app/v/test-crowded`:

| Stage | Selection 1 | Selection 2 |
| --- | ---: | ---: |
| Selection → adjustable crop, automation wall time | 704 ms | 664 ms |
| Selection → validated confirmation | 10,770 ms | 11,715 ms |
| Native decode | 26 ms | 26 ms |
| Original upload | 4,693 ms | 6,168 ms |
| Conversion request → headers | 4,985 ms | 4,572 ms |
| Strict server conversion | 4,380 ms | 4,082 ms |
| Warm cropper readiness, two reopens each | 22 / 15 ms | 19 / 26 ms |
| Warm recrop automation wall time | 431 / 49 ms | 896 / 83 ms |

All four warm reopens reused the source with no repeated preparation request,
explicit decode or preview export. Both conversions reported non-first module
invocations; exact platform cold starts remain unseparated. Agent inspected the
actual native-loading and validated-ready screenshots at the iPhone 13 Pro Max
viewport. All 15 focused local browser checks passed after the refresh fix, with
owned fixtures cleaned. The final publication-assertion fix is validated separately;
neither these samples nor any desktop WebKit run replace physical iPhone acceptance.

The next full run
[38008809672](https://github.com/getamourette/amourette-webapp/actions/runs/38008809672)
passed build/logic/SQL/HTTP checks and 162/163 browser cases. All photo, room and
publication cases above passed. The remaining approval-return assertion expired
while authenticated recovery was still completing: the trace showed successful
approval in 1,811 ms, owner revision in 3,253 ms, owner null review in 2,791 ms and
attendance destination in 2,379 ms. The destination completed just after the
deadline that began at the founder's click. The test now waits for successful
completed approval and the actual owner's null review response before its
unchanged navigation/editor-closure assertions. No application behavior, privacy
assertion or UI deadline changed; no missed refresh was observed in this trace.

### Reporting iPhone: confirmed native capability timeout (2026-10-10)

The founder supplied a 19.55-second screen recording and its original HEIC.
Files closes around 4.75 seconds; preparation remains visible until about 15.75
seconds and the photo first appears around 18 seconds. Initial display therefore
takes roughly 13 seconds on this attempt and fails the provisional one-second
target. The recording contains no recrop. The source is 1,054,357 bytes,
4032 by 3024 encoded pixels, 8-bit Display P3, oriented to 3024 by 4032.

On the previous application preview, desktop WebKit with this exact source makes
the crop adjustable in 541 / 457 ms and enables confirmation in 6,543 / 5,437 ms.
Upload takes 484 / 433 ms and strict conversion 4,017 / 3,815 ms. Native decoding
takes 45 / 12 ms; exact validated dimensions permit retaining the native original
and cancelling the PNG body. Warm readiness is 18–24 ms; automation wall times
are 1,301 / 79 / 765 / 74 ms, including local preview generation on the first
return. These desktop measurements cannot establish physical-device performance.

The founder then ran the temporary local-only diagnostic on the reporting phone.
The source digest matches the supplied original, MIME is `image/heic`, selection
and all probes begin while visible, and memory read takes 8 ms. Observed browser
is Safari 26.6.1 (`iPhone OS 18_7` in its user-agent); the user-agent alone does not
establish the installed OS version.

| Native source probe | `load` | Explicit `decode()` | Dimensions | Canvas |
| --- | ---: | ---: | --- | --- |
| Detached original File | 11 ms | 3,430 ms | 3024 × 4032 | Success |
| Attached original File | 7 ms | 6,264 ms, beyond 6,000 ms diagnostic wait | 3024 × 4032 | Success |
| Detached memory-backed Blob | 10 ms | 4,492 ms | 3024 × 4032 | Success |

The application waited for explicit native decode with a 2,500 ms capability
cutoff. All three phone decode results exceed it, explaining why a supported
original was discarded and display fell back to server preparation plus normalized
PNG loading. This is a false capability timeout, not evidence of repeated server
conversion. Attaching the image or copying the bytes does not help in these probes.
Exact platform cold-start time is still not separated from request overhead.

The fix uses the native image's load event, positive dimensions and the unchanged
25-million-pixel limit; it avoids explicit native decode and seeds the same image
cache used by crop previews and warm recrops. The 2,500 ms load bound, abort,
server validation, exact oriented-dimension check and unsupported-browser PNG
fallback remain. Saved/normalized image decoding is unchanged. No source is
resized, recompressed or colour-converted in this display change.

A held-decode regression fails against the previous deployed implementation,
then passes with the fix using the unchanged assertion deadline. A dropped-load-
property regression also passes. The temporary diagnostic page is removed.
Before/after physical first display, independent crop gestures, cancellation and
warm reopen still need confirmation on the reporting phone. A fresh hosted gate
is required for this new executable tree; the earlier 163-case result is historical
coverage only.

Local validation after the fix: production build, focused ESLint and TypeScript
checks pass, as do all 16 focused photo cases: six native preview races, two warm
recrop cases, six saved-source loading/authorization cases and two original-byte/
independent-crop preservation cases. The strengthened held-decode case also passes
on the production build. The first saved-source run failed before editor hydration
on `next dev`; its WebSocket-isolating mocks also intercept the development socket.
All six unchanged cases pass against the production build on port 3002. No test
deadline or expectation was relaxed. The initial sandbox run could not reach the
fixture service and supplies no functional evidence.

### Deployed verification of native load readiness

Application head `05e4806a18b46300fc129a05919d77cff4b7282f`, preview
`https://amourette-webapp-7mc2mupnl-tothe-moon.vercel.app/v/test-crowded`:
all 14 focused native/warm/saved-source browser regressions pass on Chromium.
Owned-fixture teardown completes. Real WebKit measurements of the reporting
original use the same harness as the preceding desktop baseline:

| Stage | Selection 1 | Selection 2 |
| --- | ---: | ---: |
| Selection → adjustable crop, automation wall time | 507 ms | 449 ms |
| Selection → validated confirmation, automation wall time | 9,080 ms | 8,475 ms |
| Native image load | 42 ms | 10 ms |
| Cropper interactive readiness after mount | 402 ms | 389 ms |
| Original upload | 519 ms | 377 ms |
| Conversion request → headers | 7,781 ms | 7,304 ms |
| Strict server conversion | 7,281 ms | 6,937 ms |
| Worker startup | 360 ms | 112 ms |
| Warm cropper readiness, two reopens each | 27 / 18 ms | 21 / 15 ms |
| Warm recrop automation wall time | 1,255 / 79 ms | 1,268 / 82 ms |

No native explicit decode runs; validated matching dimensions retain the original
and cancel the full PNG body. Every reopen hits the accepted-source cache, without
another preparation request or image load/decode. The first return generates two
local previews; the next return exports neither. The 1.25–1.27-second first-return
automation wall times are reported separately from 15–27 ms cropper readiness;
they do not prove that every physical tap meets the proposed one-second target.
Strict server conversion is slower than in the preceding desktop samples, despite
unchanged converter code. These small samples do not establish a backend speedup
or attribute the variability to a platform cold start. Both conversion responses
report non-first module invocations; startup and internal conversion stages are
measured, but precise platform cold starts remain unseparated.

A generated 3024 by 2016 JPEG (2,051,639 bytes) becomes adjustable in 381 / 324 ms,
with confirmation in 558 / 476 ms. It performs no original upload or server
preparation before cropping. Four warm recrops have readiness 13–21 ms and wall
times 431 / 67 / 938 / 64 ms, with no explicit decode or preview export.

Agent inspected the actual reporting-source native-loading and ready screenshots
at the iPhone 13 Pro Max viewport. A separate real WebKit check passes French and
Spanish loading, ready and strict HDR-refusal states at 320 by 568; visual review
confirms visible photo, reachable Cancel/status and retained accepted photo after
refusal. Shared QA fixture health is unchanged, with no reset. Physical reporting-
phone Files/Photos and JPEG comparisons, independent crops and before/after reopen
measurements remain outstanding. The new preview is supplied for that recheck.
