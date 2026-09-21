/** Serialize queue reads and collapse bursts without losing an in-flight invalidation. */
export function createModerationRefresh(load: (signal: AbortSignal) => Promise<void>, delay = 200) {
  let disposed = false;
  let pending = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();

  async function run() {
    timer = undefined;
    if (disposed || running) return;
    pending = false;
    running = true;
    try {
      await load(controller.signal);
    } finally {
      running = false;
      if (pending && !disposed) timer = setTimeout(() => void run(), delay);
    }
  }

  return {
    request(immediate = false) {
      if (disposed) return;
      pending = true;
      if (running) return;
      if (timer !== undefined) {
        if (!immediate) return;
        clearTimeout(timer);
      }
      timer = setTimeout(() => void run(), immediate ? 0 : delay);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    },
  };
}

export const MODERATION_TOPIC = 'founder-moderation';
export const MODERATION_EVENT = 'queue_changed';

/** Only the versioned, content-free database signal is accepted. */
export function isModerationSignal(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (payload.version !== 1) return false;
  const keys = Object.keys(payload);
  if (keys.length === 1) return true;
  // realtime.send adds its own random message UUID, unrelated to any report.
  return keys.length === 2 && typeof payload.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.id);
}
