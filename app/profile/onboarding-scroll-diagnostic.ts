// Temporary #216 device diagnostic. Opt-in geometry is sent to preview logs;
// copy/download remains a fallback. Never read field values or profile data.
import { SCROLL_BOX_FIELDS, SCROLL_ELEMENTS, SCROLL_EVENTS, SCROLL_TAGS, type ScrollRow } from "@/lib/onboarding-scroll-trace";
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
  const run = crypto.randomUUID();
  const device = [window.screen.width, window.screen.height, window.devicePixelRatio,
    /iPhone|iPad|iPod/.test(navigator.userAgent) ? 1 : /Android/.test(navigator.userAgent) ? 2 : 0];
  const pending: ScrollRow[] = [];
  let batch = 0;
  let uploading = false;
  let remoteAt = -Infinity;
  let lastRemoteGeometry = "";
  let remoteSamples = 0;

  function queue(event: string, current: ReturnType<typeof geometry>) {
    const now = performance.now() - started;
    if (remoteSamples >= 600) return;
    const serialized = JSON.stringify(current);
    if (event === "poll" && serialized === lastRemoteGeometry) return;
    // Keep focus boundaries, then at most ten periodic samples per second.
    if (now - remoteAt < 100 && !["initial", "pointerdown", "focusin", "focusout", "before-copy", "pagehide"].includes(event)) return;
    remoteAt = now;
    lastRemoteGeometry = serialized;
    remoteSamples++;
    const tag = (value: string | undefined) => SCROLL_TAGS.findIndex((name) => name === value);
    pending.push([
      round(now), SCROLL_EVENTS.findIndex((name) => name === event), current.step === null ? null : Number(current.step),
      tag(current.focused), tag(current.scrollingElement), current.window.scrollY, current.window.innerHeight,
      current.viewport?.offsetTop ?? null, current.viewport?.pageTop ?? null,
      current.viewport?.height ?? null, current.viewport?.width ?? null, current.viewport?.scale ?? null,
      ...SCROLL_ELEMENTS.flatMap((element) => SCROLL_BOX_FIELDS.map((field) => current[element]?.[field] ?? null)),
    ]);
  }

  async function upload() {
    if (uploading || pending.length === 0) return;
    uploading = true;
    const rows = pending.slice(0, 20);
    try {
      const response = await fetch("/api/debug/onboarding-scroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run, batch, device, rows }),
        keepalive: true,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Diagnostic upload unavailable");
      pending.splice(0, rows.length);
      batch++;
      if (!stopped && report === null) button.textContent = "Diagnostic sent automatically";
    } catch {
      if (!stopped && report === null) button.textContent = "Upload pending — tap to copy instead";
    } finally {
      uploading = false;
    }
  }

  function capture(event: string) {
    if (stopped || report !== null) return;
    const current = geometry();
    const serialized = JSON.stringify(current);
    if (event === "poll" && serialized === lastGeometry) {
      // A stable final position may have been throttled on its first frame.
      queue(event, current);
      return;
    }
    lastGeometry = serialized;
    queue(event, current);
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
  button.textContent = "Diagnostic sends automatically";
  button.dataset.scrollDiagnostic = "true";
  button.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:2147483647;max-width:calc(100vw - 16px);min-height:44px;padding:8px 12px;border:1px solid #e9b9bc;border-radius:8px;background:#21141a;color:#fff;font:14px system-ui;";

  function freeze() {
    if (report !== null) return report;
    capture("before-copy");
    report = JSON.stringify({
      diagnostic: "onboarding-scroll-v2",
      run,
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
  queue("initial", initial);
  const uploadInterval = window.setInterval(() => { void upload(); }, 1_000);
  const flush = () => { capture("pagehide"); void upload(); };
  window.addEventListener("pagehide", flush);
  void upload();

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    window.clearInterval(heartbeat);
    window.clearInterval(uploadInterval);
    window.removeEventListener("pagehide", flush);
    void upload();
    removers.forEach((remove) => remove());
    downloadUrls.forEach((url) => URL.revokeObjectURL(url));
    button.remove();
  };
}
