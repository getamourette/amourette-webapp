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
  return Object.keys(payload).length === 1 && payload.version === 1;
}
