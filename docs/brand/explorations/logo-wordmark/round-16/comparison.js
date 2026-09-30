"use strict";

const sources = new Map();
const weights = ["balanced", "fuller"];
const state = { weight: "fuller", guide: "vertical" };
const status = document.querySelector("#status");
const svgNamespace = "http://www.w3.org/2000/svg";

function round(value) { return Number(value.toFixed(8)); }
function rect(box) { return { x: box.x, y: box.y, width: box.width, height: box.height }; }

function measure(source, kind) {
  const documentSource = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentSource.querySelector("parsererror") || documentSource.documentElement.localName !== "svg") {
    throw new Error(`Invalid SVG: ${kind}`);
  }
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none";
  const svg = document.importNode(documentSource.documentElement, true);
  svg.setAttribute("width", "1000");
  svg.setAttribute("height", "1000");
  host.append(svg);
  document.body.append(host);
  try {
    const bounds = rect(svg.getBBox());
    let capital = null;
    if (kind !== "ribbon") {
      const letter = svg.querySelector('[data-letter="E"]');
      const local = letter.getBBox();
      const matrix = svg.getCTM().inverse().multiply(letter.getCTM());
      const points = [[local.x, local.y], [local.x + local.width, local.y], [local.x, local.y + local.height], [local.x + local.width, local.y + local.height]]
        .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
      const minY = Math.min(...points.map(point => point.y));
      const maxY = Math.max(...points.map(point => point.y));
      capital = { y: minY, height: maxY - minY };
    }
    svg.querySelector(":scope > title")?.remove();
    return { bounds, capital, inner: svg.innerHTML };
  } finally {
    host.remove();
  }
}

function part(id, x, y, scale) {
  const source = sources.get(id);
  const dx = round(x - source.bounds.x * scale);
  const dy = round(y - source.bounds.y * scale);
  return `<g data-source="${id}" transform="translate(${dx} ${dy}) scale(${round(scale)})">${source.inner}</g>`;
}

function svg(viewBox, content, label) {
  return `<svg xmlns="${svgNamespace}" viewBox="${viewBox.map(round).join(" ")}" role="img" aria-label="${label}"><title>${label}</title>${content}</svg>`;
}

function standalone(id) {
  const source = sources.get(id);
  return svg([source.bounds.x, source.bounds.y, source.bounds.width, source.bounds.height], `<g data-source="${id}">${source.inner}</g>`, id === "ribbon" ? "Amourette B1 ribbon" : `AMOURETTE / ${id} lettering`);
}

function composition(weight, layout, guides = false) {
  const wordmark = sources.get(weight);
  const ribbon = sources.get("ribbon");
  // One flat capital E height is the common spacing unit, normalized to 100.
  const x = 100;
  const wordScale = x / wordmark.capital.height;
  const wordWidth = wordmark.bounds.width * wordScale;
  const wordHeight = wordmark.bounds.height * wordScale;
  const capitalMiddle = (wordmark.capital.y - wordmark.bounds.y) * wordScale + x / 2;
  const markWidth = layout === "vertical" ? 2.4 * x : layout === "horizontal" ? 1.8 * x : 1.15 * x;
  const markScale = markWidth / ribbon.bounds.width;
  const markHeight = ribbon.bounds.height * markScale;
  let wordX = 0;
  let wordY = 0;
  let markX = 0;
  let markY = capitalMiddle - markHeight / 2;
  if (layout === "vertical") {
    markX = (wordWidth - markWidth) / 2;
    markY = 0;
    wordY = markHeight + .65 * x;
  } else if (layout === "horizontal") {
    wordX = markWidth + .65 * x;
  } else {
    markX = wordWidth + .6 * x;
  }
  const top = Math.min(markY, wordY);
  const bottom = Math.max(markY + markHeight, wordY + wordHeight);
  const right = Math.max(markX + markWidth, wordX + wordWidth);
  const bounds = [0, top, right, bottom - top];
  const margin = x;
  const view = [-margin, top - margin, right + 2 * margin, bottom - top + 2 * margin];
  let markup = part("ribbon", markX, markY, markScale) + part(weight, wordX, wordY, wordScale);
  if (guides) {
    const innerBox = bounds.map(round);
    const outerBox = view.map(round);
    markup += `<g class="guides" aria-hidden="true">
      <rect class="guide-outline guide-dash" x="${innerBox[0]}" y="${innerBox[1]}" width="${innerBox[2]}" height="${innerBox[3]}"/>
      <rect class="guide-outline" x="${outerBox[0] + 1}" y="${outerBox[1] + 1}" width="${outerBox[2] - 2}" height="${outerBox[3] - 2}"/>
      <path class="guide-outline" d="M ${round(right / 2)} ${round(top - margin)} V ${round(top)}"/>
      <text class="guide-label" x="${round(right / 2 + 16)}" y="${round(top - margin / 2 + 12)}">x</text>
      <path class="guide-outline" d="M ${-margin} ${round((top + bottom) / 2)} H 0"/>
      <text class="guide-label" x="${-margin / 2 - 10}" y="${round((top + bottom) / 2 - 15)}">x</text>
    </g>`;
  }
  return svg(view, markup, `AMOURETTE with B1 / ${layout} / ${weight}${guides ? " / proposed clear space" : ""}`);
}

