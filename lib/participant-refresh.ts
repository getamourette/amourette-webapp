export const PARTICIPANT_EVENT = 'amourette-participant-refresh';
export const PARTICIPANT_TOPIC = 'participant:';
export const PARTICIPANT_SIGNAL = 'state_changed';
export const PARTICIPANT_POLL_MS = 30_000;
export const PARTICIPANT_COALESCE_MS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isParticipantSignal(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload);
  return payload.version === 1 && (keys.length === 1 ||
    (keys.length === 2 && typeof payload.id === 'string' && UUID.test(payload.id)));
}

export function parseParticipantRevision(value: unknown): string | null {
  if (value === null || (typeof value === 'string' && UUID.test(value))) return value;
  throw new Error('Invalid participant revision');
}

let supported = false;
let generation = 0;
export function participantSyncAvailable() { return supported; }
export function setParticipantSyncAvailable(value: boolean) { supported = value; }
export function participantGeneration() { return generation; }
export function markParticipantStale() { generation++; }
export function invalidateParticipant() {
  generation++;
  window.dispatchEvent(new Event(PARTICIPANT_EVENT));
}

/** Compose cancellation on browsers without AbortSignal.any, releasing listeners after use. */
export function combineAbortSignals(signals: AbortSignal[]) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  for (const signal of signals) {
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  }
  return {
    signal: controller.signal,
    dispose: () => signals.forEach(signal => signal.removeEventListener('abort', cancel)),
  };
}

/** One read at a time, bounded burst delay, trailing reads, and failure recovery.
 * `current()` becomes false immediately on a newer request, before its read starts.
 * Callers check it before publishing any data. Disposal invalidates all results.
 */
export function createParticipantRefresh(
  load: (signal: AbortSignal, current: () => boolean) => Promise<boolean>,
  delay = PARTICIPANT_COALESCE_MS,
  retryDelay = 5_000,
) {
  const controller = new AbortController();
  let epoch = 0;
  let running = false;
  let pending = false;
  let runningController: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retrying = false;
  let waiters: Array<(success: boolean) => void> = [];
  function schedule(ms: number, retry = false) {
    clearTimeout(timer);
    retrying = retry;
    timer = setTimeout(() => void run(), ms);
  }
  async function run() {
    timer = undefined;
    retrying = false;
    if (controller.signal.aborted || running) return;
    running = true;
    const attempt = new AbortController();
    runningController = attempt;
    const cancellation = combineAbortSignals([controller.signal, attempt.signal]);
    const signal = cancellation.signal;
    const deadline = setTimeout(() => attempt.abort(), 15_000);
    pending = false;
    const revision = epoch;
    const current = () => !signal.aborted && revision === epoch;
    let success = false;
    try { success = await load(signal, current); }
    catch { /* Local retry; never log payloads or private failure details. */ }
    finally { clearTimeout(deadline); cancellation.dispose(); }
    running = false;
    runningController = undefined;
    if (controller.signal.aborted) return;
    if (pending) schedule(delay);
    else {
      const completed = waiters; waiters = [];
      completed.forEach(resolve => resolve(success));
      if (!success) schedule(retryDelay, true);
    }
  }
  return {
    request(immediate = false): Promise<boolean> {
      if (controller.signal.aborted) return Promise.resolve(false);
      epoch++; pending = true;
      // Recovery must not wait indefinitely for an obsolete HTTP request. Its
      // rejection settles before the queued read starts; normal bursts serialize.
      if (immediate) runningController?.abort();
      const result = new Promise<boolean>(resolve => waiters.push(resolve));
      if (!running && (timer === undefined || immediate || retrying)) schedule(immediate ? 0 : delay);
      return result;
    },
    dispose() {
      controller.abort(); clearTimeout(timer);
      waiters.forEach(resolve => resolve(false)); waiters = [];
    },
  };
}
