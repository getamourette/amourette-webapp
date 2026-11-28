import localFont from "next/font/local";

// Amourette type system (docs/design.md, the system v2): Fraunces for
// display/names/reveal (italic is the brand voice), Figtree for body, Jost for
// uppercase tracked labels and buttons. All three are variable fonts.
//
// Why self-hosted (#607, docs/decisions/2026-11-28-self-hosted-hinted-fonts.md):
// next/font/google always downloads with a fixed macOS user agent, and Google
// Fonts answers macOS with an unhinted build. Chrome on Windows and Linux then
// hints those files itself and distorts letter widths ("f in", "CAUT ION").
// Google serves Windows and Linux a hinted build instead; these are those files
// (Google Fonts CSS2 API, Fraunces v38, Figtree v9, Jost v20, OFL, see
// app/fonts/*-OFL.txt). The hinted build renders the same on macOS and iOS.
//
// next/font/local takes no per-file unicode-range, so each Google subset is its
// own instance and app/globals.css (:root) chains them in Google's precedence
// order: extended subsets first (each limited to its unicode-range, downloaded
// only when a character needs it), then the preloaded latin instance with its
// size-adjusted fallback. Use sites keep --font-fraunces, --font-figtree and
// --font-jost.

export const frauncesLatin = localFont({
  variable: "--font-fraunces-latin",
  src: [
    { path: "./fonts/fraunces-latin.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/fraunces-italic-latin.woff2", weight: "100 900", style: "italic" },
  ],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
  adjustFontFallback: "Times New Roman",
  display: "swap",
});

export const frauncesLatinExt = localFont({
  variable: "--font-fraunces-latin-ext",
  src: [
    { path: "./fonts/fraunces-latin-ext.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/fraunces-italic-latin-ext.woff2", weight: "100 900", style: "italic" },
  ],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

export const frauncesVietnamese = localFont({
  variable: "--font-fraunces-vietnamese",
  src: [
    { path: "./fonts/fraunces-vietnamese.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/fraunces-italic-vietnamese.woff2", weight: "100 900", style: "italic" },
  ],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

export const figtreeLatin = localFont({
  variable: "--font-figtree-latin",
  src: [{ path: "./fonts/figtree-latin.woff2", weight: "300 900", style: "normal" }],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
  display: "swap",
});

export const figtreeLatinExt = localFont({
  variable: "--font-figtree-latin-ext",
  src: [{ path: "./fonts/figtree-latin-ext.woff2", weight: "300 900", style: "normal" }],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

export const jostLatin = localFont({
  variable: "--font-jost-latin",
  src: [{ path: "./fonts/jost-latin.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
  display: "swap",
});

export const jostLatinExt = localFont({
  variable: "--font-jost-latin-ext",
  src: [{ path: "./fonts/jost-latin-ext.woff2", weight: "100 900", style: "normal" }],
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

export const jostCyrillic = localFont({
  variable: "--font-jost-cyrillic",
  src: [{ path: "./fonts/jost-cyrillic.woff2", weight: "100 900", style: "normal" }],
  declarations: [{ prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
  preload: false,
  adjustFontFallback: false,
  display: "swap",
});

export const appFontVariables = [
  frauncesLatin,
  frauncesLatinExt,
  frauncesVietnamese,
  figtreeLatin,
  figtreeLatinExt,
  jostLatin,
  jostLatinExt,
  jostCyrillic,
]
  .map((font) => font.variable)
  .join(" ");
