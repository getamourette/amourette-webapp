"use strict";

const variants = [
  { id: "original", label: "B", name: "Original", path: "../round-10/fleeting-tie.svg", note: "The round 10 reference, exactly as retained. This remains available if neither new drawing feels better." },
  { id: "refined", label: "B1", name: "Refined", path: "ribbon-refined.svg", note: "A close redraw: smoother loop transitions, cleaner points and a more deliberate crossing. The asymmetry and long left end remain." },
  { id: "shorter", label: "B2", name: "Shorter ends", path: "ribbon-shorter-ends.svg", note: "The free alternative: B1's loops with shorter ends and more space above the right end. A slightly more compact gesture." },
];
const assets = new Map();
const state = { selected: "refined", weight: "fuller", overlay: false };
const status = document.querySelector("#status");

function svg(id, viewBox, outline = false) {
  const doc = new DOMParser().parseFromString(assets.get(id), "image/svg+xml");
  const root = doc.documentElement;
  if (viewBox) root.setAttribute("viewBox", viewBox);
  if (outline) root.setAttribute("class", "original-outline");
  root.setAttribute("aria-hidden", "true");
  return root.outerHTML;
}

function updateInspection() {
  const variant = variants.find(item => item.id === state.selected);
  document.querySelector("#selected-name").textContent = `${variant.label} / ${variant.name}`;
  document.querySelector("#selected-note").textContent = variant.note;
  document.querySelector("#download").href = variant.path;
  document.querySelector("#download").textContent = `Download ${variant.label} SVG`;
  // The same viewBox crops both the selected shape and the original overlay.
  document.querySelector("#full-view").innerHTML = svg(variant.id) + svg("original", null, true);
  document.querySelector("#crossing-view").innerHTML = svg(variant.id, "225 273 130 92") + svg("original", "225 273 130 92", true);
  document.querySelectorAll("button[data-select]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.select === variant.id));
  });
  status.textContent = `Inspecting ${variant.label} · ${state.weight === "fuller" ? "More presence" : "Balanced"} lettering`;
}

function press(attribute, button) {
  document.querySelectorAll(`button[${attribute}]`).forEach(other => {
    other.setAttribute("aria-pressed", String(other === button));
  });
}

async function load() {
  const files = variants.map(variant => [variant.id, variant.path]).concat([
    ["balanced", "../round-09/balanced-wordmark.svg"],
    ["fuller", "../round-09/fuller-wordmark.svg"],
  ]);
  await Promise.all(files.map(async ([id, file]) => {
    const response = await fetch(file);
    if (!response.ok) throw new Error(`Cannot load ${file}: ${response.status}`);
    const source = await response.text();
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") throw new Error(`Invalid SVG: ${file}`);
    assets.set(id, source);
  }));
  document.querySelector("#candidates").innerHTML = variants.map(variant => `<article class="candidate">
    <div class="candidate-heading"><span class="letter">${variant.label}</span><h3>${variant.name}</h3></div>
    <div class="art symbol">${svg(variant.id)}</div>
    <div class="art wordmark" data-wordmark>${svg(state.weight)}</div>
    <p>${variant.note}</p>
    <button type="button" data-select="${variant.id}" aria-pressed="${variant.id === state.selected}">Inspect ${variant.label}</button>
  </article>`).join("");
  document.querySelector("#candidates").setAttribute("aria-busy", "false");
  document.querySelector("#sizes").innerHTML = variants.map(variant => `<div class="size-set">
    <h3>${variant.label} / ${variant.name}</h3>
    <div class="size-row">${[64, 32, 24, 16].map(size => `<div class="size"><div class="size-art"><div class="art" style="width:${size}px">${svg(variant.id)}</div></div><small>${size}px</small></div>`).join("")}</div>
  </div>`).join("");
  document.querySelectorAll("button[data-select]").forEach(button => {
    button.addEventListener("click", () => {
      state.selected = button.dataset.select;
      updateInspection();
      document.querySelector(".inspection").scrollIntoView({ behavior: "instant", block: "start" });
    });
  });
  document.querySelectorAll("button[data-weight]").forEach(button => {
    button.addEventListener("click", () => {
      state.weight = button.dataset.weight;
      document.querySelectorAll("[data-wordmark]").forEach(node => { node.innerHTML = svg(state.weight); });
      press("data-weight", button);
      updateInspection();
    });
  });
  document.querySelectorAll("button[data-colour]").forEach(button => {
    button.addEventListener("click", () => {
      document.body.dataset.colour = button.dataset.colour;
      press("data-colour", button);
    });
  });
  document.querySelector("#overlay-toggle").addEventListener("click", event => {
    state.overlay = !state.overlay;
    event.currentTarget.setAttribute("aria-pressed", String(state.overlay));
    document.querySelector(".detail-grid").dataset.overlay = String(state.overlay);
  });
  document.querySelectorAll("button").forEach(button => { button.disabled = false; });
  updateInspection();
}

load().catch(error => {
  console.error(error);
  document.querySelector("#candidates").setAttribute("aria-busy", "false");
  status.textContent = "Artwork could not load. Refresh this page to try again.";
  status.classList.add("error");
});
