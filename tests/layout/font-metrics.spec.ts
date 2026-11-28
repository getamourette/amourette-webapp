import { test, expect, type Page } from "@playwright/test";

// #607: next/font/google downloaded Google's unhinted builds (it asks with a
// macOS user agent). Chrome on Windows and Linux hints them itself and moves
// letters off their designed widths, which left gaps inside words ("f orest",
// "CAUT ION"). WebKit never hints, so only a Chromium run on Linux sees it: this
// test renders sample text in every app font at a body size and at ten times
// that size. The large size is almost free of hinting, so the small text should
// measure a tenth of it. Measured on Linux Chromium: the defective files were
// off by up to 12.4% (Figtree), 7.6% (Jost) and 4.6% (Fraunces); the hinted
// files stay under 4%. The 5% limit catches a return of the unhinted Figtree
// and Jost with margin; the unhinted Fraunces alone sits too close to it. Optical sizing is off so both sizes draw the same
// design (the landing display face has an opsz axis).
const samples = [
  "Complète ton profil, la forêt est fine",
  "Caution remboursée à l’arrivée",
  "Savoir si tu lui plais aussi",
  "Profile left after closing time",
];
const MAX_DEVIATION_PERCENT = 5;

type Measure = { font: string; weight: number; italic: boolean; sample: string; deviation: number };

async function measureFonts(page: Page, fonts: string[]): Promise<Measure[]> {
  return page.evaluate(async ({ fonts, samples }) => {
    const host = document.querySelector("h1")?.parentElement ?? document.body;
    // Load every face up front. The size-adjusted fallbacks point at local
    // Arial or Times New Roman, which a Linux runner may not have: their
    // failure is expected and does not matter here.
    await Promise.allSettled([...document.fonts].map((face) => face.load()));
    const out: Measure[] = [];
    for (const font of fonts) {
      for (const weight of [400, 500, 700]) {
        for (const italic of [false, true]) {
          for (const sample of samples) {
            const span = document.createElement("span");
            span.style.cssText = `position:absolute;left:0;top:0;white-space:pre;letter-spacing:0;font-optical-sizing:none;font-family:var(${font});font-weight:${weight};font-style:${italic ? "italic" : "normal"}`;
            span.textContent = sample;
            host.append(span);
            span.style.fontSize = "15px";
            const small = span.getBoundingClientRect().width;
            span.style.fontSize = "150px";
            const large = span.getBoundingClientRect().width / 10;
            span.remove();
            out.push({ font, weight, italic, sample, deviation: (100 * Math.abs(small - large)) / large });
          }
        }
      }
    }
    return out;
  }, { fonts, samples });
}

async function expectDesignedWidths(page: Page, fonts: string[]) {
  const measures = await measureFonts(page, fonts);
  for (const font of fonts) {
    const worst = measures.filter((m) => m.font === font).sort((a, b) => b.deviation - a.deviation)[0];
    expect.soft(
      worst.deviation,
      `${font} ${worst.weight}${worst.italic ? " italic" : ""} "${worst.sample}" renders ${worst.deviation.toFixed(1)}% off its designed width`,
    ).toBeLessThan(MAX_DEVIATION_PERCENT);
  }
}

// One device pixel per CSS pixel, as on most Windows laptops: hinting moves
// glyphs most at this density.
test.use({ deviceScaleFactor: 1 });

test.beforeEach(async ({ page }) => {
  await page.route(`${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin}/**`, (route) => route.abort());
});

test("app fonts render at their designed letter widths", async ({ page }) => {
  await page.goto("/legal?lang=fr");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectDesignedWidths(page, ["--font-fraunces", "--font-figtree", "--font-jost"]);
});

test("landing fonts render at their designed letter widths", async ({ page }) => {
  await page.route("**/api/launch/next", (route) => route.fulfill({ status: 404, json: {} }));
  await page.goto("/?lang=fr");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectDesignedWidths(page, ["--font-landing-display", "--font-landing-hand", "--font-figtree", "--font-jost"]);
});
