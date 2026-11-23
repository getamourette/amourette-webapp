import { test, expect } from "@playwright/test";
import { findTextOverflow } from "../helpers/text-overflow";

// The sweep in text-overflow.spec.ts is only worth its green check if the
// detector really sees a deliberate overflow. Each case is a minimal page.
const page320 = (body: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>body{margin:0;font:16px/1.5 sans-serif}.card{width:200px;padding:8px;border:1px solid}</style></head><body>${body}</body></html>`;
const long = "Réservation confirmée pour la soirée de demain";

const broken = [
  ["a line wider than the screen scrolls the page sideways", "page-scrolls-sideways", `<p style="white-space:nowrap;width:600px">${long} ${long}</p>`],
  ["an unbreakable label spills out of its button", "wider-than-its-box", `<button class="card" style="white-space:nowrap">${long}</button>`],
  ["a hidden overflow cuts the end of a label", "clipped", `<div class="card" style="overflow:hidden;white-space:nowrap">${long}</div>`],
  ["an ellipsis hides the end of a label", "clipped", `<div class="card" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${long}</div>`],
  ["a fixed height hides the second line", "clipped-lines", `<div class="card" style="overflow:hidden;height:24px">${long}</div>`],
  ["a flex child that cannot shrink is cut by its row", "clipped", `<div class="card" style="display:flex;overflow:hidden"><span style="flex:none">${long}</span></div>`],
  ["a row scrolls sideways to show its label", "scrolls-sideways", `<div class="card" style="overflow-x:auto;white-space:nowrap">${long}</div>`],
  ["a fixed banner runs off the screen", "outside-viewport", `<p style="position:fixed;left:250px;top:0;margin:0;white-space:nowrap">${long}</p>`],
  ["a fixed label is cut by the transformed panel that holds it", "clipped", `<div class="card" style="overflow:hidden;height:60px;transform:translateY(0)"><p style="position:fixed;margin:0;white-space:nowrap">${long}</p></div>`],
  ["a line loses its lower half", "clipped-lines", `<div class="card" style="overflow:hidden;height:12px;padding:0">Réservation</div>`],
  ["a wrapper without a box of its own holds a cut label", "clipped", `<div class="card" style="overflow:hidden;white-space:nowrap"><span style="display:contents">${long}</span></div>`],
  ["a line loses a quarter at the top and a quarter at the bottom", "clipped-lines", `<div class="card" style="overflow:hidden;height:10px;padding:0;display:flex;align-items:center;font-size:18px">Réservation</div>`],
  ["a menu is cut by a static wrapper that only has a translate", "clipped", `<div style="translate:0;overflow:hidden;width:100px;height:40px"><p style="position:absolute;top:0;left:0;margin:0;white-space:nowrap">${long}</p></div>`],
  ["an uppercase placeholder is longer than its field", "placeholder-cut", `<style>input::placeholder{text-transform:uppercase;letter-spacing:.2em}</style><input style="width:150px;font:16px sans-serif" placeholder="adresse email">`],
  ["a placeholder is longer than its field", "placeholder-cut", `<input style="width:80px;font:16px sans-serif" placeholder="${long}">`],
] as const;

for (const [name, kind, body] of broken) {
  test(`detects that ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.setContent(page320(body));
    const findings = await findTextOverflow(page);
    expect(findings.map(finding => finding.kind)).toContain(kind);
    expect(findings.find(finding => finding.kind === kind)?.overflowPx).toBeGreaterThan(1);
  });
}

test("accepts text that wraps, scrolls vertically or is hidden on purpose", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.setContent(page320(`
    <p class="card">${long} ${long}</p>
    <button class="card" style="line-height:1">${long}</button>
    <div class="card" style="overflow-y:auto;height:60px">${`<p>${long}</p>`.repeat(6)}</div>
    <span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">${long}</span>
    <p style="display:none;white-space:nowrap">${long} ${long}</p>
    <div class="card" style="visibility:hidden;overflow:hidden;white-space:nowrap">${long}</div>
    <div style="overflow:hidden;width:40px;height:20px"><p style="position:absolute;top:300px;left:8px;margin:0;width:280px">${long}</p></div>
    <style>@keyframes enter{from{opacity:.5}to{opacity:1}}</style>
    <p class="card" style="animation:enter 25ms paused">${long}</p>
    <div class="card" style="overflow:hidden;white-space:nowrap;line-height:1.1">Réservation</div>
    <input style="width:280px;font:16px sans-serif" placeholder="Prénom">
    <input style="width:60px;font:16px sans-serif" placeholder="${long}" value="Alice">`));
  expect(await findTextOverflow(page)).toEqual([]);
});

test("an allowance accepts one kind of finding on the element that sets the limit, nothing inside it", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.setContent(page320(`
    <div class="card" data-testid="intended" style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${long}</div>
    <div class="card" data-testid="defect" style="overflow:hidden;white-space:nowrap">${long}</div>
    <div data-testid="header" style="overflow:hidden;width:60px"><div data-testid="title" style="width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${long}</div></div>
    <div role="tablist" style="display:flex;overflow-x:auto;width:200px">
      <button style="flex:none">Réservations</button><button style="flex:none">Activité de la soirée</button>
      <button data-testid="cut-tab" style="flex:none;width:40px;overflow:hidden;white-space:nowrap">Paramètres</button>
    </div>`));
  const findings = await findTextOverflow(page, [
    { selector: '[data-testid="intended"]', kind: "clipped", reason: "test" },
    { selector: '[data-testid="title"]', kind: "clipped", reason: "test" },
    { selector: '[role="tablist"]', kind: "scrolls-sideways", reason: "test" },
  ]);
  expect(findings.map(finding => finding.container)).toEqual([expect.stringContaining("defect"), expect.stringMatching(/header"\]$/), expect.stringContaining("cut-tab")]);
  expect(findings.every(finding => finding.kind === "clipped")).toBe(true);
});
