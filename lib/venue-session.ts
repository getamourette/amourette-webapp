// Each entry owns an abort signal. Invalidating it synchronously disables both
// network results and callbacks, without waiting for Realtime leave acknowledgements.
export function createVenueSession() {
  let controller = new AbortController();
  return {
    get signal() { return controller.signal; },
    stop() { controller.abort(); },
    restart() {
      controller.abort();
      controller = new AbortController();
      return controller.signal;
    },
  };
}

// An effect can end before the whole entry (e.g. hiding the discovery feed).
export function venueEffect(parent: AbortSignal) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (parent.aborted) stop();
  else parent.addEventListener("abort", stop, { once: true });
  controller.signal.addEventListener("abort", () => parent.removeEventListener("abort", stop), { once: true });
  return { signal: controller.signal, stop };
}

// One read at a time; a trigger during a read earns one subsequent read. A
// foreground/reconnect request must survive coalescing with ordinary polling.
export function coalesceVenueChecks(
  signal: AbortSignal,
  check: (force: boolean) => Promise<void>,
  onError: (error: unknown) => void,
) {
  let running = false;
  let pending = false;
  let forced = false;
  return async (force = false) => {
    if (signal.aborted) return;
    pending = true;
    forced ||= force;
    if (running) return;
    running = true;
    try {
      while (pending && !signal.aborted) {
        const nextForce = forced;
        pending = forced = false;
        try { await check(nextForce); }
        catch (error) { if (!signal.aborted) onError(error); }
      }
    } finally { running = false; }
  };
}

export function venueResources(status: string) {
  const social = status === "ready" || status === "invisible";
  return {
    lifecycle: social || status === "waiting" || status === "paused" || status === "offHours",
    heartbeat: social || status === "waiting",
    feed: status === "ready",
    social,
  };
}

// Called only after a successful owner-scoped read/write. Missing rows confirm
// absence; missing/malformed fields never confirm a departure.
export function presenceHasEnded(value: unknown, expectedId: string): boolean {
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value) ||
      !("id" in value) || value.id !== expectedId || !("left_at" in value)) {
    throw new Error("Invalid owner presence response");
  }
  if (value.left_at === null) return false;
  if (typeof value.left_at !== "string" || value.left_at.length > 64 ||
      !/^\d{4}-\d{2}-\d{2}T/.test(value.left_at) || !Number.isFinite(Date.parse(value.left_at))) {
    throw new Error("Invalid departure timestamp");
  }
  return true;
}
