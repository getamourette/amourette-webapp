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

The PR remains draft until required validation and the reporting-device acceptance
evidence are complete. Physical Photos/Files delivery and precise platform cold
starts remain explicitly unverified.