function update() {
  document.querySelectorAll("[data-lockup]").forEach(node => {
    node.innerHTML = composition(node.dataset.fixedWeight || state.weight, node.dataset.lockup);
  });
  document.querySelectorAll("[data-wordmark]").forEach(node => {
    node.innerHTML = standalone(node.dataset.wordmark === "selected" ? state.weight : node.dataset.wordmark);
  });
  document.querySelector("#space-art").innerHTML = composition(state.weight, state.guide, true);
  document.querySelector("#space-note").textContent = state.guide === "vertical"
    ? "x = the height of a capital E. Ribbon width: 2.4x. Visible gap above the wordmark: 0.65x. Outside clear space: 1x."
    : "x = the height of a capital E. Ribbon width: 1.8x. Visible gap beside the wordmark: 0.65x. Outside clear space: 1x.";
  status.textContent = `Preview: ${state.weight === "fuller" ? "More presence" : "Balanced"}. B1 unchanged.`;
}

function pressed(attribute, chosen) {
  document.querySelectorAll(`button[${attribute}]`).forEach(button => button.setAttribute("aria-pressed", String(button === chosen)));
}

async function load() {
  const files = [["ribbon", "../round-15/ribbon-refined.svg"], ...weights.map(weight => [weight, `../round-09/${weight}-wordmark.svg`])];
  const contents = await Promise.all(files.map(async ([id, file]) => {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Cannot load ${file}: ${response.status}`);
    return [id, await response.text()];
  }));
  contents.forEach(([id, source]) => sources.set(id, measure(source, id)));
  document.querySelectorAll("[data-ribbon]").forEach(node => { node.innerHTML = standalone("ribbon"); });
  document.querySelector("#ribbon-sizes").innerHTML = [64, 48, 32, 24, 16].map(size => `<div class="size-sample"><div class="size-glyph"><div style="width:${size}px">${standalone("ribbon")}</div></div><small>${size}px</small></div>`).join("");
  document.querySelector("#wordmark-sizes").innerHTML = weights.map(weight => `<div class="wordmark-size-set"><h3>${weight === "fuller" ? "More presence" : "Balanced"}</h3>${[240, 190, 160, 120].map(width => `<div class="wordmark-size-item"><div class="art" style="width:${width}px" data-wordmark="${weight}"></div><span>${width}px</span></div>`).join("")}</div>`).join("");
  document.querySelectorAll("button[data-weight]").forEach(button => button.addEventListener("click", () => {
    state.weight = button.dataset.weight;
    pressed("data-weight", button);
    update();
  }));
  document.querySelectorAll("button[data-guide]").forEach(button => button.addEventListener("click", () => {
    state.guide = button.dataset.guide;
    pressed("data-guide", button);
    update();
  }));
  document.querySelector("#guide-toggle").addEventListener("click", event => {
    const visible = event.currentTarget.getAttribute("aria-pressed") !== "true";
    event.currentTarget.setAttribute("aria-pressed", String(visible));
    document.querySelector("#space-art").dataset.guides = String(visible);
  });
  update();
  document.querySelectorAll("button").forEach(button => { button.disabled = false; });
}

load().catch(error => {
  console.error(error);
  status.textContent = "Artwork could not load. Refresh this page to try again.";
  status.classList.add("error");
});
