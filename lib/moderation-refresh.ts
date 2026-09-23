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

export const MODERATION_PAGE_SIZE = 200;

/** Read the complete queue using an ascending, unique report UUID cursor. */
export async function readModerationPages<Row>(
  readPage: (after: string | null, signal: AbortSignal) => PromiseLike<{
    data: Row[] | null;
    error: { message: string; code?: string } | null;
    status: number;
  }>,
  reportId: (row: Row) => string,
  signal: AbortSignal,
) {
  const rows: Row[] = [];
  let after: string | null = null;
  for (;;) {
    signal.throwIfAborted();
    const page = await readPage(after, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
    signal.throwIfAborted();
    if (page.error) return page; // Preserve authorization failures; never publish a partial queue.
    if (!page.data?.length) return { ...page, data: rows };
    const next = reportId(page.data[page.data.length - 1]);
    if (!next || (after !== null && next <= after)) throw new Error('queue_cursor_did_not_advance');
    rows.push(...page.data);
    after = next;
    // Only an empty page proves exhaustion: the server may cap below our limit.
  }
}

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
