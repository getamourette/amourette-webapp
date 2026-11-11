# Photo save measurements — #278

Date: 2026-10-23. Before: `main` at `74c2fd2` (`amourette-webapp-git-main-tothe-moon.vercel.app`).
After: `fix/photo-save-delays` at `b48b58c` (`amourette-webapp-20f8sfbzf-tothe-moon.vercel.app`).

## Evidence boundary

Source: a real iPhone HEIF taken by Marwane, 4284×5712 (24.5 MP), 8-bit, 2,103,473
bytes, plus a JPEG derived from it (quality 92, P3, 2,773,403 bytes). Its converted
16-bit PNG is 31.5 MB. Playwright Chromium (Pixel 7 profile) on Forge, same connection,
sequential runs, isolated password fixtures, onboarding then replacement, two runs each.
Chromium cannot decode HEIC natively, so selection uses the full PNG fallback; Safari
uses native display (#309). WebKit is not installed on Forge and no physical-phone
timing is included. Small samples: ranges, not percentiles.

## Results

| Step | HEIC before | HEIC after | JPEG before | JPEG after |
| --- | ---: | ---: | ---: | ---: |
| Save click → done, onboarding | 29.1 / 29.6 s | 12.9 / 12.0 s | 8.7 / 9.1 s | 6.4 / 5.7 s |
| Save click → done, replacement | 28.1 / 27.7 s | 8.5 / 9.0 s | 8.3 / 9.0 s | 5.2 / 6.3 s |
| Uploads during save | permission + 1.0–1.2 s HEIC upload | none | permission + 1.2–1.7 s | none |
| Server `source` (staged download) | 0.25–0.33 s | 0.8–3.6 s | 0.28–0.53 s | 0.27–0.46 s |
| Server `prepare` (convert/validate/crop) | 23.7–23.8 s | 5.2–5.4 s | 4.5–4.7 s | 2.4–2.5 s |
| Server `store` | 2.1–2.3 s | 1.5–3.0 s | 1.2–1.6 s | 1.6–2.9 s |
| Crop Confirm | 0.30–0.35 s | 0.31–0.42 s | 0.30–0.32 s | 0.29–0.40 s |

The staged reference was ready at save in every run (`photo.save.staged-wait` 2–12 ms);
no fallback upload occurred. HEIC `source` now downloads the 31.5 MB converted PNG
instead of the 2.1 MB HEIC, which costs up to a few seconds but replaces about 12 s
of reconversion. Local profiling of the same files: the single decode takes the
crop step from 6.8 s to 3.5 s (HEIC PNG) and 3.7 s to 1.7 s (JPEG) with identical
samples and ICC.

## WebKit and crop Confirm

After installing WebKit on Forge, the same harness ran Playwright WebKit (iPhone 13
Pro Max profile, Linux, software rendering), pausing 1.5 s in round mode before
Confirm as a participant would. Linux WebKit uses the HEIC PNG fallback, not the
iPhone's native decode. Before: `main` `74c2fd2`; after: `a223608`.

| WebKit, two runs each | HEIC before | HEIC after | JPEG before | JPEG after |
| --- | ---: | ---: | ---: | ---: |
| Crop Confirm | 1.46–1.55 s | 0.37–0.49 s | 1.49–1.64 s | 0.32–0.56 s |
| Save, onboarding | 31.1 / 35.5 s | 9.9 / 13.6 s | 11.0 / 9.8 s | 13.0 / 5.8 s |
| Save, replacement | 31.0 / 32.1 s | 12.6 / 13.8 s | 10.9 / 10.6 s | 9.5 / 8.6 s |

Without the pause, an earlier WebKit run showed Confirm at 1.8–4.2 s: each round
display-preview PNG took 1.3–2 s to encode on the tap. The cropper now encodes it
300 ms after the round crop settles (repeated zoom steps coalesce), and Confirm
reuses it. A Confirm tapped within that window still waits for the in-flight
encode. The 13.0 s JPEG save is a shared-backend outlier: its Server-Timing shows
`revision` 4.9 s and `auth` 1.8 s, while `prepare` stayed at 2.4 s.

## Remaining limits

- A 24 MP HEIC still produces 16-bit lossless outputs of about 31 MB (portrait) and
  26 MB (round); downloading the source, encoding and storing these bytes is now
  most of the remaining 8.5–13 s. Shrinking them would need a quality decision
  (bit depth or format), which #278 excludes.
- PNG compression level 6 is kept: level 1 saved about 1 s locally but produced a
  48 MB crop, close to the 50 MiB output limit.
- Linux WebKit is not iPhone Safari: physical iPhone timings remain to be done.
