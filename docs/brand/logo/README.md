# Logo delivery build

The versioned design delivery is in `v1/`. Its `README.md` is the usage
sheet; `index.html` is the portable visual guide. Canonical project status
and decisions remain in `docs/design.md` and `docs/decisions.md`.

Build from the repository root:

```sh
node docs/brand/logo/build.mjs
```

The generator uses the existing Playwright and Sharp installations. It
measures the original B1, More presence wordmark and F1 SVGs in Chromium,
keeps their outlined paths and original group transforms, then generates
the SVG/PNG/ICO assets, manifest and ZIP. It never writes to the exploration
sources or app. Only generated files under `v1/` are replaced on rebuild;
the authored guide and stylesheet are inputs.

Where the default Playwright browser needs an explicit location or locally
unpacked shared libraries, set `AMOURETTE_CHROMIUM_PATH` and optionally
`AMOURETTE_CHROMIUM_LIBDIR`. This environment may require approval to launch
Chromium outside its sandbox. No dependency or browser installation is
performed by the generator.

The ZIP is deterministic for the same inputs and tool versions. The
manifest records source and output SHA-256 hashes and measured geometry.
No font binary, external image or external stylesheet is needed to use
the delivery. Earlier comparisons remain archived unchanged.

No application integration, Git operation or service reconfiguration is
part of this build. The HTTP preview receives a separate copy of `v1/`
at the existing service's `round-04/delivery-v1/` location.
