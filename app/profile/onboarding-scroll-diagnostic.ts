// Temporary #216 device diagnostic. Geometry stays in memory until explicitly
// copied/downloaded. Never read field values, profile data, storage, or full URLs.
const MAX_SAMPLES = 300;
const round = (value: number) => Math.round(value * 100) / 100;

function box(element: Element | null) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: round(rect.top),
    height: round(rect.height),
    scrollTop: round(element.scrollTop),
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  };
}

function geometry() {
  const wizard = document.querySelector("[data-onboarding-step]");
  const field = wizard?.querySelector(".onb-input") ?? null;
  const viewport = window.visualViewport;
  return {
    step: wizard?.getAttribute("data-onboarding-step") ?? null,
    focused: document.activeElement === field ? field?.tagName : document.activeElement?.tagName,
    window: { scrollY: round(window.scrollY), innerHeight: window.innerHeight },
    scrollingElement: document.scrollingElement?.tagName,
    viewport: viewport ? {
      offsetTop: round(viewport.offsetTop),
      pageTop: round(viewport.pageTop),
      height: round(viewport.height),
      width: round(viewport.width),
      scale: round(viewport.scale),
    } : null,
    html: box(document.documentElement),
    body: box(document.body),
    main: box(wizard?.closest("main") ?? null),
    content: box(wizard?.parentElement ?? null),
    wizard: box(wizard),
    progress: box(wizard?.querySelector(".onb-progress") ?? null),
    field: box(field),
  };
}

export function startScrollDiagnostic() {
  const started = performance.now();
  const initial = geometry();
  const samples: { ms: number; event: string; geometry: ReturnType<typeof geometry> }[] = [];
  let lastGeometry = JSON.stringify(initial);
  let droppedSamples = 0;
  let report: string | null = null;
  let stopped = false;
  let frame = 0;
  let followUntil = 0;
  const removers: (() => void)[] = [];
  const downloadUrls: string[] = [];

  function capture(event: string) {
    if (stopped || report !== null) return;
    const current = geometry();
    const serialized = JSON.stringify(current);
    if (event === "poll" && serialized === lastGeometry) return;
    lastGeometry = serialized;
    samples.push({ ms: round(performance.now() - started), event, geometry: current });
    if (samples.length > MAX_SAMPLES) {
      samples.shift();
      droppedSamples++;
    }
  }

  // Sample each animation frame during transitions, plus a slow heartbeat to
  // catch changes Safari does not announce. No layout/scroll writes or renders.
  function follow() {
    frame = 0;
    if (stopped || report !== null) return;
    capture("poll");
    if (performance.now() < followUntil) frame = requestAnimationFrame(follow);
  }

  function listen(target: EventTarget, type: string, label: string) {
    const handler = (event: Event) => {
      if (button.contains(event.target instanceof Node ? event.target : null)) return;
      capture(label);
      followUntil = performance.now() + 2_000;
      if (!frame && report === null) frame = requestAnimationFrame(follow);
    };
    target.addEventListener(type, handler, { passive: true, capture: true });
    removers.push(() => target.removeEventListener(type, handler, true));
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Copy scroll diagnostic";
  button.dataset.scrollDiagnostic = "true";
  button.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:2147483647;max-width:calc(100vw - 16px);min-height:44px;padding:8px 12px;border:1px solid #e9b9bc;border-radius:8px;background:#21141a;color:#fff;font:14px system-ui;";

  function freeze() {
    if (report !== null) return report;
    capture("before-copy");
    report = JSON.stringify({
      diagnostic: "onboarding-scroll-v1",
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      screen: { width: window.screen.width, height: window.screen.height },
      initial,
      droppedSamples,
      samples,
    });
    cancelAnimationFrame(frame);
    window.clearInterval(heartbeat);
    removers.forEach((remove) => remove());
    return report;
  }

  // Freeze before the button can take focus and change the viewport itself.
  button.onpointerdown = (event) => {
    freeze();
    event.preventDefault();
  };
  button.onclick = () => {
    const text = freeze();
    if (!navigator.clipboard) {
      offerDownload(text);
      return;
    }
    void navigator.clipboard.writeText(text).then(() => {
      if (!stopped) button.textContent = "Copied — paste in the conversation";
    }).catch(() => {
      if (!stopped) offerDownload(text);
    });
  };

  function offerDownload(text: string) {
    button.textContent = "Copy unavailable — download diagnostic";
    button.onclick = () => {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      downloadUrls.push(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = "onboarding-scroll-diagnostic.json";
      link.click();
    };
  }

  document.body.append(button);
  listen(document, "pointerdown", "pointerdown");
  listen(document, "focusin", "focusin");
  listen(document, "focusout", "focusout");
  listen(document, "scroll", "element-scroll");
  listen(window, "scroll", "window-scroll");
  listen(window, "resize", "window-resize");
  listen(window, "orientationchange", "orientationchange");
  if (window.visualViewport) {
    listen(window.visualViewport, "resize", "viewport-resize");
    listen(window.visualViewport, "scroll", "viewport-scroll");
  }
  const heartbeat = window.setInterval(() => capture("poll"), 250);

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    window.clearInterval(heartbeat);
    removers.forEach((remove) => remove());
    downloadUrls.forEach((url) => URL.revokeObjectURL(url));
    button.remove();
  };
}
