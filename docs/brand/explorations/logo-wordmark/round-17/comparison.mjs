import { candidates, iconSvg } from "./artwork.mjs";

const artwork = new Map();
const state = { rendering: "1x", tab: "original" };
const status = document.querySelector("#status");

function specimen(id, size) {
  if (state.rendering === "vector") return artwork.get(id);
  const pixels = size * (state.rendering === "2x" ? 2 : 1);
  return `<img src="previews/${id}-${pixels}.png" width="${size}" height="${size}" alt=""/>`;
}

function glyph(id, size) {
  return `<span class="glyph" data-glyph="${id}" data-size="${size}" style="width:${size}px;height:${size}px">${specimen(id, size)}</span>`;
}

function setStatus() {
  const candidate = candidates.find(item => item.id === state.tab);
  status.textContent = `This tab: ${candidate.code}. Preview only; no selection saved. Screen ratio: ${Number(window.devicePixelRatio.toFixed(2))}×.`;
}

async function load() {
  await Promise.all(candidates.map(async candidate => {
    const response = await fetch(candidate.file);
    if (!response.ok) throw new Error(`Cannot load ${candidate.file}: ${response.status}`);
    artwork.set(candidate.id, iconSvg(await response.text()));
  }));
  document.querySelector("#candidates").innerHTML = candidates.map(candidate => `
    <article class="candidate" aria-labelledby="name-${candidate.id}">
      <h3 id="name-${candidate.id}"><span class="candidate-code">${candidate.code}</span>${candidate.name}</h3>
      <p class="candidate-note">${candidate.note}</p>
      <p class="size-label">16px tile / browser-tab mockups</p>
      <div class="tab chrome-dark">${glyph(candidate.id, 16)}<span class="tab-title">Amourette</span><span class="tab-close" aria-hidden="true">×</span></div>
      <div class="tab chrome-light">${glyph(candidate.id, 16)}<span class="tab-title">Amourette</span><span class="tab-close" aria-hidden="true">×</span></div>
      <p class="size-label secondary-size">32px tile / larger specimen</p>
      <div class="tile-pair"><div class="tile-cell chrome-dark">${glyph(candidate.id, 32)}<span>Dark</span></div><div class="tile-cell chrome-light">${glyph(candidate.id, 32)}<span>Light</span></div></div>
      <button class="try-tab" type="button" data-tab="${candidate.id}" aria-pressed="${candidate.id === state.tab}">Try ${candidate.code} in this tab</button>
    </article>`).join("");
  document.querySelector("#inspections").innerHTML = candidates.map(candidate => `
    <figure class="inspection"><figcaption>${candidate.code} / ${candidate.name}</figcaption>
      <div class="inspection-pair"><div><div class="inspection-svg">${artwork.get(candidate.id)}</div><span>128px vector</span></div><div><img class="pixel-detail" src="previews/${candidate.id}-16.png" width="128" height="128" alt="${candidate.code}, enlarged 16-pixel raster"/><span>16px enlarged 8×</span></div></div>
    </figure>`).join("");
  document.querySelectorAll("button[data-render]").forEach(button => button.addEventListener("click", () => {
    state.rendering = button.dataset.render;
    document.querySelectorAll("button[data-render]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    document.querySelectorAll("[data-glyph]").forEach(node => { node.innerHTML = specimen(node.dataset.glyph, Number(node.dataset.size)); });
    document.querySelector("#render-note").textContent = state.rendering === "vector"
      ? "Live SVG is rasterized by your browser at its current zoom and display density."
      : state.rendering === "1x" ? "1× PNG is the stricter low-density test. Try Live SVG for your screen's own rendering."
        : "2× PNG uses twice as many source pixels at the same displayed size: 32→16px and 64→32px.";
    setStatus();
  }));
  document.querySelectorAll("button[data-tab]").forEach(button => button.addEventListener("click", () => {
    state.tab = button.dataset.tab;
    document.querySelectorAll("button[data-tab]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    document.querySelectorAll("[data-tab-icon]").forEach(link => { link.href = `previews/${state.tab}-${link.dataset.tabIcon}.png`; });
    setStatus();
  }));
  document.querySelectorAll("button").forEach(button => { button.disabled = false; });
  setStatus();
}

load().catch(error => {
  console.error(error);
  status.textContent = "Artwork could not load. Refresh this page to try again.";
  status.classList.add("error");
});
