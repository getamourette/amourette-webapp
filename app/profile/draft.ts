// Onboarding draft persistence (#72, #98). Scalar answers live in localStorage;
// the selected photo lives in IndexedDB because localStorage cannot safely hold
// a File. Both stores are keyed by the anonymous user id.

import { GENDERS, type Gender } from "@/lib/profile";

export type OnboardingDraft = {
  firstName: string;
  bio: string;
  gender: Gender | "";
  interestedIn: Gender[];
  adultConfirmed: boolean;
  step: number;
};

const KEY_PREFIX = "amourette-onboarding-draft:";
const PHOTO_DATABASE = "amourette-onboarding";
const PHOTO_DATABASE_VERSION = 1;
const PHOTO_STORE = "photo-drafts";
const PHOTO_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type StoredPhotoDraft = {
  userId: string;
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
  savedAt: number;
};

const photoOperations = new Map<string, Promise<void>>();

function openPhotoDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const indexedDatabase = window.indexedDB;
      if (!indexedDatabase) return resolve(null);
      const request = indexedDatabase.open(PHOTO_DATABASE, PHOTO_DATABASE_VERSION);
      let settled = false;
      const finish = (database: IDBDatabase | null) => {
        if (settled) {
          database?.close();
          return;
        }
        settled = true;
        resolve(database);
      };
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PHOTO_STORE)) {
          request.result.createObjectStore(PHOTO_STORE, { keyPath: "userId" });
        }
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      resolve(null);
    }
  });
}

function runPhotoOperation(
  userId: string,
  operation: () => Promise<void>
): Promise<void> {
  const previous = photoOperations.get(userId) ?? Promise.resolve();
  const next = previous.then(operation, operation).catch(() => undefined);
  photoOperations.set(userId, next);
  void next.finally(() => {
    if (photoOperations.get(userId) === next) photoOperations.delete(userId);
  });
  return next;
}

function writePhotoDraft(
  userId: string,
  mode: IDBTransactionMode,
  value?: StoredPhotoDraft
): Promise<void> {
  return runPhotoOperation(userId, async () => {
    const database = await openPhotoDatabase();
    if (!database) return;
    await new Promise<void>((resolve) => {
      try {
        const transaction = database.transaction(PHOTO_STORE, mode);
        const store = transaction.objectStore(PHOTO_STORE);
        if (value) store.put(value);
        else store.delete(userId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
    database.close();
  });
}

function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

export function loadDraft(userId: string): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      bio: typeof parsed.bio === "string" ? parsed.bio : "",
      gender: isGender(parsed.gender) ? parsed.gender : "",
      interestedIn: Array.isArray(parsed.interestedIn)
        ? parsed.interestedIn.filter(isGender)
        : [],
      adultConfirmed: parsed.adultConfirmed === true,
      step: typeof parsed.step === "number" ? parsed.step : 0,
    };
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(draft));
  } catch {
    // Quota or private-mode failures are non-fatal: the flow still works, it
    // just won't resume after a reload. No need to surface this to the user.
  }
}

export function clearDraft(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
    // Ignore — a stale draft is harmless (it is overwritten on next save, and
    // the profile already exists so the resume path is no longer reached).
  }
}

export async function savePhotoDraft(userId: string, file: File): Promise<void> {
  await writePhotoDraft(userId, "readwrite", {
    userId,
    blob: file,
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    savedAt: Date.now(),
  });
}

export async function loadPhotoDraft(userId: string): Promise<File | null> {
  const pending = photoOperations.get(userId);
  if (pending) await pending;

  const database = await openPhotoDatabase();
  if (!database) return null;
  const stored = await new Promise<unknown>((resolve) => {
    try {
      const request = database
        .transaction(PHOTO_STORE, "readonly")
        .objectStore(PHOTO_STORE)
        .get(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  database.close();

  if (
    typeof stored !== "object" ||
    stored === null ||
    !("blob" in stored) ||
    !(stored.blob instanceof Blob) ||
    !("name" in stored) ||
    typeof stored.name !== "string" ||
    !("type" in stored) ||
    typeof stored.type !== "string" ||
    !("lastModified" in stored) ||
    typeof stored.lastModified !== "number" ||
    !Number.isFinite(stored.lastModified) ||
    !("savedAt" in stored) ||
    typeof stored.savedAt !== "number" ||
    !Number.isFinite(stored.savedAt) ||
    Date.now() - stored.savedAt > PHOTO_MAX_AGE_MS ||
    stored.savedAt > Date.now()
  ) {
    await clearPhotoDraft(userId);
    return null;
  }

  try {
    return new File([stored.blob], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    });
  } catch {
    await clearPhotoDraft(userId);
    return null;
  }
}

export async function clearPhotoDraft(userId: string): Promise<void> {
  await writePhotoDraft(userId, "readwrite");
}
