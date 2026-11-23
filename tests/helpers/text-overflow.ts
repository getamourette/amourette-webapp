import { mkdirSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

// Text that does not fit is the most common miss of a manual phone review (#420).
// The check reads the geometry of every rendered word, so it needs no reference
// image: a word fails when the page scrolls sideways, when it leaves the
// viewport or its own box, or when an ancestor clips it.

export type OverflowFinding = {
  // "clipped" is a sideways cut (an ellipsis); "clipped-lines" is a vertical one (a line clamp).
  kind: "page-scrolls-sideways" | "outside-viewport" | "wider-than-its-box" | "clipped" | "clipped-lines" | "scrolls-sideways" | "placeholder-cut";
  text: string;
  element: string;
  container: string;
  overflowPx: number;
};
// An allowance accepts one kind of finding on the element that sets the limit
// (the box that clips or scrolls), never on everything inside a region.
export type OverflowAllowance = { selector: string; kind: OverflowFinding["kind"]; reason: string };

// Captures land here, one per screen and language; CI uploads the folder.
export const captureFolder = "mobile-captures";

export async function findTextOverflow(page: Page, allow: readonly OverflowAllowance[] = []): Promise<OverflowFinding[]> {
  // Measure the settled screen: fonts loaded, entrance animations finished.
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
    // A paused animation never finishes: never wait more than two seconds.
    await Promise.race([
      Promise.all(finite.map(animation => animation.finished.catch(() => undefined))),
      new Promise(resolve => setTimeout(resolve, 2_000)),
    ]);
  });
  return page.evaluate((allowed: { selector: string; kind: string }[]) => {
    const tolerance = 1;
    const findings: OverflowFinding[] = [];
    const describe = (element: Element) => {
      const parts: string[] = [];
      for (let current: Element | null = element; current && current !== document.body && parts.length < 3; current = current.parentElement) {
        const testId = current.getAttribute("data-testid");
        const classes = [...current.classList].slice(0, 3).map(name => `.${name}`).join("");
        parts.unshift(current.tagName.toLowerCase() + (current.id ? `#${current.id}` : "") + (testId ? `[data-testid="${testId}"]` : "") + classes);
      }
      return parts.join(" > ");
    };
    const report = (kind: OverflowFinding["kind"], text: string, element: Element, limit: Element | null, overflowPx: number) => {
      if (limit && allowed.some(entry => entry.kind === kind && limit.matches(entry.selector))) return false;
      findings.push({ kind, text: text.slice(0, 80), element: describe(element), container: limit ? describe(limit) : "viewport", overflowPx: Math.round(overflowPx * 10) / 10 });
      return true;
    };
    // A scaled preview reports scaled rectangles but unscaled CSS lengths.
    const scale = (element: Element, rect: DOMRect) => element instanceof HTMLElement && element.offsetWidth && element.offsetHeight
      ? { x: rect.width / element.offsetWidth, y: rect.height / element.offsetHeight } : { x: 1, y: 1 };
    const shown = (element: Element) => getComputedStyle(element).display === "contents"
      || element.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    // An element with a transform, a filter or paint containment holds its absolute and fixed descendants.
    const holdsFixed = (css: CSSStyleDeclaration) => [css.transform, css.translate, css.scale, css.rotate, css.filter, css.backdropFilter, css.perspective].some(value => value && value !== "none")
      || /transform|filter|perspective/.test(css.willChange) || /paint|layout|strict|content/.test(css.contain);

    const root = document.documentElement;
    const viewport = root.clientWidth;
    if (root.scrollWidth > viewport + tolerance) report("page-scrolls-sideways", "", root, null, root.scrollWidth - viewport);

    const range = document.createRange();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const reported = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest("script, style, noscript, template, select, svg") || !shown(parent)) continue;
      // The nearest box that lays the text out: inline wrappers have no width of their own.
      let box: Element = parent;
      while (box !== document.body && ["inline", "contents"].includes(getComputedStyle(box).display) && box.parentElement) box = box.parentElement;
      const boxRect = box.getBoundingClientRect();
      // Screen-reader-only text is a 1 px clipped box by design.
      if (boxRect.width <= 1 || boxRect.height <= 1 || reported.has(box) || !shown(box)) continue;
      // Word by word: the spaces a wrapped line leaves hanging past its box are invisible.
      const words: DOMRect[] = [];
      for (const word of (node.textContent ?? "").matchAll(/\S+/g)) {
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        words.push(...range.getClientRects());
      }
      const before = findings.length;
      const style = getComputedStyle(box);
      const boxScale = scale(box, boxRect);
      const boxLeft = boxRect.left + (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * boxScale.x;
      const boxRight = boxRect.right - (parseFloat(style.borderRightWidth) + parseFloat(style.paddingRight)) * boxScale.x;
      words: for (const word of words) {
        if (word.width === 0 || word.height === 0) continue;
        let { left, right, top, bottom } = word;
        const spill = Math.max(right - boxRight, boxLeft - left);
        if (style.overflowX === "visible" && spill > tolerance) { report("wider-than-its-box", text, parent, box, spill); break; }
        // Walk up through every ancestor that clips or scrolls this word, keeping
        // only the part each one leaves visible. An absolute or fixed element
        // escapes the ancestors that are not its containing block.
        let escaping: "" | "absolute" | "fixed" = "";
        for (let ancestor: Element | null = box; ancestor; ancestor = ancestor.parentElement) {
          const css = getComputedStyle(ancestor);
          if (css.display === "contents") continue;
          const contains = escaping === "" || holdsFixed(css) || (escaping === "absolute" && css.position !== "static");
          if (contains) {
            escaping = "";
            const clipsX = css.overflowX !== "visible";
            const clipsY = css.overflowY !== "visible";
            if (clipsX || clipsY) {
              const rect = ancestor.getBoundingClientRect();
              const zoom = scale(ancestor, rect);
              const edge = {
                left: rect.left + ancestor.clientLeft * zoom.x, right: rect.left + (ancestor.clientLeft + ancestor.clientWidth) * zoom.x,
                top: rect.top + ancestor.clientTop * zoom.y, bottom: rect.top + (ancestor.clientTop + ancestor.clientHeight) * zoom.y,
              };
              if (clipsX) {
                const hidden = Math.max(right - edge.right, edge.left - left);
                // An allowed cut is not the end: the part it leaves visible is still checked above.
                if (hidden > tolerance && report(["auto", "scroll"].includes(css.overflowX) ? "scrolls-sideways" : "clipped", text, parent, ancestor, hidden)) break words;
                left = Math.max(left, edge.left);
                right = Math.min(right, edge.right);
                if (right - left <= tolerance) continue words;
              }
              if (clipsY) {
                // Glyph boxes exceed a tight line height by a few pixels, so a line
                // counts as clipped only when more than 30% of its height is cut.
                // A vertical scroller hides lines on purpose: those are skipped.
                const hidden = Math.max(0, bottom - edge.bottom) + Math.max(0, edge.top - top);
                if (hidden > (bottom - top) * 0.3) {
                  if (["auto", "scroll"].includes(css.overflowY)) continue words;
                  if (report("clipped-lines", text, parent, ancestor, hidden)) break words;
                }
                top = Math.max(top, edge.top);
                bottom = Math.min(bottom, edge.bottom);
                if (bottom <= top) continue words;
              }
            }
          }
          if (css.position === "fixed") escaping = "fixed";
          else if (css.position === "absolute" && escaping === "") escaping = "absolute";
        }
        const outside = Math.max(right - viewport, -left);
        if (outside > tolerance) { report("outside-viewport", text, parent, null, outside); break; }
      }
      if (findings.length > before) reported.add(box);
    }

    // A placeholder is copy too, but it is not a text node: measure it.
    const canvas = document.createElement("canvas").getContext("2d");
    for (const field of document.querySelectorAll<HTMLInputElement>("input[placeholder]")) {
      // Only a displayed placeholder: a typed value replaces it.
      if (!canvas || !field.placeholder.trim() || field.value || !shown(field) || field.clientWidth <= 1) continue;
      const css = getComputedStyle(field, "::placeholder");
      const shownText = css.textTransform === "uppercase" ? field.placeholder.toUpperCase()
        : css.textTransform === "lowercase" ? field.placeholder.toLowerCase() : field.placeholder;
      canvas.font = css.font;
      const spacing = parseFloat(css.letterSpacing) || 0;
      const width = canvas.measureText(shownText).width + spacing * shownText.length;
      const room = field.clientWidth - parseFloat(getComputedStyle(field).paddingLeft) - parseFloat(getComputedStyle(field).paddingRight);
      if (width - room > tolerance) report("placeholder-cut", field.placeholder, field, field, width - room);
    }
    return findings;
  }, allow.map(({ selector, kind }) => ({ selector, kind })));
}

/**
 * Fails the test when the screen has overflowing or clipped text, and saves a
 * capture named `<screen>-<locale>.png`. One capture is one screen: the
 * viewport, never the full page (docs/workflow.md, "Proof and the founder card").
 */
export async function expectNoTextOverflow(page: Page, screen: string, locale: string, allow: readonly OverflowAllowance[] = []) {
  const findings = await findTextOverflow(page, allow);
  mkdirSync(captureFolder, { recursive: true });
  await page.screenshot({ path: `${captureFolder}/${screen}-${locale}.png`, animations: "disabled", scale: "css" });
  const report = findings.map(({ kind, text, element, container, overflowPx }) =>
    `${kind} by ${overflowPx}px: "${text}" in ${element} (limit: ${container})`).join("\n");
  expect.soft(findings, `${screen} (${locale}) has overflowing or clipped text:\n${report}`).toEqual([]);
}
