'use client';
import { createContext, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export async function downloadPhoto(path: string) {
  const { data, error } = await supabase.storage.from('profile-photos').download(path, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' });
  return error ? null : data;
}

export const PhotoReviewDownloads = createContext<((path: string, generation: number) => Promise<Blob | null>) | null>(null);

// Only the mounted founder review shares downloads. Public avatars always
// resolve their projection and authorization independently. Each invalidation
// starts fresh Storage checks; no private bytes enter persistent browser storage.
export function PhotoReviewImages({ children }: { children: ReactNode }) {
  const [download] = useState(() => {
    let generation = -1;
    const entries = new Map<string, Promise<Blob | null>>();
    return (path: string, nextGeneration: number) => {
      if (generation !== nextGeneration) {
        generation = nextGeneration;
        entries.clear();
      }
      const existing = entries.get(path);
      if (existing) return existing;
      // Bound memory even when a founder browses a long queue.
      if (entries.size >= 40) entries.delete(entries.keys().next().value!);
      const request = downloadPhoto(path).catch(() => null).then(blob => {
        if (!blob && entries.get(path) === request) entries.delete(path);
        return blob;
      });
      entries.set(path, request);
      return request;
    };
  });
  return <PhotoReviewDownloads.Provider value={download}>{children}</PhotoReviewDownloads.Provider>;
}
