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
- **Voice:** complicit, sober, informal ("tu"). Short. Promise the real: "She's
  in the room, right now." No gamification (score, streak).

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
