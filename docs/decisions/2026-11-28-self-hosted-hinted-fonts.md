# App fonts are self-hosted from Google's hinted build, in one folder

**Decision (2026-11-28, #607):** Fraunces, Figtree and Jost are no longer loaded with
`next/font/google`. Every page loads them with `next/font/local` from `app/fonts/`
(`app/fonts.ts`), using the files Google Fonts serves to Windows and Linux browsers:
Fraunces v38, Figtree v9 and Jost v20, the same subsets as before (latin preloaded;
latin-ext, plus vietnamese for Fraunces and cyrillic for Jost, downloaded only when a
character needs them), OFL notices beside the files. The landing page uses the same
Figtree and Jost files instead of its own copies; only its optical-size Fraunces stays
separate (see `2026-11-28-landing-billet-doux.md`, whose font paragraph this updates).
Caveat Brush stays on `next/font/google`.

**Why:** Google Fonts answers each browser with a build chosen from its user agent:
an unhinted build for macOS, iOS and Android, a hinted one (with TrueType
instructions) for Windows and Linux. `next/font/google` always asks with a fixed macOS
Chrome user agent, so it shipped the unhinted build to everyone. Chrome on Windows and
Linux hints those files itself and moves letters off their designed widths, which left
gaps inside words ("caut ion", "t a carte", "CAUT ION"), up to 12% off in Figtree.
WebKit does not hint, so iPhones were not affected, but desktop Chrome and every
Linux browser capture (CI, review) were. `next/font/google` has no option to choose
the build, so self-hosting the hinted files is the only fix; they render the same on
macOS and iOS. Caveat Brush measured within the same margin in both builds, and its
hinted file is larger, so it was left alone.

**How it works:** `next/font/local` takes no per-file `unicode-range`, so each subset is
its own instance and `app/globals.css` chains them in Google's order (extended subsets
first, each limited to its range, then latin with its size-adjusted fallback) under
the existing `--font-fraunces`, `--font-figtree` and `--font-jost` names.

**Guard:** `tests/layout/font-metrics.spec.ts` renders every app font at body size
and at ten times that size in Chromium; a return of the unhinted Figtree or Jost
fails it. To update a font, download the files with a Windows Chrome user agent from
the Google Fonts CSS2 API, keep the family's OFL file, and run that test.
