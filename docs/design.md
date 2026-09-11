# Design & Brand — Amourette

Living design reference. Updated as the visual identity is decided. Pairs with
`docs/decisions.md` (the *why* of each choice) and `docs/brand/board.html` (the
visual board).

> Status: **Design-system rework (#38, 2026-07-22).** The 2026-07-03 DA ("Rouge
> Signature": Bodoni / warm velvet / ruby `#D01F3C`) was a one-shot generation,
> not a considered system, so it was pressure-tested against real product
> screens and reworked. **Both hero screens are locked** (room feed card + match
> reveal) and the reworked **v2 system** is written below ("The system (v2)").
> Still open: the WCAG re-measure at token-wiring time, the "red present" ♥
> tension, and app integration of the delivered logo v1 pack. The brand *name*
> (Amourette) is unaffected.

## Design-system rework (in progress — #38, since 2026-07-22)

Rebuilding the visual language from the locked-but-thin 07-03 DA into a real
design *system*, screen by screen, by rendering comparable variants on the real
product surface and choosing (mockups live in `docs/brand/explorations/`).
Marwane's call: **pressure-test the brand** — the 07-03 palette and fonts are
provisional; **dark stays** (anchored to the product: a bar at night, not a
graphic taste). Both hero screens are now locked (room feed card + match
reveal); the definitive token system is codified in **The system (v2)** below.

### Hero screen #1 — room feed card (LOCKED 2026-07-22)

Direction "Sous les projecteurs" + champagne footer (mock variant D1 + B):

- **Composition:** full-bleed cinematic photo; the person emerges from a warm
  light on near-black (chiaroscuro). No card frame, minimal chrome. This is
  "the night is the set" taken literally.
- **Bottom content over a velvet-ink scrim:** kicker (red live-dot + "in the
  room · N here"), first name in **Fraunces italic** (~48px), 2-line bio, a
  single **champagne 1px hairline**, then the action row (♥ + count).
- **The ♥ is discreet at rest and turns red only when tapped** ("red is an
  event"). This resolves the tension below: on the real screen a standing red ♥
  read as pre-selected and diluted the rareness of the accent, so red is kept
  for the like action + the match, never a resting state.

### Emerging system choices (provisional until the token rewrite)

- **Palette shifts cooler and deeper** vs 07-03: ground velvet `#150E10` → ink
  `#120A0F`; surface bordeaux `#231317` → `#1D0F15`; signature ruby `#D01F3C` →
  deep `#CC1436`; cream `#F4EBE1` → `#EFE6E0`; taupe `#A98F86` → ~`#9D8A86`.
  Champagne `#D9B779` unchanged (still hairline-only). Photo lit with a cool
  rose key light.
- **Type system changes:** display/wordmark Bodoni Moda → **Fraunces** (italic
  for names and the wordmark); body Inter → **Figtree**; labels stay **Jost**
  (uppercase, tracked).

### Open points (settle at the reveal / token step)

- **"Red present" ♥ vs "red is an event" — RESOLVED (2026-07-23): red is an
  event.** A permanent red heart on every card softened the 07-03 rule that red
  is rare (reserved for like + match). Seen on the real screen, the standing red
  read as pre-selected/on, so the ♥ is now discreet at rest (ghost pill, ♡) and
  turns red only on tap (♥ + bloom). Red stays reserved for the like and the
  full-red match reveal.
- **Wordmark / logo** is a separate dedicated pass, after the system settles. It
  reopens the 07-03 Bodoni wordmark. The unused "wax seal" idea (mock variant
  D3) is a strong app-icon / emblem candidate to resurface there.

### Wordmark and logo (#39; core identity selected 2026-09-08)

#### Current selection

After the round 16 comparison, Marwane confirmed the following core set:

- **Emblem:** B1, `logo-wordmark/round-15/ribbon-refined.svg`.
- **Lettering:** More presence, `logo-wordmark/round-09/fuller-wordmark.svg`
  (Cormorant Garamond 600-weight base). Use these outlined contours and
  their existing optical spacing, including the custom R and opened R/E pair.
- **Main signature:** vertical emblem above the wordmark, with a horizontal
  companion when the format calls for it.
- **App header:** wordmark alone.
- **Phone icon:** cream `#EFE6E0` ribbon on velvet `#120A0F`, not the agent's
  proposed ruby background.
- **Favicon:** round 17 F1, `logo-wordmark/round-17/ribbon-optical.svg`,
  selected after the small-size comparison on 2026-09-08. Use the optical
  drawing in cream on velvet for this role; B1 remains the standard-size
  emblem and phone-icon drawing.

Marwane subsequently authorized the usage sheet and export pack. The digital
v1 delivery is in `docs/brand/logo/v1/`, with the portable visual guide,
[usage sheet](brand/logo/v1/README.md), SVG/PNG/ICO files, source-font licence,
geometry/hash manifest and a ZIP. Use these exports for production work;
the exploration files above are the preserved drawing references.

V1 retains round 16's composition ratios: ribbon widths 2.4x vertical and
1.8x horizontal, with a 0.65x gap, where x is a flat E's capital height.
Combined signatures and the standalone wordmark include 1x outside clear
space; standalone B1 includes one quarter of its visible width on each side.
These margins are part of the delivered SVG/PNG canvases, not extra CSS
padding to infer later. Working screen minimums, measured across the whole
file including padding, are 200px vertical, 280px horizontal, 192px wordmark,
48px B1/phone icon and 16px F1 favicon. The phone source is an opaque square
with B1 at 72% width; platform masking stays separate. The favicon retains
the round 17 framing. Cream/ruby/ink variants follow the existing contextual
colour rules below; the two icon roles stay cream on velvet.

The digital pack is complete. Local app integration is now implemented for
visual review (see the integration status below). Physical print
proofs and platform-specific configuration remain outside this delivery;
the sRGB screen checks do not establish universal print minimums. The compact
signature is an unselected exploration, not a third required composition.
Previous drawings, weights and comparison pages remain unchanged. App
integration, commits, pushes, PRs and shipping require an explicit request.
Preview and download: `http://100.100.155.8:8079/round-04/delivery-v1/`.

#### Integration status (2026-09-08; final delivery authorized)

The authorized implementation uses a shared `app/BrandLogo.tsx` component
and byte-identical v1 SVG copies under `public/brand/`. It replaces only
existing brand signatures, keeping Fraunces names/headings, navigation,
room gestures and entry/reduced-motion animations. Whole-file widths remain
at least 192px for wordmarks and 200px for the welcome composition. Narrow
profile/age headers wrap the language control when the two cannot fit; the
waiting room reserves a separate control line below 360px. The admin header
is light, so the approved cream mark is presented on a small velvet backing
without changing the surrounding admin theme.
After founder review of the first screenshots, left-aligned brand placements
align the visible A with the adjacent venue name or heading. `BrandLogo`
opts in with `align="start"`; `.brand-align-start` moves the entire canvas by
100 / 1279.39203125 of its width (about 15px at 192px) into the existing gutter.
Its width, embedded clear space and neighboring content stay intact. The
admin backing moves with its mark; centered compositions retain their axis.
The updated gallery compares the first integration against this alignment
pass, while `initial.html` preserves the original checkpoint comparison.
Marwane approved this alignment preview on 2026-09-08 and subsequently
requested final PR delivery. Physical phone-shortcut validation remains pending.

Final delivery incorporates the current `main`: the returning landing no longer
contains chat links (#224), and the first-entry reminder no longer duplicates
the room header signature (#225). The earlier gallery retains those historical
states; these upstream corrections remain intact in the delivered application.
`integration-preview/deployed.html` compares that approved alignment pass with
52 screenshots from Vercel after synchronization. Agent visual inspection
covers the principal mobile screens, 320px controls and long names,
representative desktop views, and supplementary French/short-name variants.
This records deployed verification, not a new founder visual approval.

The public loading/error states reserve the welcome logo's canvas while
using the ruby wordmark; returning visitors use a shorter wordmark canvas.

`app/favicon.ico` and `app/icon.svg` contain F1. `app/apple-icon.png` contains
the supplied 180px B1 phone tile. These are metadata assets only: no PWA,
manifest, service worker or store configuration is introduced. Actual phone
shortcut selection/masking still needs a physical device check.

The before/after gallery lives in
`docs/brand/explorations/logo-wordmark/integration-preview/`, with the real
production renderer and synthetic browser-intercepted data. It is a capture
gallery, not an interactive application preview. Final delivery is authorized
through `/ship final`; the board and PR record review status. Merging remains
founder-gated, and physical phone-shortcut validation is not claimed.

#### Initial app placement approved for implementation (2026-09-08)

After the design checkpoint, Marwane approved this first placement map and
requested a handoff for implementation with visual page previews. The map
was the implementation starting point. The handoff preceded the implementation
and alignment review described above.

| Surface | Initial placement |
| --- | --- |
| Public landing, new visitor | B1 + More presence vertical signature, ruby on velvet |
| Public landing, returning visitor | Wordmark alone, ruby; keep space for the profile and active conversations |
| Venue entry, waiting room and live room | Wordmark alone, cream, at existing brand placements |
| Loading, errors, closed/ended nights and presence-exit screens | Wordmark alone, cream; preserve current timing and transitions |
| Profile editing and age confirmation | Wordmark alone, cream, in the existing header |
| Onboarding question/preview steps | No systematic new logo; preserve the question/progress-first layout |
| Match reveal | Wordmark alone, cream, in the existing top position |
| Chat | No additional logo; the header remains focused on the other person |
| Admin, email-preference and unsubscribe web pages | Wordmark alone, cream, replacing existing brand signatures |
| Browser favicon / phone shortcut | F1 / B1 respectively, both cream on velvet |

The landing's own loading/error states retain its existing ruby colour rule;
the general cream loading/error rule above refers to in-app/venue states.
Keep the landing transition stable without adding a new loading ceremony.
No horizontal composition must be forced into the app just because it is
available. Outgoing email templates and printable QR-card creation remain
outside this integration pass; the existing QR destination/flow is unchanged.

The legacy `.wordmark` class also styles profile names and display headings.
Do not globally replace that class's font or uppercase its contents: only
actual brand signatures become the outlined logo. Names, titles and ordinary
mentions of Amourette remain text. Do not automatically make previously
non-interactive logos into navigation links.

The requested visual review should show the actual implemented pages, ideally
with comparable before/after captures and a shareable HTML gallery. Use
synthetic test data for personal surfaces and clearly label simulated states;
do not reset or write shared QA data merely to obtain screenshots. Validate
the main mobile layouts and representative desktop states, including long
venue names and nearby controls. Further commits, pushes, PRs or shipping
are not authorized by this implementation handoff.

The favicon comparison is preserved in
`logo-wordmark/round-17/` (2026-09-08). It shows unchanged B1 against a
separate optical ribbon F1 and a free, tail-free shorthand F2 at 16px and
32px full-tile sizes, on matching light/dark browser-tab surfaces. Cream
on velvet and the 512-unit framing stay fixed. Live SVG, 1×/2× PNG modes
and a change-this-tab-only favicon control expose the effect of display
density without changing the app. F1 broadens the fine returns and
separates the loose ends from the fragile crossing; F2 keeps only those
two new loop paths. The agent recommended F1 for the favicon, not as a
replacement for standard-size B1; Marwane subsequently selected F1.
F2 and the unchanged-B1 favicon specimens remain comparison history.
The existing PNGs are review artifacts, not a delivered production pack.
The preview is
`http://100.100.155.8:8079/round-04/round-17/`.

#### Exploration history

The current preference is an uppercase serif wordmark with nocturnal elegance.
In the first generated comparison, Marwane preferred the large cream B treatment
for its presence, also liked A's finer elegance, and singled out the sweeping R
as a detail that gives the name character. Some other letterforms still need
refinement. The generated red and cream specimens were inconsistent and do not
identify an actual font. Cormorant Garamond, Bodoni Moda, and Libre Caslon Display
are being compared as reproducible starting points, not exact matches or approved
choices. Final typeface, custom lettering, spacing, and app integration remain open.

Subsequent feedback favours Cormorant Garamond among those real-font specimens,
but it is not fully convincing. Marwane also identified Marcellus as a previously
liked option, likewise not approved. Generous spacing is preferred: `0.080em`
was the favourite setting at the previous comparison's upper limit. The next
comparison therefore narrows to Cormorant Garamond and Marcellus at `0.080em`
and `0.120em`. These remain exploration preferences, not a locked font or spacing
specification.

Marwane subsequently preferred Cormorant Garamond to Marcellus and clarified
that the R is only one possible distinctive detail, not a required signature.
Future iterations should include a deliberately different agent-proposed option,
so elements can be selected across proposals. Round 4 is preserved in
`docs/brand/explorations/logo-wordmark/`: a spaced reference, a fine bridge between
the two T letters, a curved R leg, and a ribbon-emblem wildcard. All use outlined
Cormorant Garamond at weight 500 and nominal `0.100em` spacing with small optical
pair adjustments. The comparison includes cream, ruby, ink-on-paper, and 200px
specimens. None of these custom details or the intermediate spacing is approved.

Round 5 follows Marwane's positive response to the curved R: its outgoing stroke
should extend slightly beneath the E. Two versions in `logo-wordmark/round-05/`
compare a restrained extension under the middle of the E and a longer wildcard
towards its outer edge, while retaining the previous lettering and spacing.
The ribbon idea remains a possible later addition, but its current drawing is
not accepted and needs refinement before being reconsidered. Neither R version
has final approval.

Marwane rejected the round 5 R treatment and asked for a shape closer to the
large cream B in the first generated board. Round 6 returns to that reference:
a continuous descending leg with a short upturned tip, rather than the long,
flattened underlining gesture of round 5. Its comparison shows the original
cream B directly above two vector interpretations on the retained Cormorant
base. The revised R still awaits feedback; the ribbon remains parked.

Round 6 was also rejected: its outgoing R stroke remained too long relative to
the original cream B. Round 7 isolates the original, previous, and revised R at
approximately equal capital height to make that proportion directly comparable.
The revised tip is shorter; the R/E pair is tightened independently rather than
stretching the R to reach the E across the existing gap. A second option keeps
the same short reach with a slightly lifted tip. Both await founder feedback.

Marwane preferred round 7's alternative but still found the original cream B's
R better. The next authorized step is a complete-letter reconstruction, rather
than further isolated tail edits. Round 8 preserves a fitted vector contour of
the original R and shows an image/vector overlay at equal capital height. Its
two complete adaptations retain the reference's bowl-to-leg connection and
shorter, fuller descent, while adjusting the stem, counter, and inside leg for
Cormorant. The main wordmark uses weight 500; the deliberately fuller alternative
uses weight 600 across the remaining letters and a correspondingly heavier R.
The reconstruction and explicit contour adaptations are reproducible with
`logo-wordmark/round-08/build.py` and the Cormorant variable font. These are still
design explorations, with no final logo approval or app integration.

Round 8 received positive feedback, with the E perceived as too close to the R.
Round 9 opens that pair by 60 font units (`0.060em`) on both weight variants,
moving the E and following letters together so the later gaps remain unchanged.
All letter contours, including the reconstructed R, are retained exactly.
Marwane responded positively to the revised spacing, then asked to explore
whether another meaningful detail could make the identity more distinctive.
The final weight and overall logo approval remain open.

Round 10 in `logo-wordmark/round-10/` explores three companion emblems without
changing the round 9 lettering: a curved-crossbar A (an initial and a bridge),
an asymmetric ribbon (a light, fleeting connection), and a wildcard pair of
quotation-like forms (two voices responding, the first exchange). These are
intended associations, not claims that viewers will automatically read the
metaphors. The initial third concept looked too flame-like and was replaced.
The selected generated board, prompts, fitted vector contours, and both
wordmark-weight compositions are preserved. The comparison includes the
wordmark alone, brand-colour controls, and small-size specimens. All emblems
remain exploratory: no symbol is selected, no final hand-refined identity
master is claimed, and no application integration has been authorized.

Marwane's round 10 feedback distinguishes meaning from appearance: C (the first
exchange) feels more meaningful for the brand, while B (the ribbon) is much
more appealing visually. On 2026-09-07, Marwane clarified that this is not a
request to fuse the two concepts. Both B and C remain active candidates,
unchanged and without a final selection. The exploration should broaden the
conversation-related direction to seek a more beautiful symbol; B remains an
aesthetic reference, not a mandatory source of ribbon geometry for new marks.

Round 11 (`logo-wordmark/round-11/`, 2026-09-07) adds three independently
generated conversation-related studies: D, a calligraphic speech form; E,
more open, sculpted quotation-like forms; and F, a figurative face-to-face
wildcard. Their source images, prompts, and fitted SVG contours are preserved.
The page references original B and C directly and allows all five emblems to
be inspected with the same unchanged round 9 wordmark. These are additional
possibilities, not a replacement, fusion, or approved direction. The thin
return in D, ornamental quality of E, and kiss-like reading/detail loss in F
are visible questions to assess with Marwane before any refinement or choice.

Marwane asked to explore F further with less explicit faces, more room for
interpretation, and a better contour drawing. Round 12
(`logo-wordmark/round-12/`, 2026-09-07) compares original F with three less
literal studies. F1 retains fuller paired shapes but replaces facial details
with one gentle inward turn; after image-based exploration its contours were
redrawn natively in SVG with continuous outer arcs and separate lower tips.
F2 is a slender, more abstract pair; F3 is the asymmetric, broader-stroke
wildcard. F2/F3 retain fitted contours from their selected images. Generated
studies, full prompts, and the F1 native drawing are preserved separately so
the bitmap study is not mistaken for an exact rendering of the revised SVG.
The page includes the old F, B, and C, unchanged lettering, small-size tests,
and a control to hide explanatory notes while judging the shapes. Exploring
F does not select it or reject B/C; final geometry, weight, and logo approval
remain open. There is still no app integration.

On 2026-09-08, Marwane reaffirmed B (ribbon) and C (first exchange) as his
current favourites, and requested a separate uppercase handwritten
`AMOURETTE` test with an emblem resembling two people side by side and a
heart between them, without visual gender distinctions. Round 13
(`logo-wordmark/round-13/`) uses two exactly identical faceless figures,
with line/solid treatments and monochrome/ruby-heart controls. It compares
real Caveat, Bad Script, Kalam, and Oooh Baby fonts, the latter as the
agent-proposed wildcard, plus device-local Segoe Print, Segoe Script, and
Segoe UI specimens. Segoe UI is labelled as the non-handwritten reference.
Microsoft font files are not bundled; unavailable local families are labelled
and not silently replaced. The four supplied font files and their licences
are preserved under the exploration directory, not added to the app's font
stack. Spacing can be tested at 0, 0.040em, and 0.080em, initially the latter.
The existing B/C compositions and serif lettering remain unchanged; this is
an additional design test, not approval of a font, emblem, or new direction.

After viewing round 13 on 2026-09-08, Marwane returned to the original round 10
B and C as the two candidates to continue from. The handwritten and face-based
studies remain preserved history, not the current direction. B is preferred
for its appearance; C for its connection to conversation. Neither is selected,
and combining them is not requested. An initial visual similarity review found
ribbon motifs in [Ribbon](https://apps.apple.com/my/app/ribbon-social-culture-app/id1589651346)
and [Reebonz Closet](https://apps.apple.com/th/app/reebonz-closet/id6503641601),
and paired organic comma-like forms in [Dot](https://new.computer/dot).
These are visual comparisons, not claims of identical marks or trademark
clearance. The agent suggested comparing B and C on identical phone-icon,
entry-screen, and in-venue QR-card mockups. At that point the next comparison
still required discussion and approval, with app integration and shipping
remaining separate.

Marwane approved the context-comparison method on 2026-09-08. Round 14
(`logo-wordmark/round-14/`) places the unchanged B and C SVGs on matching phone
icons, a static reproduction of the current new-visitor landing, and A6 QR
cards. A shared control switches between the two preserved round 9 wordmark
weights; another hides companion emblems while reserving their space, so the
surrounding layout stays fixed. Icon samples retain the original contours at
160px, 64px, 32px, 24px and 16px, with velvet/ruby background controls. The
agent's free composition gives the card's invitation more prominence and
moves the wordmark and emblem to a smaller horizontal signature at the foot;
both B and C are shown in that composition, without a new emblem or a fusion.
These are native HTML/CSS studies using the real SVG artwork, not new image
generations. The identical sample QR opens the public homepage, not a shared
test venue. The page is served at
`http://100.100.155.8:8079/round-04/round-14/` from the existing preview copy.
Original explorations remain intact. At that stage, founder feedback on the
comparison, emblem selection/refinement, final weight and app integration
remained open.

After viewing the context comparison on 2026-09-08, Marwane selected B,
the ribbon, as the emblem direction and requested refinement while keeping
the current drawing available as a fallback. C and the earlier explorations
remain preserved, but are no longer the active direction. Round 15
(`logo-wordmark/round-15/`) compares the untouched round 10 B with two new
native SVG drawings: B1 is a close redraw with smoother loop transitions and
cleaner crossing/point contours; B2 is the agent's free variation with the
same new loops and shorter loose ends. The page includes unchanged round 9
lettering, a crossing enlargement, an optional original-contour overlay and
64px/32px/24px/16px specimens. The agent provisionally favours B1 because it
retains more of the original's movement; at presentation, neither refinement
was founder-approved. Final contours, any separate micro-size treatment,
wordmark weight and app integration were still open. The preview is
`http://100.100.155.8:8079/round-04/round-15/`.

Marwane subsequently selected B1 on 2026-09-08. The standard-size emblem
reference is now `logo-wordmark/round-15/ribbon-refined.svg`. Its selection
settles the ribbon drawing for the next usage-definition step; the original
round 10 B and B2 remain preserved. The round 9 wordmark and its optical
adjustments stay the lettering reference, with final weight still open.
Combined and separate uses, fixed composition proportions, minimum sizes,
clear space, colour variants and export assets have not yet been finalized.
The existing app colour rules below remain the starting point for that work,
not approval of a new logo usage sheet or application integration.

Marwane approved proceeding with the usage comparison on 2026-09-08.
Round 16 (`logo-wordmark/round-16/`) keeps B1 and both round 9 wordmarks
unchanged while comparing weights, vertical/horizontal compositions,
separate emblem and name uses, existing palette applications and small
sizes. The free variation is a compact, name-first signature with a smaller
ribbon at the right. Proposed proportions and clear space use a capital E's
height, measured from visible artwork rather than inherited SVG padding.
Small-size labels also refer to visible width, unlike round 15's canvas-width
labels. The agent recommends More presence lettering, the vertical main
signature, a horizontal companion, the wordmark alone for app headers and a
cream ribbon on a ruby phone icon. These remain recommendations, not founder
decisions. The 32px ribbon and 160px wordmark starting minimums are provisional;
the 16px favicon, complete-lockup/print minimums and standalone clear space
remain unresolved. No final export pack or app integration is included.
Preview: `http://100.100.155.8:8079/round-04/round-16/`.

---

## Brand name — Amourette (locked 2026-07-01)

The product is renamed **Paramour → Amourette**. Domain: **`getamourette.com`**
(`amourette.com` is taken; `.app/.co/.io/.love/.us` and `join/try/…app.com`
were free at time of check).

Due-diligence summary (why it's usable but needed care):
- **App Store / Play Store:** no dating app named Amourette. One low-profile
  hidden-object *game* "Amourette: Objets Cachés" exists on the FR App Store —
  App Store display names are not required unique, so not a blocker.
- **Trademarks:** no dating/software mark (Class 9 / Class 45) found. Existing
  marks are in *other* classes — Triumph **Amourette** lingerie (Class 25),
  *Une Amourette* perfume (Class 3), L'Amourette chocolate. Class-specific
  protection means these don't block a dating app, but "amourette" is a common
  French dictionary word (a light/fleeting love affair), so the mark is
  **diluted** — weak SEO ownership, harder to protect. Accepted trade-off; the
  *meaning* (live, discreet, ephemeral romance) fits the product perfectly.
- Not legal advice — a proper clearance by an IP counsel is the move before any
  actual trademark filing.
- **Codename note:** the active `bartap-close-ended-nights` database job retains
  the old internal codename until the dedicated, founder-gated migration in #200.
  Historical migrations and decision entries remain unchanged records. The active
  product, code, and documentation use Amourette.

## Design principles (derived from the product invariants)

Every visual choice is judged against these five — they are the invariants
translated into design language:

1. **Discreet.** The screen must not shout "dating app" across the table.
   Dark, calm, nothing flashing.
2. **The night is the set.** The app background *is* the venue's ambiance:
   dimness, warm materials, scarce light.
3. **The accent is an event.** The signature colour is reserved for the like,
   the match, the CTA. Rare, therefore precious.
4. **Women first.** Elegance is a safety signal. Never racy, never sleazy.
5. **Tonight only.** The DA carries the soft urgency of the ephemeral: what
   happens here expires at dawn.

## The three directions (board v3)

The v2 board explored *one* aesthetic (dark + couture red) with three
red-usage variants. V3 confronts it with two genuinely different, fully
executed alternatives so the choice is real. All three are dark (decided:
Amourette is opened in a bar at night — this deliberately overrides Marwane's
personal "no dark mode" rule, which is scoped to Reza, a different project).
All three palettes pass WCAG contrast (measured, see board).

| | A · Rouge Signature | B · Heure Bleue | C · Dernière Danse |
|---|---|---|---|
| Mood | Couture, lipstick, theatre curtain | Blue hour, candlelight, cinema | Neon bar sign, flirty, playful |
| Background | Warm near-black `#150E10` | Ink blue `#0B0F1C` | Warm black `#0F0A0E` |
| Signature | Ruby red `#D01F3C` | Amber glow `#E4A14F` | Neon pink `#FF4F7B` |
| Display type | Bodoni Moda | Fraunces | Instrument Serif italic |
| Says "love" | Immediately | Never (says "premium bar") | Yes, flirt-flavoured |
| Discretion | Good | Best | Weakest (neon draws the eye) |
| Ownable | Strong (no dating app owns couture red) | Weak (premium-dark is saturated) | Weak (pink = generic dating code) |
| Women-first risk | Low if red discipline holds | Lowest | Highest (neon slides to sleazy) |

**Decision (2026-07-03): Direction A — Rouge Signature, "hybrid" red usage,
signed by Marwane.** It is the only direction that wins on the three axes
that matter: it *says love* (B never does), it is *ownable* (C is Tinder
territory), and it holds women-first through premium elegance. It is also the
natural continuation of the v2 work — the existing lead was right, it needed
real alternatives to confirm it.

### How the three v2 open points closed

1. **Red usage philosophy → hybrid.** Punctuation system on ~95% of the app
   (dark + cream, red only for the ♥ and the primary CTA); full-red reserved
   for the match reveal and the splash. Red becomes an event, like the match.
2. **Exact red → `#D01F3C`.** Settled objectively: of the five candidates,
   only `#D01F3C` and `#C8102E` pass WCAG both as a button fill under cream
   text (4.5:1) and as a UI element on the velvet background (3:1) —
   `#D2213F` (4.42) and `#E5405C` (3.41) fail the button check, `#A81D3B`
   (2.63) fails on velvet. `#D01F3C` is the more couture of the two survivors.
3. **Palette → confirmed as-is**, with two guard-rails hardened: champagne is
   *only* ever a 1px hairline (never a fill, never a button), and blush gets a
   defined job (soft states: invisible mode, safety confirmations, focus ring).

## The system (v2 — reworked 2026-07-22, drawn from the two hero screens)

This is the current system, replacing the 07-03 table. **Token *names* are kept
from 07-03 so the code migration is mostly value changes, not renames**; the
values move cooler and deeper. Contrasts must be re-measured for the new values
at token-wiring time (the 07-03 measurements no longer apply — `red #CC1436` is
darker than `#D01F3C`, so cream-on-red and red-on-velvet both need re-checking
against the 4.5:1 text / 3:1 UI bars).

### Tokens — palette (primitives)

| Token | Hex (v2) | Was (07-03) | Role |
|---|---|---|---|
| `velvet` | `#120A0F` | `#150E10` | App ground — near-black ink, cooler and deeper |
| `bordeaux` | `#1D0F15` | `#231317` | Surfaces, cards, inputs |
| `red` | `#CC1436` | `#D01F3C` | Signature: the ♥, primary CTA, live-dot, reveal |
| `red-deep` | `#A51330` | `#C11B37` | Full-red screen base (the match reveal / splash) |
| `wine` | `#7C0F24` | `#7C1D2E` | Depth: full-red vignette edge, gradients, hover |
| `champagne` | `#D9B779` | = | The only gold. 1px hairline only, opacity ≤ .5 |
| `blush` | `#E9B9BC` | = | Soft/safety states: invisible, safety confirms, focus ring |
| `cream` | `#EFE6E0` | `#F4EBE1` | Primary text; wordmark; inverted CTA fill on red |
| `taupe` | `#9D8A86` | `#A98F86` | Secondary text, placeholders, kickers |
| `ink` | `#1A0F12` | = | Text on light backgrounds (print, stickers, emails) |

Two recipe tokens (gradients, not flat colours):
- `rose-key` — the warm portrait key light on the card: a soft radial of
  `rgba(216,180,170,.4)` fading out, so the person emerges from the dark.
- On `red-deep`, secondary text is a rose tint of cream (`~#F3D9DD`) and the
  kicker is `~#F2CDD2` — cream/blush family, not new primitives.

### Type

- **Fraunces** — display, headings, names and reveal titles. **Italic is
  the brand voice** for names/reveal. Weights 400–600. (Replaces Bodoni.)
- **Wordmark:** use the outlined More presence assets from the logo v1 pack,
  not live Fraunces or retyped Cormorant. Local integration awaits visual approval.
- **Figtree** — body text (300/400/500), readable in dim light. (Replaces Inter.)
- **Jost** — uppercase tracked labels, buttons, kickers, counts (300/400). Kept.
- Red is never body text.

| Role | Size / line-height | Font | Use |
|---|---|---|---|
| `display-hero` | 48 / 1.0 | Fraunces italic 500 | Card first name |
| `display-reveal` | 44 / 1.0 | Fraunces italic 500 | Reveal title |
| `wordmark` (legacy) | Contextual | Fraunces italic 500 | Existing names and display headings only; brand signatures use `BrandLogo` |
| `title` | 30 / 1.1 | Fraunces italic 500 | Secondary headings |
| `body` | 14–14.5 / 1.55 | Figtree 300 | Bio, body copy |
| `label` | 12 / tracking .16em | Jost 400 upper | Button labels |
| `kicker` | 10–11 / tracking .3em | Jost 400 upper | Kickers, venue line |
| `caption` | 10 / tracking .14em | Jost 400 upper | Counts, micro-labels |

### Spacing — 4px base

Scale `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`. Screen content gutter
**24–26**; bottom safe padding **36–40**. Inside a content block
(kicker → name → bio) 12–14; block → action row 22–24.

### Radius

`sm 12 · md 16 · lg 20 · xl 28 · pill 9999`. Inputs = 14. Cards/panels = 20–28.
Buttons, tags, the ♥, reveal CTAs = pill.

### Elevation (tinted velvet, never pure black)

- **0 — ground:** flat `velvet`, one soft wine glow (radial, top) for depth.
- **1 — surface/card:** `bordeaux`, shadow `0 18px 60px rgba(velvet,.45)`,
  optional 1px champagne hairline border (≤ .3 alpha).
- **2 — panel/overlay:** `0 30px 70px rgba(velvet,.55)` + inner top highlight
  `rgba(255,255,255,.05)`.
- Scrims fade to `velvet`, never `#000`. Every shadow is velvet-tinted.

### Motion

- Durations **300–500ms**. Fades. No bounce, no confetti.
- Easing: entrances `cubic-bezier(0.16, 1, 0.3, 1)` (Expo.out); press `scale(0.97)`.
- Signature moments: the ♥ blooms once on tap (soft red halo, fading out); the
  reveal rises like a curtain (slow fade + slight translate), never a jackpot.
- Respect `prefers-reduced-motion`.

### Component rules

- **Hero #1 — Room feed card (locked):** full-bleed cinematic photo, the person
  emerges from a `rose-key` warm light on near-black (chiaroscuro), grain, bottom
  scrim to `velvet`. Bottom content: kicker (red live-dot + "in the room · N
  here"), first name in Fraunces italic (`display-hero`), 2-line bio, one
  champagne 1px hairline, then the action row (♥ + count). No card frame.
- **Hero #2 — Match reveal (locked):** full-`red-deep` screen (radial
  `red → red-deep → wine`, never flat), grain. Centred: two **overlapping**
  circular portraits (front one ringed 3px `red` + 1px champagne), **no badge**.
  Kicker (rose tint) "Mutual energy", title "You both tapped" Fraunces italic
  (cream), 60px champagne hairline, body (rose tint). Two CTAs: primary =
  **cream fill, red-deep label** ("Start the chat"); ghost = cream hairline
  outline. This + the splash are the ONLY full-red screens.
- **Primary button:** `red` fill, `cream` Jost label (≥ 12px), pill. One per
  screen. On full-red screens it inverts: `cream` fill, `red-deep` label.
- **Secondary / ghost:** transparent or `bordeaux`, cream label, 1px hairline
  border. Never a red outline.
- **The ♥ (like) — "red is an event":** discreet at rest (a ghost pill: semi-
  velvet with a blur so it holds on any photo, cream Jost "Tap" label, ♡
  outline), pill, and it turns **`red`** only when tapped (♥ fill + a one-shot
  bloom, "Tapped"). This keeps the 07-03 rule that red is rare (reserved for the
  like action and the full-red match reveal); the "red present" variant tried in
  the #69 rebuild was dropped on the real screen (it read as pre-selected).
- **Champagne hairline:** 1px, `transparent → champagne → transparent`, opacity
  ≤ .5. The only gold. One per screen max.
- **Safety UI (report, block, invisible):** never red — red is love. Blush/cream
  on bordeaux; "alert red" does not exist.
- **Match chat surface (#73):** the chat is a trigger to talk IRL, not a place to
  live in, so it stays calm and gets out of the way. Header: back chevron +
  ringed avatar + first name (Fraunces italic) + **one** presence signal (red
  live-dot + "In the room"; no "now" — the dot says it) + a single `⋯` menu
  folding Report/Block (blush) and language. A pinned opener at the top of the
  thread says it once and softly ("You both tapped." + "Over a drink"), carrying
  the ephemeral without a banner or a popup. **Bubbles are sober**: mine on
  `bordeaux-warm`, received on `bordeaux-deep`, cream text, timestamps both sides
  (Jost, taupe) — no red/wine fill (a coloured "my" bubble dilutes the accent).
  Ambient ground (ember from the composer + wine glow + vignette + grain), never
  a flat fill. One dynamic-viewport page: only the thread scrolls, the composer
  is always visible above the iOS browser bar (`visualViewport` height + `cover`
  safe-area padding).
- **Voice (#43, approved 2026-09-09):** warm, naturally conversational and gently
  complicit, with a light touch of flirtation. Keep copy short and use informal
  address ("tu" in French), consistently across participant surfaces, including
  email preferences. Help people feel at ease and invite an in-person conversation
  without pressure to perform or make the night a success. A heart expresses
  interest, not a commitment or an intense romantic feeling. No gamification
  (score, streak). Describe discretion, visibility, blocking and conversation
  lifetime precisely, with promises grounded in actual product behavior.
  Welcome and match moments can carry more personality; errors and reporting
  should be direct and clear. Adapt that intent naturally to each supported
  language. This approves the voice direction; terminology and individual
  screen copy remain subject to the collaborative #43 review.
- **French interest action (#43, 2026-09-09):** use "J'aime" for the heart button
  instead of "Craquer". The label expresses a light, understandable interest;
  surrounding sentences can carry the brand's warmth. Keep "J’aime" in the
  selected state, with the filled red heart and accessible undo action recorded
  under approved live-room controls below. The approved equivalents are "Like"
  in English and "Me gusta" in Spanish, also unchanged in the selected state.
  These labels are implemented in the current #43 branch.
- **French mutual interest (#43, approved 2026-09-09):** retain "match" as the
  term for reciprocal interest and use "C'est réciproque." as the reveal title.
  A match names the mutual interest that unlocks a conversation. French supporting
  reveal copy and action labels were approved on 2026-09-11 and are recorded below.
  EN/ES equivalents are also approved in the match-reveal table and implemented
  in the current #43 branch.
- **French venue, presence and visibility vocabulary (#43, approved 2026-09-09):**
  use "bar" (or its name) for the physical venue, "soirée" for the Amourette
  experience and participant navigation, and "sur place" for presence. Arrival
  and return labels use "Rejoindre la soirée" and "Retour à la soirée".
  "Room" remains the team's internal screen name; do not introduce a separate
  profile-feed label to participants or rename code identifiers for this choice.
  Prefer "Masquer mon profil" / "Rendre mon profil visible" for discovery pause
  and resume, explaining that presence and conversations are retained. Empty
  discovery does not mean the physical bar is empty, and an ended Amourette
  night does not mean the bar is closing. These approved directions still await
  contextual screen review and implementation.
- **French first-visit landing introduction (#43, approved 2026-09-09):**
  kicker: "Pour oser le premier pas."
  Supporting promise: "Quelqu'un te plaît dans le bar ? Si c'est réciproque,
  un premier message pour briser la glace, puis un bonjour en vrai."
  Lead with the product's purpose, then connect mutual interest to an in-person
  meeting, with messaging as the first step. Additional approved French strings
  are recorded below; this introduction is implemented in the first local #43 lot.
- **English first-visit landing introduction (#43, approved 2026-09-09):**
  kicker: "Making the first move easier."
  Supporting promise: "Someone at the bar caught your eye? If the feeling's
  mutual, a first message to break the ice, then a hello in person."
  Describe the help Amourette provides directly, preserving the French intention
  without adding a personal-courage message.
- **Spanish first-visit landing introduction (#43, approved 2026-09-09):**
  kicker: "Para atreverte a dar el primer paso."
  Supporting promise: "¿Te gusta alguien del bar? Si es mutuo, un primer mensaje
  para romper el hielo y luego un saludo en persona."
  Both adaptations keep the same progression from reciprocal interest to a first
  message and an in-person meeting. These introductions and the supporting
  landing strings below are implemented in the first local #43 lot.
- **Punctuation (#79):** no em dashes (U+2014) in application-authored user-facing
  copy, including EN/FR/ES translations, metadata, accessible labels, emails and
  admin screens. Use natural punctuation or reword the sentence in its language;
  do not mechanically replace em dashes with hyphens. Use a meaningful label for
  missing values. User-written bios/messages, technical comments, generated/vendor
  files and historical documentation are outside this editorial rule.
  `npm run lint` checks string literals, template text and JSX text in `app/`,
  `components/` and the UI dictionaries. Review other copy sources when editing them.

### Approved landing supporting copy (#43, 2026-09-09)

These strings and the introductory copy above are approved in all three languages
and implemented in the first local #43 lot. Deployed mobile visual verification
remains pending.

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| Step 1 | Scanne le QR au bar. | Scan the QR at the bar. | Escanea el QR del bar. |
| Step 2 | Un cœur pour dire « J’aime », en secret. | A heart to like someone in secret. | Un corazón para decir «Me gusta», en secreto. |
| Step 3 | Un match pour commencer à discuter. | A match to start a conversation. | Un match para empezar a hablar. |
| Email invitation | Envie de venir à une soirée Amourette ? | Want to join an Amourette night? | ¿Quieres venir a una noche de Amourette? |
| Email explanation | Laisse ton email pour connaître les prochaines soirées. Tu peux te désinscrire à tout moment. | Leave your email to hear about upcoming nights. You can unsubscribe anytime. | Deja tu email para enterarte de las próximas noches. Puedes darte de baja cuando quieras. |
| Email action | Me prévenir | Keep me posted | Avísame |
| Subscription success | C’est noté. On te prévient des prochaines soirées. | All set. We’ll let you know about upcoming nights. | Listo. Te avisaremos de las próximas noches. |
| Already subscribed | Tu es déjà sur la liste. On te tient au courant. | You’re already on the list. We’ll keep you posted. | Ya estás en la lista. Te mantendremos al tanto. |
| Returning welcome | Content de te revoir | Good to see you again | Qué bueno verte de nuevo |
| Returning instruction | Scanne le QR du bar pour rejoindre la soirée. | Scan the bar’s QR to join tonight. | Escanea el QR del bar para unirte a la noche. |
| Profile action | Modifier mon profil | Edit my profile | Editar mi perfil |
| Session/load failure | Impossible de charger Amourette. Actualise la page pour réessayer. | Couldn’t load Amourette. Refresh the page to try again. | No se ha podido cargar Amourette. Actualiza la página para intentarlo de nuevo. |
| Invalid email | Entre une adresse email valide. | Enter a valid email address. | Introduce una dirección de email válida. |
| Subscription failure | Impossible d’enregistrer ton email. Réessaie dans un instant. | Couldn’t save your email. Try again in a moment. | No hemos podido guardar tu email. Inténtalo de nuevo en un momento. |

Email signup promises announcements about upcoming Amourette nights, without
claiming a nearby bar opening: the landing form does not collect a location.
Public failure copy gives an actionable next step without speculating about
anonymous-auth configuration. Refreshing uses the browser's existing action;
no new retry control is implied by this copy decision.

### Approved profile-creation copy (#43, 2026-09-09)

The question/preview copy and shared labels below are approved in all three
languages and implemented in the first local #43 lot. Approved supporting/error strings are implemented in the second lot below;
deployed mobile visual verification is tracked with that checkpoint. Keep the existing
question order, fields and behavior; the preview wording does not change the
persistent-identity model.

| Screen | Approved French title | Approved French help |
| --- | --- | --- |
| First name | On t’appelle comment ? | Le prénom par lequel on te connaît. |
| Photo | Une photo pour te reconnaître | Choisis une photo où l’on voit clairement ton visage. |
| Gender | Tu es… | No additional help text. |
| Preferences | Tu aimerais rencontrer… | Choisis une ou plusieurs options. |
| Bio | Deux mots sur toi | Facultatif : une passion, ce qui te fait rire, ou ce qui t’amène ce soir. |
| Preview | Ton profil pour la soirée | No additional help text. |

| Screen | Approved English title/help | Approved Spanish title/help |
| --- | --- | --- |
| First name | **What should we call you?** The first name people know you by. | **¿Cómo te llamamos?** El nombre por el que te conocen. |
| Photo | **Help people recognize you** Choose a photo that clearly shows your face. | **Una foto para reconocerte** Elige una foto en la que se vea claramente tu cara. |
| Gender | **You are…** No additional help text. | **Eres…** No additional help text. |
| Preferences | **You’d like to meet…** Pick one or more options. | **Te gustaría conocer…** Elige una o varias opciones. |
| Bio | **A few words about you** Optional: a passion, what makes you laugh, or what brings you here tonight. | **Unas palabras sobre ti** Opcional: algo que te apasiona, lo que te hace reír o lo que te trae aquí esta noche. |
| Preview | **Your profile for tonight** No additional help text. | **Tu perfil para esta noche** No additional help text. |

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| Next step | Continuer | Continue | Continuar |
| Previous step | Retour | Back | Volver |
| Replace photo | Changer de photo | Change photo | Cambiar foto |
| Submit profile | Rejoindre la soirée | Join tonight | Unirme a la noche |
| Adult confirmation | Je confirme avoir 18 ans ou plus. | I confirm that I am 18 or older. | Confirmo que tengo 18 años o más. |
| Shared reassurance | Tes J’aime restent secrets, sauf si c’est réciproque. | Your likes stay private unless the feeling is mutual. | Tus «Me gusta» son secretos, salvo cuando el interés es mutuo. |

The reassurance describes discreet interest rather than promising unrestricted
control over who can see a profile. Apply the approved words to their intended
surface; shared dictionary keys must be checked in their other contexts before
changing them.

### Approved live-entry copy (#43, 2026-09-09)

The threshold and first-discovery reminder below are approved in all three
languages for the next copy lot. Implemented in the current #43 branch. Preserve
the existing display conditions: the threshold requires an eligible entry and a
confirmed live night; the one-time reminder appears when profiles are available.
The venue name and optional city stay dynamic, not fixed copy.

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| Threshold welcome | Bienvenue à la soirée | Welcome | Te damos la bienvenida |
| Threshold status | Soirée en cours | Night in progress | Noche en curso |
| Threshold reassurance | Tes J’aime restent secrets, sauf si c’est réciproque. | Your likes stay private unless the feeling is mutual. | Tus «Me gusta» son secretos, salvo cuando el interés es mutuo. |
| First-discovery title | Quelqu’un te plaît ? | Someone caught your eye? | ¿Te gusta alguien? |
| First-discovery explanation | Appuie sur le cœur pour dire « J’aime ». Si c’est réciproque, vous avez un match et une conversation s’ouvre. Sinon, ton J’aime reste secret. | Tap the heart to like someone. If the feeling’s mutual, you match and a conversation opens. Otherwise, your like stays private. | Pulsa el corazón para decir «Me gusta». Si el interés es mutuo, tenéis un match y se abre una conversación. Si no, tu «Me gusta» sigue siendo secreto. |
| First-discovery dismissal | Compris | Got it | Entendido |

### Approved pre-launch waiting copy (#43, 2026-09-09)

The waiting-state copy below is approved in all three languages and implemented in the current #43 branch. Venue name, participant count and the formatted
guaranteed launch time remain dynamic. "12" in the discussion was an example,
not a fixed count. Preserve existing singular/plural handling and launch rules.

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| Waiting count | {count} personne(s) en attente | {count} person/people waiting | {count} persona(s) esperando |
| Title | La soirée se prépare. | Getting ready to start. | La noche se prepara. |
| Body | Tu as bien rejoint la soirée. Tu pourras découvrir qui est là et envoyer des J’aime dès son lancement. | You’re in. Once the night starts, you can see who’s here and send likes. | Ya te has unido a la noche. Cuando empiece, podrás ver quién está aquí y dar «Me gusta». |
| Guaranteed launch | Début au plus tard à {time} | Starting by {time} at the latest | Empezamos como muy tarde a las {time} |
| Earlier launch | Elle peut commencer plus tôt si assez de personnes ont rejoint la soirée. | It may start earlier if enough people have joined. | Puede empezar antes si se han unido suficientes personas. |

The count row describes singular/plural variants; do not display literal
parentheses or slashes. Shared bio/email-card copy is tracked below.

### Approved shared bio/email-card copy (#43, 2026-09-09)

These strings are approved in all three languages for both pre-launch waiting
and the empty live room. Implemented in the current #43 branch. Preserve the
existing card actions, email consent checkbox, unsubscribe option and display
conditions. The bio remains optional.

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| Empty bio title | Deux mots pour faire connaissance | A few words to break the ice | Unas palabras para conocerte |
| Empty bio badge | Facultatif | Optional | Opcional |
| Empty bio body | Une passion ou une anecdote peut aider à lancer la conversation. | A passion or a story can help start a conversation. | Una pasión o una anécdota puede ayudar a iniciar la conversación. |
| Existing bio title | Envie d’ajouter un détail ? | Want to add a detail? | ¿Quieres añadir un detalle? |
| Existing bio body | Modifie ta bio pour en dire un peu plus sur toi. | Edit your bio to share a little more about yourself. | Edita tu bio para contar un poco más de ti. |
| Email title | On te prévient des prochaines soirées ? | Want to hear about upcoming nights? | ¿Te avisamos de las próximas noches? |
| Email body | Laisse ton email pour recevoir les prochaines dates. | Leave your email to hear when the next nights are happening. | Deja tu email para recibir las próximas fechas. |
| Email submit | Me prévenir | Keep me posted | Avísame |
| Email dismiss | Pas maintenant | Not now | Ahora no |
| Email confirmation | On te prévient des prochaines soirées. | We’ll let you know about upcoming nights. | Te avisaremos de las próximas noches. |

### Approved empty live-room copy (#43, 2026-09-09)

These strings are approved in all three languages and implemented in the current #43 branch.
Preserve the three existing variants from `lib/empty-room.ts` and
their privacy boundary. Counts refer to app participation, not physical bar
occupancy. An unreadable count uses the neutral `live` variant.

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| Alone title | C’est calme sur Amourette. | It’s quiet on Amourette. | Todo está tranquilo en Amourette. |
| Alone body | Il n’y a personne d’autre sur Amourette dans ce bar pour le moment. | No one else is on Amourette at this bar right now. | De momento, no hay nadie más en Amourette en este bar. |
| Emptied title | C’est plus calme sur Amourette. | It’s quieter on Amourette. | Ahora hay más calma en Amourette. |
| Emptied body | Il n’y a plus d’autre personne sur Amourette ici pour le moment. | For now, there’s no one else on Amourette here. | De momento, ya no hay nadie más en Amourette aquí. |
| Live/no-discovery title | Personne à découvrir pour le moment. | No profiles available right now. | No hay perfiles disponibles por ahora. |
| Live/no-discovery body | De nouveaux profils peuvent apparaître au fil de la soirée. | New profiles may appear as the night goes on. | Pueden aparecer nuevos perfiles a lo largo de la noche. |
| Last profile disappears | Il n’y a plus de profil à afficher pour le moment. | No more profiles to show right now. | Por ahora, no quedan perfiles para mostrar. |
| Profile available during email entry | Un nouveau profil est disponible. Découvrir | A new profile is available. Take a look | Hay un nuevo perfil disponible. Ver perfil |
| Shared-card kicker | En attendant | Meanwhile | Mientras tanto |

The held-profile cue describes availability rather than asserting a physical
arrival: a participant becoming visible again can also make a profile available.
Do not attribute absent profiles to blocks, preference mismatches or visibility
choices, or promise future arrivals or notifications. Other room arrival labels
are tracked with the live-room controls below.

### Approved live-room controls (#43, 2026-09-09)

These controls and notices are approved in all three languages and implemented in the current #43 branch. Preserve existing heart-toggle behavior. The visible
label remains the same in both states; the filled red heart and accessible undo
action distinguish the selected state. Counts and participant names are dynamic.

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| Heart, unselected | ♡ J’aime | ♡ Like | ♡ Me gusta |
| Heart, selected | ♥ J’aime | ♥ Like | ♥ Me gusta |
| Accessible undo | Retirer mon J’aime pour {name} | Unlike {name} | Quitar mi «Me gusta» del perfil de {name} |
| Presence count | {count} sur place | {count} here now | {count} aquí ahora |
| Match count | {count} match(s) | {count} match/matches | {count} match/matches |
| Recent check-in badge | Vient de rejoindre la soirée | Just joined | Acaba de unirse |
| Newly available profile cue | Un nouveau profil à découvrir ↓ | A new profile to discover ↓ | Un nuevo perfil por descubrir ↓ |
| Overflow menu name | Options de la soirée | Night options | Opciones de la noche |
| Edit profile | Modifier mon profil | Edit my profile | Editar mi perfil |
| Hide profile | Masquer mon profil | Hide my profile | Ocultar mi perfil |
| Leave | Quitter la soirée | Leave | Salir |
| Like failure | Ton J’aime n’a pas pu être enregistré. Réessaie. | Your like couldn’t be saved. Try again. | No se ha podido guardar tu «Me gusta». Inténtalo de nuevo. |
| Unlike failure | Ton J’aime n’a pas pu être retiré. Réessaie. | Your like couldn’t be removed. Try again. | No se ha podido quitar tu «Me gusta». Inténtalo de nuevo. |

The heart symbols represent the existing button icons, not duplicate characters
to add to dictionary labels. Localize singular/plural counts without literal
parentheses. The recent check-in badge reflects the app check-in timestamp;
the broader new-profile cue describes availability rather than physical arrival.

### Approved profile-hiding and leave-confirmation copy (#43, 2026-09-09)

These strings are approved in all three languages and implemented in the current #43 branch.
Explain existing behavior, not new controls or retention rules:
hiding pauses discovery in both directions while presence and conversations
remain; leaving ends presence and pauses messaging. The venue name already
appears above the leave confirmation.

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| Hidden title | Ton profil est masqué | Your profile is hidden | Tu perfil está oculto |
| Hidden body | Ton profil n’est plus proposé aux autres, et tu ne peux plus parcourir les profils. Tu restes compté·e sur place et tes conversations restent accessibles. | Your profile is no longer shown in discovery, and you can’t browse other profiles. You’re still checked in, and your conversations remain available. | Tu perfil ya no se muestra entre los perfiles disponibles y tú tampoco puedes explorar los demás. Sigues contando como presente y tus conversaciones siguen disponibles. |
| Resume discovery | Rendre mon profil visible | Make my profile visible | Hacer visible mi perfil |
| Leave action | Quitter la soirée | Leave | Salir |
| Leave-confirmation title | Quitter la soirée ? | Leave? | ¿Salir? |
| Leave-confirmation body | Ton profil ne sera plus proposé et tu ne seras plus compté·e sur place. L’envoi de messages sera mis en pause. | Your profile will no longer appear in discovery, and you’ll no longer count as here. Messaging will be paused. | Tu perfil dejará de mostrarse entre los perfiles disponibles y ya no contarás como presente. El envío de mensajes quedará en pausa. |
| Retention explanation | Tes J’aime, matchs et conversations sont conservés jusqu’à la fin de la soirée. | Your likes, matches and conversations are kept until the night ends. | Tus «Me gusta», matches y conversaciones se conservan hasta el final de la noche. |
| Stay action | Rester | Stay | Quedarme |

### Approved departure and return copy (#43, FR 2026-09-09; EN/ES 2026-09-11)

These strings are approved in all three languages and implemented in the current #43 branch.
Preserve explicit re-entry, the existing action order on each screen
and the co-presence/night-lifetime rules. The return title asks about physical
presence rather than assuming that reopening a page proves arrival at the bar.

| Element | Approved French copy | Approved English copy | Approved Spanish copy |
| --- | --- | --- | --- |
| After leaving: title | Tu as quitté la soirée | You’ve left | Has salido |
| After leaving: body | Tu n’es plus compté·e sur place et l’envoi de messages est en pause. Tes J’aime, matchs et conversations sont conservés jusqu’à la fin de la soirée. | You’re no longer checked in, and messaging is paused. Your likes, matches and conversations are kept until the night ends. | Ya no cuentas como presente y el envío de mensajes está en pausa. Tus «Me gusta», matches y conversaciones se conservan hasta el final de la noche. |
| Return: title | De retour sur place ? | Back at the bar? | ¿De vuelta en el bar? |
| Return: body | Rejoins la soirée pour être à nouveau compté·e sur place. Tes conversations pourront reprendre si vous êtes tous les deux présents avant la fin de la soirée. | Join again to check back in. Your conversations can resume if you’re both here before the night ends. | Vuelve a unirte para contar de nuevo como presente. Tus conversaciones podrán continuar si ambas personas están aquí antes de que termine la noche. |
| Rejoin action | Rejoindre la soirée | Join tonight | Unirme a la noche |
| Home action | Retour à l’accueil | Back to home | Volver al inicio |
| Leave failure | Impossible de quitter la soirée. Réessaie. | Couldn’t leave. Try again. | No se ha podido salir. Inténtalo de nuevo. |
| Visibility failure | Impossible de modifier la visibilité de ton profil. Réessaie. | Couldn’t change your profile’s visibility. Try again. | No se ha podido cambiar la visibilidad de tu perfil. Inténtalo de nuevo. |

### Approved night-access state copy (#43, 2026-09-11)

These titles and bodies are approved in all three languages and implemented in the current #43 branch. Keep the existing state selection and recovery
behavior. No available night does not establish an upcoming scheduled night;
pause and closure refer to the Amourette experience, not physical bar operations.

| State | Approved French title | Approved French body |
| --- | --- | --- |
| No open night | Pas de soirée ouverte pour le moment | Scanne le QR du bar lors d’une soirée Amourette pour la rejoindre. |
| Paused | La soirée est en pause | L’accès à cette soirée est temporairement suspendu. Cette page se mettra à jour si elle reprend. |
| Cancelled | La soirée est annulée | Tu n’es plus compté·e sur place pour cette soirée Amourette. |
| Ended | La soirée est terminée | Les J’aime, matchs et conversations de cette soirée ne sont plus disponibles. Ton profil reste enregistré. |
| Load failure | Impossible de charger la soirée | Actualise la page pour réessayer. |
| Unknown link | Ce lien ne correspond à aucun bar | Scanne le QR affiché dans le bar pour rejoindre sa soirée Amourette. |

| State | Approved English title/body | Approved Spanish title/body |
| --- | --- | --- |
| No open night | **No night to join right now** Scan the bar’s QR during an Amourette night to join. | **No hay ninguna noche de Amourette disponible ahora** Escanea el QR del bar durante una noche de Amourette para unirte. |
| Paused | **The night is paused** Access to this night is temporarily suspended. This page will update if the night resumes. | **La noche está en pausa** El acceso a esta noche está suspendido temporalmente. Esta página se actualizará si se reanuda. |
| Cancelled | **The night is cancelled** You’re no longer checked in for this Amourette night. | **La noche se ha cancelado** Ya no cuentas como presente en esta noche de Amourette. |
| Ended | **The night has ended** Likes, matches and conversations from this night are no longer available. Your profile is still saved. | **La noche ha terminado** Los «Me gusta», matches y conversaciones de esta noche ya no están disponibles. Tu perfil sigue guardado. |
| Load failure | **Couldn’t load this page** Refresh the page to try again. | **No se ha podido cargar esta página** Actualiza la página para intentarlo de nuevo. |
| Unknown link | **This link doesn’t match any bar** Scan the QR displayed at the bar to join its Amourette night. | **Este enlace no corresponde a ningún bar** Escanea el QR que encontrarás en el bar para unirte a su noche de Amourette. |

Refreshing refers to the browser action; no new retry button is introduced.
The ended-state text describes the existing ephemeral night data and persistent
profile model. Use the separately approved home action wherever it already exists.

### Approved match-reveal copy (#43, 2026-09-11)

Copy is approved in all three languages and implemented in the current #43 branch.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Kicker (`matchKicker`) | Un match | A match | Un match |
| Title (`matchTitle`) | C’est réciproque. | The feeling’s mutual. | Es mutuo. |
| Body (`matchBody`) | Un premier message pour vous retrouver ? | A first message to meet up? | ¿Un primer mensaje para encontraros? |
| Primary action (`openChat`) | Écrire un message | Write a message | Escribir un mensaje |
| Dismiss action (`matchDismiss`) | Retour à la soirée | Back to tonight | Volver a la noche |

The body gently invites an in-person meeting through a first message. The primary
label names the next action, while dismissal uses the approved night-navigation
vocabulary. Preserve the existing conversation link and reveal dismissal behavior.

### Approved conversation-opening copy (#43, 2026-09-11)

Copy is approved in all three languages and implemented in the current #43 branch.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Opening title (`chat.openerTitle`) | C’est réciproque. | The feeling’s mutual. | Es mutuo. |
| Lifetime note (`chat.openerNote`) | Cette conversation est disponible jusqu’à la fin de la soirée. | This conversation is available until the night ends. | Esta conversación está disponible hasta el final de la noche. |
| Empty conversation (`chat.empty`) | Aucun message pour l’instant. Envie de faire le premier pas ? | No messages yet. Feel like making the first move? | Aún no hay mensajes. ¿Te apetece dar el primer paso? |
| Return (`chat.backToRoom`) | Retour à la soirée | Back to tonight | Volver a la noche |
| Send (`chat.send`) | Envoyer | Send | Enviar |
| First suggestion | Tu es où dans le bar ? | Where are you in the bar? | ¿Dónde estás en el bar? |
| Second suggestion | On se retrouve près du bar ? | Want to meet by the bar? | ¿Nos vemos junto a la barra? |
| Third suggestion | Je viens te dire bonjour ? | Shall I come say hi? | ¿Me acerco a saludarte? |

Explicitly attach the time limit to the conversation. The proposed "Pour ce soir"
under the reciprocal-interest title could instead imply that the interest itself
expires. The empty state invites a first move without pressure, and the suggestions
help participants find each other in person. Selecting a suggestion fills the draft;
the participant still chooses whether to send it. Preserve that behavior and existing
night-scoped access, messaging availability and retention rules.

### Approved conversation-state copy (#43, 2026-09-11)

French copy is approved. Marwane also authorized the English/Spanish adaptations
for this block without a separate presentation. Implemented in the current #43 branch.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Loading (`chat.loading`) | Ouverture de la conversation… | Opening the conversation… | Abriendo la conversación… |
| Other participant present (`chat.presence`) | Sur place | Here now | Aquí ahora |
| Other participant departed (`chat.departed`) | A quitté la soirée | Has left | Ha salido |
| Messaging paused (`chat.messagingPaused`) | L’envoi de messages est en pause. Vous pourrez reprendre si vous êtes à nouveau tous les deux sur place avant la fin de la soirée. | Messaging is paused. You can resume if you’re both back here before the night ends. | El envío de mensajes está en pausa. Podréis continuar si volvéis a estar aquí los dos antes de que termine la noche. |
| Closed (`chat.closed`) | Cette conversation n’est plus disponible. | This conversation is no longer available. | Esta conversación ya no está disponible. |
| Access failure (`chat.unavailable`) | Impossible d’ouvrir cette conversation. | Couldn’t open this conversation. | No se ha podido abrir esta conversación. |

The closed state also appears after the participant blocks the other person, so
it must not claim that the match expired. Presence labels and the pause explanation
retain the existing co-presence requirement and end-of-night limit. This approval
covers wording only, with no changes to access, blocking or messaging behavior.

### Approved conversation-list and practical copy (#43, 2026-09-11)

The conversation-list hint (`room.conversationHint`) is approved in all three
languages and implemented in the current #43 branch. Keep the French heading "Conversations".

| French | English | Spanish |
| --- | --- | --- |
| Retrouve ici tes conversations après un match. | Find your conversations here after a match. | Aquí encontrarás tus conversaciones después de un match. |

The list explains where conversations live; the opening screen already provides
the invitation to meet in person.

Retain these existing French practical labels, approved as already clear:

| Element | French |
| --- | --- |
| Sending (`chat.deliverySending`) | Envoi… |
| Failed delivery (`chat.deliveryFailed`) | Non envoyé |
| Retry (`chat.deliveryRetry`) | Réessayer |
| Send failure (`chat.sendError`) | Impossible d'envoyer ton message. Réessaie. |
| View profile (`chat.viewProfile`) | Voir le profil de {name} |
| Close profile (`chat.closeProfile`) | Fermer le profil |
| Return to conversation (`chat.backToConversation`) | Retour à la conversation |

Preserve dynamic participant names and existing delivery and navigation behavior.

### Approved blocking copy (#43, 2026-09-11)

Copy is approved in all three languages and implemented in the current #43 branch.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Title (`room.blockTitle`) | Bloquer {name} ? | Block {name}? | ¿Bloquear a {name}? |
| Explanation (`room.blockBody`) | Vos profils ne seront plus visibles l’un pour l’autre sur Amourette et vos conversations seront fermées. Cette personne ne recevra aucune notification. | Your profiles will no longer be visible to each other on Amourette, and your conversations will be closed. This person won’t receive a notification. | Vuestros perfiles dejarán de ser visibles el uno para el otro en Amourette y vuestras conversaciones se cerrarán. Esta persona no recibirá ninguna notificación. |
| Submit (`room.blockSubmit`) | Bloquer cette personne | Block this person | Bloquear a esta persona |
| Cancel (`room.reportCancel`) | Annuler | Cancel | Cancelar |
| Failure (`room.blockError`) | Impossible de bloquer cette personne. Réessaie. | Couldn’t block this person. Try again. | No se ha podido bloquear a esta persona. Inténtalo de nuevo. |

The visibility statement explicitly applies to Amourette, since participants may
still encounter each other in the bar. Promise no notification rather than claiming
the other person can never learn or infer that a block occurred. The existing native
chat confirmation (`room.blockConfirm`) should use the approved title and explanation
together. Preserve dynamic names, blocking behavior and existing confirmation steps;
reason and note fields remain subject to review.

### Approved reporting copy (#43, 2026-09-11)

French copy and the English/Spanish adaptation direction are approved. The table
includes the presented translations and straightforward adaptations of the remaining
labels. The block is implemented in the current #43 branch, including the shared
"Personne mineure" reporting/blocking reason label.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Title (`room.reportTitle`) | Signaler {name} | Report {name} | Reportar a {name} |
| Report reason field | Motif du signalement | Reason for reporting | Motivo del reporte |
| Optional details (`room.reportNote`) | Ajouter des précisions (facultatif) | Add details (optional) | Añadir detalles (opcional) |
| Required details (`room.reportNoteRequired`) | Explique ce qui s’est passé (obligatoire) | Explain what happened (required) | Explica qué ha pasado (obligatorio) |
| Submit (`room.reportSubmit`) | Envoyer le signalement | Send report | Enviar reporte |
| Success (`room.reportSuccess`) | Ton signalement a été envoyé. | Your report has been sent. | Tu reporte se ha enviado. |
| Optional block (`room.reportBlockPrompt`) | Souhaites-tu aussi bloquer cette personne ? | Would you also like to block this person? | ¿Quieres bloquear también a esta persona? |
| Before submission | Annuler | Cancel | Cancelar |
| After submission | Fermer | Close | Cerrar |
| Harassment reason | Harcèlement | Harassment | Acoso |
| Fake-profile reason | Faux profil | Fake profile | Perfil falso |
| Underage reason | Personne mineure | Underage person | Persona menor de edad |
| Unsafe-behavior reason | Comportement dangereux | Unsafe behavior | Comportamiento peligroso |
| Other reason | Autre | Other | Otro |

"Fermer" must only replace the dismissal label after successful submission:
closing that confirmation does not cancel a report. The report-specific reason
label must not call a standalone block a report, even where the current dictionary
key is shared. Preserve existing categories and the required explanation for
"Autre". Reporting and blocking remain separate actions; no response time or
moderation outcome is promised. Approved French failure copy and standalone
blocking reason labels are recorded below.

Review finding: standalone blocking currently differs by entry point. The night
screen keeps reasons folded and details optional, including for "Autre"; chat
shows the reason field immediately and requires details for "Autre". Chat also
appends the literal English "required" to an optional-details placeholder. Copy
must reflect the actual requirement in each form; aligning the underlying rules
is an open product question, not an approved behavior change in this pass.

### Approved reporting errors and blocking reason labels (#43, 2026-09-11)

Copy is approved in all three languages and implemented in the current #43 branch.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Report failure (`room.reportError`) | Impossible d’envoyer ton signalement. Réessaie. | Couldn’t send your report. Try again. | No se ha podido enviar tu reporte. Inténtalo de nuevo. |
| Missing details (`room.reportNoteRequiredError`) | Pour le motif « Autre », explique ce qui s’est passé. | For “Other”, explain what happened. | Si eliges «Otro», explica qué ha pasado. |
| Reporting eligibility (`room.reportEligibilityError`) | Tu peux uniquement signaler une personne qui a rejoint la même soirée que toi. | You can only report someone who joined the same night as you. | Solo puedes reportar a alguien que se haya unido a la misma noche que tú. |
| Standalone block reason field | Motif du blocage | Reason for blocking | Motivo del bloqueo |
| Optional reason disclosure (`room.blockReasonOptional`) | Ajouter un motif (facultatif) | Add a reason (optional) | Añadir un motivo (opcional) |

Eligibility depends on both participants having joined the same venue night, not
on both still being present. Use distinct reporting and blocking field labels,
preserving the existing categories, validation rules and optional-field behavior.
These copy approvals do not resolve the entry-point behavior difference noted above.

### Approved profile-editing copy (#43, 2026-09-11)

Copy is approved in all three languages and implemented in the current #43 branch.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Title (`profile.editTitle`) | Modifier mon profil | Edit my profile | Editar mi perfil |
| Introduction (`profile.editSubtitle`) | Une nouvelle photo, quelques mots en plus ? | A new photo, a few more words? | ¿Una foto nueva, unas palabras más? |
| Bio placeholder (`profile.bioOptional`) | Bio (facultative) | Bio (optional) | Bio (opcional) |
| Gender (`profile.iAm`) | Je suis | I am | Soy |
| Preferences (`profile.iWantToMeet`) | J’aimerais rencontrer | I’d like to meet | Me gustaría conocer |
| Save (`profile.saveChanges`) | Enregistrer les modifications | Save changes | Guardar cambios |
| Return (`profile.back`) | Retour | Back | Volver |
| Discard title (`profile.discardTitle`) | Abandonner les modifications ? | Discard changes? | ¿Descartar los cambios? |
| Discard explanation (`profile.discardBody`) | Tes modifications ne seront pas enregistrées. | Your changes won’t be saved. | Tus cambios no se guardarán. |
| Discard action (`profile.discardConfirm`) | Abandonner les modifications | Discard changes | Descartar los cambios |
| Continue editing (`profile.discardKeep`) | Continuer à modifier | Keep editing | Seguir editando |

The introduction adds light warmth, while field and action labels remain explicit.
Use the approved optional-bio placeholder wherever the existing shared key appears,
including onboarding. Preserve editable fields, destinations and the existing
unsaved-change confirmation behavior.

### Approved profile validation and age copy (#43, 2026-09-11)

French copy is approved. Marwane also authorized the English/Spanish adaptations
for this block without a separate presentation. Implemented in the current #43 branch.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Age explanation (`profile.ageSubtitle`) | Amourette est réservé aux personnes de 18 ans et plus. | Amourette is for people aged 18 and over. | Amourette es para personas de 18 años o más. |
| Name length (`profile.firstNameTooLong`) | Ton prénom peut contenir jusqu’à 30 caractères. | Your first name can be up to 30 characters long. | Tu nombre puede tener hasta 30 caracteres. |
| Bio length (`profile.bioTooLong`) | Ta bio peut contenir jusqu’à 500 caractères. | Your bio can be up to 500 characters long. | Tu bio puede tener hasta 500 caracteres. |
| Photo format (`profile.photoInvalidType`) | Choisis une photo au format JPG, PNG ou WebP. | Choose a photo in JPG, PNG or WebP format. | Elige una foto en formato JPG, PNG o WebP. |
| Photo size (`profile.photoTooLarge`) | Choisis une photo de 5 Mo maximum. | Choose a photo no larger than 5 MB. | Elige una foto de 5 MB como máximo. |
| Photo upload (`profile.photoUploadFailed`) | Impossible d’envoyer ta photo. Réessaie. | Couldn’t upload your photo. Try again. | No se ha podido subir tu foto. Inténtalo de nuevo. |
| Session failure (`profile.sessionError`) | Impossible de démarrer ta session. Actualise la page pour réessayer. | Couldn’t start your session. Refresh the page to try again. | No se ha podido iniciar tu sesión. Actualiza la página para intentarlo de nuevo. |
| Missing name (`profile.needFirstName`) | Entre ton prénom. | Enter your first name. | Introduce tu nombre. |
| Missing photo (`profile.needPhoto`) | Ajoute une photo de profil. | Add a profile photo. | Añade una foto de perfil. |
| Missing gender (`profile.needGender`) | Choisis ton genre. | Choose your gender. | Elige tu género. |
| Missing preferences (`profile.needInterest`) | Choisis qui tu veux rencontrer. | Choose who you’d like to meet. | Elige a quién te gustaría conocer. |
| Adult confirmation (`profile.needAdult`) | Confirme que tu as 18 ans ou plus. | Confirm that you’re 18 or older. | Confirma que tienes 18 años o más. |

Keep validation limits and accepted formats unchanged; the photo-size limit is
inclusive. The session recovery instruction refers to a browser refresh, without
adding a new control. Photo rejection and review-failure feedback remain owned by
#194. This approval covers copy, not age, upload or moderation behavior.

### Approved email-preference state copy (#43, 2026-09-11)

French copy is approved, with English/Spanish adaptations directly authorized for
this block. Implemented in `lib/email-preference-strings.ts`.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Title | Préférences email | Email preferences | Preferencias de email |
| Loading | Chargement de tes préférences… | Loading your preferences… | Cargando tus preferencias… |
| No subscription | Tu n’es pas inscrit·e aux annonces des prochaines soirées Amourette. | You’re not subscribed to announcements about upcoming Amourette nights. | No tienes una suscripción a los anuncios de las próximas noches de Amourette. |
| Active subscription | Tu es inscrit·e aux annonces des prochaines soirées Amourette. | You’re subscribed to announcements about upcoming Amourette nights. | Tienes una suscripción a los anuncios de las próximas noches de Amourette. |
| Unsubscribed | Tu es désinscrit·e. Tu peux te réinscrire à tout moment. | You’ve unsubscribed. You can subscribe again at any time. | Te has dado de baja. Puedes volver a suscribirte en cualquier momento. |
| Subscribe | M’inscrire | Subscribe | Suscribirme |
| Resubscribe | Me réinscrire | Subscribe again | Volver a suscribirme |
| Unsubscribe | Me désinscrire | Unsubscribe | Darme de baja |
| Invalid email | Entre une adresse email valide. | Enter a valid email address. | Introduce una dirección de email válida. |
| Failure | Impossible de mettre à jour tes préférences. Réessaie. | Couldn’t update your preferences. Try again. | No se han podido actualizar tus preferencias. Inténtalo de nuevo. |

Use informal participant address consistently and describe the specific upcoming-night
announcement subscription. Preserve subscription state selection and existing actions.
Consent, privacy information and the public unsubscribe flow are separate review blocks.

### Approved public email-unsubscribe copy (#43, 2026-09-11)

French copy and its English/Spanish adaptations are approved. Implemented in `lib/email-preference-strings.ts`.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Title (`publicTitle`) | Se désinscrire des emails | Unsubscribe from emails | Darse de baja de los emails |
| Explanation (`publicConfirm`) | Confirme que tu ne souhaites plus recevoir les annonces des prochaines soirées Amourette. Ce choix s’applique partout où cette adresse email a été utilisée. | Confirm that you no longer want announcements about upcoming Amourette nights. This choice applies everywhere this email address has been used. | Confirma que ya no quieres recibir anuncios sobre las próximas noches de Amourette. Esta decisión se aplica en todos los lugares donde se haya usado esta dirección de email. |
| Action (`publicAction`) | Confirmer la désinscription | Confirm unsubscribe | Confirmar la baja |
| Success (`publicUnsubscribed`) | Tu es désinscrit·e des annonces des prochaines soirées Amourette. | You’ve unsubscribed from announcements about upcoming Amourette nights. | Te has dado de baja de los anuncios de las próximas noches de Amourette. |
| Already unsubscribed (`publicAlready`) | Cette adresse email est déjà désinscrite. | This email address is already unsubscribed. | Esta dirección de email ya está dada de baja. |
| Invalid link (`publicInvalid`) | Ce lien de désinscription est invalide ou a expiré. | This unsubscribe link is invalid or has expired. | Este enlace de baja no es válido o ha caducado. |
| Failure (`publicError`) | Impossible de traiter ta demande. Actualise la page pour réessayer. | Couldn’t process your request. Refresh the page to try again. | No se ha podido procesar tu solicitud. Actualiza la página para intentarlo de nuevo. |
| Return (`back`) | Retour à Amourette | Back to Amourette | Volver a Amourette |

Use informal participant address while preserving address-wide unsubscribe scope
and the explicit confirmation action. The failure instruction refers to a browser
refresh because the failure screen has no retry control. Preserve token validation,
state selection and subscription behavior.

### Approved email consent and privacy wording (#43, 2026-09-11)

French wording and its English/Spanish adaptations are approved. Implemented in `lib/email-preference-strings.ts`. This is an editorial adaptation
of the existing information, not a change to data handling or privacy rights.

| Element | French | English | Spanish |
| --- | --- | --- | --- |
| Consent (`consent`) | J’accepte de recevoir par email les annonces des prochaines soirées Amourette. Je pourrai me désinscrire à tout moment. | I agree to receive email announcements about upcoming Amourette nights. I can unsubscribe at any time. | Acepto recibir por email anuncios de las próximas noches de Amourette. Podré darme de baja en cualquier momento. |
| Privacy title (`privacyTitle`) | Ta vie privée | Your privacy | Tu privacidad |
| Data explanation (`privacy`) | Nous conservons ton adresse email, ta langue, ainsi que l’origine et les dates de ton consentement uniquement pour t’envoyer ces annonces facultatives et respecter tes choix. Ta désinscription prend effet immédiatement. Nous en conservons une trace minimale pour éviter de te renvoyer des emails par erreur. | We keep your email address, language, and the source and dates of your consent only to send you these optional announcements and respect your choices. Unsubscribing takes effect immediately. We keep a minimal record of it to avoid emailing you again by mistake. | Conservamos tu dirección de email, tu idioma, y el origen y las fechas de tu consentimiento únicamente para enviarte estos anuncios opcionales y respetar tus decisiones. La baja tiene efecto inmediato. Conservamos un registro mínimo para evitar volver a enviarte emails por error. |
| Rights (`rights`) | Tu peux demander l’accès à tes données, leur rectification ou leur effacement, t’opposer à leur traitement et saisir ton autorité de protection des données. | You can request access to your data, its correction or deletion, object to its processing, and lodge a complaint with your data-protection authority. | Puedes solicitar el acceso a tus datos, su rectificación o supresión, oponerte a su tratamiento y presentar una reclamación ante tu autoridad de protección de datos. |
| Pending contact (`contactPending`) | Un canal de contact dédié à la vie privée sera publié avant l’ouverture publique du service. | A privacy contact channel will be published before the service opens publicly. | Publicaremos un canal de contacto dedicado a la privacidad antes de abrir el servicio al público. |

Consent follows the existing upcoming-night signup wording and names the ability
to unsubscribe. Privacy copy uses informal address and explains the existing
minimal suppression record in plain language. Preserve explicit opt-in, the
stated purpose, consent records, withdrawal effect and existing contact status.

### Vocabulary implementation checkpoint (#43, 2026-09-09)

Marwane authorized implementing and locally committing the approved landing and
profile-creation copy before continuing the collaborative screen review. The
change uses the existing dictionaries and rendering. Shared profile entry and
photo-change labels also appear on age confirmation and profile editing; existing
onboarding browser-test selectors now use the approved "Join tonight" label.

Validation: lint, the logic suite and TypeScript pass after `next typegen` generates
the route types. No new behavior is introduced, so no new test suite was added;
existing browser assertions are preserved with updated button selectors. The
production build, browser journeys and Vercel mobile visual review have not run
for this local checkpoint. Publishing and final delivery remain separate steps.

The room/match/chat vocabulary decisions were still awaiting review and
implementation at this first checkpoint. Marwane is handling reason-specific photo rejection in
#194; that issue owns the reasons and corresponding feedback. #43 will harmonize
the wording after that work settles. At this checkpoint, the other proposed profile
errors, optional bio placeholder and age-screen explanation were not yet approved
and remained unchanged in this lot. Later approvals are recorded in the profile
editing and validation sections above and implemented in the second lot.

### Participant vocabulary integration (#43, 2026-09-11)

Marwane authorized `/ship` for the approved multilingual participant copy. The
second lot implements the room, match/chat, safety, profile-editing/validation and
email tables above, following the first landing/onboarding lot. The dictionaries
remain the source of rendered text; dynamic values and existing state rules are
preserved. "Fermer" after successful reporting and the standalone block reason
have distinct keys so their meaning does not leak into other states. The longer
chat lifetime note uses sentence case and readable supporting-text sizing.

The vocabulary audit retains internal `room` terminology in founder tooling and
existing technical identifiers. Unused legacy dictionary entries are not rendered;
they are outside this copy lot. Existing neutral utility labels are retained.
Photo rejection and review-failure wording remain with #194, as agreed.

Lint, logic and production build pass. After correcting old profile-label selectors,
the full Chromium suite reports four passing journeys and three failures: two real
photo uploads are denied by Storage RLS, and profile editing is denied UPDATE access.
The shared database already runs #194/#243's private photo workflow, while this branch
still uses the pre-#194 upload/profile-write paths. The failures are not bypassed by
weakening RLS or substituting privileged browser requests. This dependency must be
resolved before the PR becomes Ready. Deployed preview review is still in progress.
No new test suite is warranted for copy-only changes: existing behavioral journeys
retain their assertions, with an explicit check that a sent report offers Close
rather than Cancel.

Consent audit versions are advanced for the two rewritten signup surfaces:
`landing-night-announcements-v2` and `email-preferences-v2`. Existing records keep
their old versions, and unchanged room consent keeps its current version.

### Logo usage (v1 delivered; local app integration under review — #39)

Use the outlined More presence wordmark with the selected B1/F1 roles and
v1 spacing rules above. `BrandLogo` references unchanged production copies
in `public/brand/`; the design pack and its manifest remain immutable.
Colours remain `cream` in-app / on a calm dark photo area, `red` on generous
dark-or-cream hero use, `ink` on light. Never red on bordeaux/wine or a busy
photo. The one place red is the *standing* wordmark is the **landing (`/`), the
brand's public front door** — across all its gate states (#71): there red is the
identity, not a resting UI accent, which is how "red is an event" survives a red
wordmark on that surface. In-app the wordmark stays `cream`. The phone icon
and favicon stay cream on velvet; champagne is not a logo colour.

### Do / Don't

Always: dark ground; red rare (the ♥ + primary CTA + reveal); one champagne
hairline max per screen; scrims/shadows tinted velvet (never pure `#000`/`#FFF`);
Fraunces italic for names/reveal and the outlined v1 wordmark for branding;
cream labels on red, red-deep labels on cream (full-red screens).

Never: red as running text or small type; champagne as a fill or button; red for
errors or danger; multicolour gradients, glassmorphism, neon; flat photos or
pure-black scrims.

## Open decisions

Both hero screens are locked and the v2 system is written above. Still open:
(1) physical phone-shortcut verification of the integrated logo v1 pack;
the drawings, placement and alignment are settled and final PR delivery is
authorized; (2) the room-screen chrome
refonte (the persistent header, venue line, the two ⋯ menus, the matches strip)
to match the full-bleed card. Closed: WCAG re-measure (Étape 0) and the "red
present" vs "red is an event" tension (2026-07-23, red is an event — see the
component rule above). See "Design-system rework" near the top for the narrative.

## The board

Visual exploration lives in **`docs/brand/board.html`** (v3, self-contained,
pulls Google Fonts). View it in a real browser (rendering was verified with
headless Chromium screenshots in the remote agent environment; local headless
Chrome may still hang on the GPU compositor). To serve on the LAN:

```bash
python3 -m http.server 8099 --bind 0.0.0.0 --directory docs/brand
# then open http://192.168.1.67:8099/board.html  (192.168.1.67 = your LAN IP)
```

Board sections: (00) design principles from the invariants, (01–03) the three
complete directions (palette, wordmark, type, room + match mocks, honest
pros/cons), (04) comparison table + recommendation, (05) the full system for
Direction A (tokens with measured contrast, component rules, do/don't).
The v2 board (single-direction exploration) is in git history.

## Next steps

**Étape 0 — foundation (done, 2026-07-23).** shadcn/ui initialised on Tailwind 4
(base radix, style radix-nova); the v2 tokens are wired into `@theme` in
`app/globals.css` with shadcn's semantic tokens mapped onto the Amourette
palette (dark-only, so `:root` carries the dark values directly, no `.dark`
class); fonts swapped to **Fraunces / Figtree / Jost** via `next/font` in
`app/layout.tsx` (replacing Bodoni / Inter). WCAG re-measured for the v2 values —
all pass (cream-on-red 4.59:1, red-on-velvet 3.46:1, red-on-bordeaux 3.29:1), so
open point (1) is closed. See the `2026-07-23` entry in `docs/decisions.md` for
the token-mapping choices.

Remaining:

1. Translate the two locked hero mockups into real React components — the room
   feed card first, then the match reveal — rendering states/variants and
   choosing before freezing (mockups in `docs/brand/explorations/`).
2. Apply the system to the existing screens — one PR per screen, founder's call.
   Done: room (#69/#83), match reveal (#70), **chat (#73)**, **landing (#71,
   direction C "Cérémonie" — a ceremonial front door, red wordmark on the
   landing only; cold-email waitlist persists in `email_subscriptions` (#105))**.
   Remaining: profile.
3. The wordmark/logo design pass is delivered as `docs/brand/logo/v1/`.
   Application integration and alignment are complete; final PR delivery is
   authorized. Physical phone-shortcut verification remains pending.
4. **Done in #58:** align active UI copy, code identifiers, and documentation with
   Amourette. The historical DB cron rename is tracked separately in #200.
