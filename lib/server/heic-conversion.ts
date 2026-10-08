import { Worker, type WorkerOptions } from 'node:worker_threads';
import path from 'node:path';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { hasHeicBrand, isHeicType } from '../heic.ts';
// @ts-expect-error -- Node source entry for deterministic image tests.
import { MAX_PHOTO_SOURCE_BYTES, MAX_PHOTO_OUTPUT_BYTES } from '../photo-upload.ts';

// No unbounded queue or shared decoder state. Workers are terminated on timeout
// or cancellation, including synchronous WASM work that an AbortSignal cannot stop.
let active = 0;
export async function convertHeic(file: File, signal?: AbortSignal): Promise<File> {
  if (!isHeicType(file.type) || !file.size || file.size > MAX_PHOTO_SOURCE_BYTES) throw new Error('invalid_photo');
  if (!hasHeicBrand(new Uint8Array(await file.slice(0, 4096).arrayBuffer()))) throw new Error('unsupported_heic');
  signal?.throwIfAborted();
  if (active >= 2) throw new Error('decoder_busy');
  active++;
  try {
    const bytes = await file.arrayBuffer();
    signal?.throwIfAborted();
    const png = await new Promise<Uint8Array>((resolve, reject) => {
      // Keep this traced file native: Turbopack rewrites `new Worker(...)` and
      // spreads workerData into an object, losing a transferred ArrayBuffer.
      const worker: Worker = Reflect.construct(Worker, [path.join(process.cwd(), 'lib/server/heic-worker.mjs'), {
        workerData: bytes, transferList: [bytes], execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 128 },
      } satisfies WorkerOptions]);
      let finished = false;
      const finish = (error?: Error, output?: Uint8Array) => {
        if (finished) return;
        finished = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
        void worker.terminate().finally(() => error ? reject(error) : resolve(output!));
      };
      const cancel = () => finish(new Error('conversion_cancelled'));
      const timer = setTimeout(() => finish(new Error('conversion_timeout')), 20_000);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      worker.once('error', () => finish(new Error('decoder_unavailable')));
      worker.once('exit', () => { if (!finished) finish(new Error('decoder_unavailable')); });
      worker.once('message', (message: unknown) => {
        if (typeof message !== 'object' || !message) return finish(new Error('invalid_photo'));
        if ('error' in message && typeof message.error === 'string') return finish(new Error(message.error));
        if (!('png' in message) || !(message.png instanceof Uint8Array) || !message.png.length || message.png.length > MAX_PHOTO_OUTPUT_BYTES) return finish(new Error('invalid_photo'));
        finish(undefined, message.png);
      });
    });
    return new File([new Uint8Array(png)], 'photo.png', { type: 'image/png' });
  } finally { active--; }
}
