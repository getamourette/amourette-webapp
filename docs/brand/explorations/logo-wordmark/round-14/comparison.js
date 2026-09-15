/* Standalone visual studies. No app modules, authentication or form submission. */
"use strict";

const candidates = [
  { letter: "B", name: "The fleeting tie", file: "fleeting-tie" },
  { letter: "C", name: "The first exchange", file: "first-exchange" },
];
const artwork = new Map();
const status = document.querySelector("#art-status");

function art(source, className = "") {
  return `<div class="art ${className}" aria-hidden="true">${source}</div>`;
}

function emblem(candidate) {
  return art(artwork.get(candidate.file), "emblem");
}

function wordmark() {
  return `<div class="art wordmark" data-wordmark aria-hidden="true">${artwork.get(document.body.dataset.weight)}</div>`;
}

function caption(candidate) {
  return `<figcaption><span class="candidate-letter">${candidate.letter}</span><span class="candidate-name">${candidate.name}</span></figcaption>`;
}

function icon(candidate, size) {
  return `<div class="app-icon" style="--tile-size:${size}px">${emblem(candidate)}</div>`;
}

function icons(candidate) {
  return `<figure aria-label="${candidate.letter}: phone icon and size specimens">
    ${caption(candidate)}
    <div class="icon-stage">
      <div class="icon-enlarged">${icon(candidate, 160)}<span class="size-label">160px enlargement</span></div>
      <div class="icon-sizes">
        <div class="size-sample"><div>${icon(candidate, 64)}</div><span class="size-label">64px icon</span></div>
        ${[32, 24, 16].map(size => `<div class="size-sample"><div class="standalone"><div style="width:${size}px">${emblem(candidate)}</div></div><span class="size-label">${size}px</span></div>`).join("")}
      </div>
    </div>
  </figure>`;
}

function welcome(candidate) {
  return `<figure aria-label="${candidate.letter}: static new-visitor welcome screen">
    ${caption(candidate)}
    <div class="phone-stage">
      <div class="phone composition">
        <div class="welcome-screen">
          <span class="language-sample">EN⌄</span>
          <div class="welcome-core">
            <p class="night-kicker">The bar · tonight</p>
            <div class="welcome-brand">${emblem(candidate)}${wordmark()}</div>
            <p class="welcome-promise">The people in this bar, without the fear of the first move.</p>
            <hr class="hairline">
            <div class="welcome-how"><span>Scan at the door</span><span>Like in secret</span><span>Match to talk</span></div>
          </div>
          <div class="waitlist-sample" aria-label="Static waitlist preview">
            <p class="night-kicker">No Amourette bar near you yet?</p>
            <div class="waitlist-field" aria-hidden="true"><span>you@email.com</span><span class="waitlist-arrow">→</span></div>
            <p class="waitlist-help">We'll ping you only when one opens nearby. Nothing else.</p>
          </div>
          <span class="email-preferences">Email preferences</span>
        </div>
      </div>
    </div>
    <p class="screen-caption">getamourette.com / New visitor</p>
  </figure>`;
}

function qr(candidate) {
  return `<figure aria-label="${candidate.letter}: A6 QR card">
    ${caption(candidate)}
    <div class="counter">
      <div class="card-size">
      <div class="qr-card composition">
        <div class="card-brand">${emblem(candidate)}${wordmark()}</div>
        <p class="card-title">Someone here<br>could be your type.</p>
        <p class="card-copy">Like in secret. If it's mutual,<br>start with hello.</p>
        ${art(artwork.get("qr"), "qr-art")}
        <p class="card-scan">Scan to see who's here</p>
        <p class="card-footnote">Here tonight. Only if you both choose.</p>
      </div>
      </div>
    </div>
  </figure>`;
}

function free(candidate) {
  return `<figure aria-label="${candidate.letter}: invitation-led A6 QR card, free composition">
    ${caption(candidate)}
    <div class="counter">
      <div class="card-size">
      <div class="qr-card free-card composition">
        <p class="card-title">Someone here<br>could be your type.</p>
        <p class="card-copy">Like in secret. If it's mutual,<br>start with hello.</p>
        ${art(artwork.get("qr"), "qr-art")}
        <p class="card-scan">Scan to see who's here</p>
        <div class="free-brand">${wordmark()}${emblem(candidate)}</div>
        <p class="card-footnote">Here tonight. Only if you both choose.</p>
      </div>
      </div>
    </div>
  </figure>`;
}

function setPressed(attribute, selected) {
  document.querySelectorAll(`button[${attribute}]`).forEach(button => {
    button.setAttribute("aria-pressed", String(button === selected));
  });
}

function announce() {
  const weight = document.body.dataset.weight === "fuller" ? "More presence" : "Balanced";
  const emblems = document.body.dataset.emblems === "visible" ? "With emblem" : "Wordmark only; icons unchanged";
  status.textContent = `${weight} · ${emblems}`;
}

async function load() {
  const files = [
    ["fleeting-tie", "../round-10/fleeting-tie.svg"],
    ["first-exchange", "../round-10/first-exchange.svg"],
    ["balanced", "../round-09/balanced-wordmark.svg"],
    ["fuller", "../round-09/fuller-wordmark.svg"],
    ["qr", "sample-qr.svg"],
  ];
  await Promise.all(files.map(async ([name, path]) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Cannot load ${path}: ${response.status}`);
    const source = await response.text();
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
      throw new Error(`Invalid SVG: ${path}`);
    }
    artwork.set(name, source);
  }));

  const settings = { icons, welcome, qr, free };
  document.querySelectorAll("[data-setting]").forEach(container => {
    container.innerHTML = candidates.map(settings[container.dataset.setting]).join("");
    container.setAttribute("aria-busy", "false");
  });

  document.querySelectorAll("button[data-weight]").forEach(button => {
    button.addEventListener("click", () => {
      document.body.dataset.weight = button.dataset.weight;
      document.querySelectorAll("[data-wordmark]").forEach(node => {
        node.innerHTML = artwork.get(button.dataset.weight);
      });
      setPressed("data-weight", button);
      announce();
    });
  });
  document.querySelectorAll("button[data-emblems]").forEach(button => {
    button.addEventListener("click", () => {
      document.body.dataset.emblems = button.dataset.emblems;
      setPressed("data-emblems", button);
      announce();
    });
  });
  document.querySelectorAll("button[data-icon-colour]").forEach(button => {
    button.addEventListener("click", () => {
      document.body.dataset.iconColour = button.dataset.iconColour;
      setPressed("data-icon-colour", button);
    });
  });
  document.querySelectorAll("button").forEach(button => { button.disabled = false; });
  announce();
}

load().catch(error => {
  console.error(error);
  document.querySelectorAll(".loading").forEach(node => {
    node.textContent = "Artwork could not load. Refresh this page to try again.";
    node.classList.add("error");
  });
  document.querySelectorAll("[aria-busy]").forEach(node => { node.setAttribute("aria-busy", "false"); });
  status.textContent = "Artwork unavailable. Refresh this page to try again.";
  status.classList.add("error");
});
