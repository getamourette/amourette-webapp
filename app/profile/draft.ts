import { isRecord, TEXT_RAW_MAX_BYTES } from "@/lib/input-validation";
// Onboarding draft persistence (#72, #98, #281). Non-sensitive answers live in localStorage;
// the selected photo lives in IndexedDB because localStorage cannot safely hold
// a File. Both stores are keyed by the anonymous user id.
// The photo is stored as raw bytes (an ArrayBuffer), not as a Blob: WebKit
// refuses a Blob in IndexedDB in an ephemeral session, which is what Safari's
// Private Browsing uses (#512). Drafts saved earlier as a Blob are still read.
// The draft as a whole lives 24 hours after its last deliberate edit (#286): the
// text records `editedAt` when an answer changes, the photo `savedAt` when a
// photo or framing is confirmed, and the later of the two sets the deadline.
// Reads, reloads, restoration and sanitization keep both timestamps unchanged.

import { type Gender } from "@/lib/profile";
import { MAX_PHOTO_SOURCE_BYTES, isPhotoCrop, type PhotoCrop } from "@/lib/photo-upload";

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
export const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;

// A missing, malformed or future edit time grants no lifetime at all, so a
// legacy draft (saved before #286) or a forged value is never revived.
function editTime(value: unknown, now: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= now ? value : -Infinity;
}

export function draftAlive(lastEdit: number, now = Date.now()): boolean {
  return now - lastEdit < DRAFT_LIFETIME_MS;
}

function readStoredText(userId: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId);
    if (!raw || raw.length > 32768) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type StoredPhotoDraft = {
  userId: string;
  bytes: ArrayBuffer;
  name: string;
  type: string;
  lastModified: number;
  savedAt: number;
  crop?: PhotoCrop;
  roundSourceCrop?: PhotoCrop;
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

// Writes (or, without `prepare`, deletes) the draft in the per-user queue, so a
// later clear can never be overtaken by an earlier save still reading its file.
// Resolves false when the file could not be read or the browser refused the write.
function writePhotoDraft(
  userId: string,
  prepare?: () => Promise<StoredPhotoDraft>
): Promise<boolean> {
  let written = false;
  return runPhotoOperation(userId, async () => {
    const value = prepare ? await prepare() : undefined;
    const database = await openPhotoDatabase();
    if (!database) return;
    written = await new Promise<boolean>((resolve) => {
      try {
        const transaction = database.transaction(PHOTO_STORE, "readwrite");
        const store = transaction.objectStore(PHOTO_STORE);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
        if (value) store.put(value);
        else store.delete(userId);
      } catch {
        resolve(false);
      }
    });
    database.close();
  }).then(() => written);
}

export type RestoredDraft = OnboardingDraft & { editedAt: number };

// Returns the sanitized text draft with its edit time, or null. A record without
// a valid edit time is removed here: it cannot prove it is still within its window.
export function loadDraft(userId: string): RestoredDraft | null {
  if (typeof window === "undefined") return null;
  const parsed = readStoredText(userId);
  if (!parsed) return null;
  const editedAt = editTime(parsed.editedAt, Date.now());
  if (editedAt === -Infinity) {
    clearDraft(userId);
    return null;
  }
  const draft: OnboardingDraft = {
    firstName: typeof parsed.firstName === "string" && parsed.firstName.length <= TEXT_RAW_MAX_BYTES ? parsed.firstName : "",
    bio: typeof parsed.bio === "string" && parsed.bio.length <= TEXT_RAW_MAX_BYTES ? parsed.bio : "",
    gender: "",
    interestedIn: [],
    adultConfirmed: parsed.adultConfirmed === true,
    step: typeof parsed.step === "number" && Number.isInteger(parsed.step) && parsed.step >= 0 && parsed.step <= 5 ? parsed.step : 0,
  };
  // Rewrite old drafts immediately, even before a photo restore can fail. The
  // content is unchanged, so the rewrite keeps the original edit time.
  saveDraft(userId, draft);
  return { ...draft, editedAt };
}

// Saves on every form change. Only a changed answer (first name, bio, adulthood)
// is a deliberate edit that renews the deadline; restoring the same answers or
// moving between steps keeps the stored edit time. An empty form stores nothing.
export function saveDraft(userId: string, draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  try {
    if (!draft.firstName && !draft.bio && !draft.adultConfirmed) {
      window.localStorage.removeItem(KEY_PREFIX + userId);
      return;
    }
    const stored = readStoredText(userId);
    const unchanged = stored !== null && stored.firstName === draft.firstName && stored.bio === draft.bio &&
      (stored.adultConfirmed === true) === draft.adultConfirmed;
    window.localStorage.setItem(KEY_PREFIX + userId, JSON.stringify({
      firstName: draft.firstName, bio: draft.bio, adultConfirmed: draft.adultConfirmed, step: Math.min(draft.step, 2),
      editedAt: unchanged ? stored.editedAt : Date.now(),
    }));
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

// Saves the original photo so it survives a reload. A refused write is logged
// and otherwise ignored: the photo stays selected in the open page, and only a
// reload would ask the guest to pick it again.
export async function savePhotoDraft(userId: string, file: File, crop?: PhotoCrop, roundSourceCrop?: PhotoCrop): Promise<boolean> {
  const saved = await writePhotoDraft(userId, async () => ({
    userId,
    bytes: await file.arrayBuffer(),
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    savedAt: Date.now(),
    crop,
    roundSourceCrop,
  }));
  if (!saved) console.warn("Could not save the onboarding photo draft: the browser refused the write");
  return saved;
}

type RestoredPhoto = { file: File; savedAt: number; crop?: PhotoCrop; roundSourceCrop?: PhotoCrop };

// Reads the photo record without judging its age: the whole draft's deadline is
// decided by loadOnboardingDrafts.
async function loadPhotoDraft(userId: string): Promise<RestoredPhoto | null> {
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

  // Current drafts hold `bytes`; drafts saved before #512 hold a `blob`.
  const source =
    typeof stored === "object" && stored !== null
      ? "bytes" in stored && stored.bytes instanceof ArrayBuffer
        ? stored.bytes
        : "blob" in stored && stored.blob instanceof Blob
          ? stored.blob
          : null
      : null;
  const sourceSize = source instanceof ArrayBuffer ? source.byteLength : source?.size ?? 0;
  if (
    typeof stored !== "object" ||
    stored === null ||
    source === null ||
    sourceSize === 0 || sourceSize > MAX_PHOTO_SOURCE_BYTES ||
    !("name" in stored) ||
    typeof stored.name !== "string" ||
    !("type" in stored) ||
    typeof stored.type !== "string" ||
    !("lastModified" in stored) ||
    typeof stored.lastModified !== "number" ||
    !Number.isFinite(stored.lastModified) ||
    !("savedAt" in stored) ||
    typeof stored.savedAt !== "number" ||
    editTime(stored.savedAt, Date.now()) === -Infinity
    || ("roundSourceCrop" in stored && stored.roundSourceCrop !== undefined && !isPhotoCrop(stored.roundSourceCrop))
    || ("crop" in stored && stored.crop !== undefined && !isPhotoCrop(stored.crop))
  ) {
    await clearPhotoDraft(userId);
    return null;
  }

  try {
    const file = new File([source], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    });
    return { file, savedAt: stored.savedAt, roundSourceCrop: "roundSourceCrop" in stored ? stored.roundSourceCrop as PhotoCrop | undefined : undefined, crop: "crop" in stored ? stored.crop as PhotoCrop | undefined : undefined };
  } catch {
    await clearPhotoDraft(userId);
    return null;
  }
}

export async function clearPhotoDraft(userId: string): Promise<void> {
  await writePhotoDraft(userId);
}

// Restores the onboarding draft only while it is within 24 hours of its last
// deliberate edit; an expired draft is cleared before anything is shown.
export async function loadOnboardingDrafts(userId: string): Promise<{ draft: RestoredDraft | null; photo: RestoredPhoto | null }> {
  const draft = loadDraft(userId);
  const photo = await loadPhotoDraft(userId);
  if (draftAlive(Math.max(draft?.editedAt ?? -Infinity, photo?.savedAt ?? -Infinity))) return { draft, photo };
  if (draft) clearDraft(userId);
  if (photo) await clearPhotoDraft(userId);
  return { draft: null, photo: null };
}

// Clears every expired draft on this device when the app starts, including
// drafts of an earlier anonymous identity that will never be resumed. Only the
// draft keys and the photo store are touched, never the session or a profile.
export async function clearExpiredOnboardingDrafts(): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const textEditTime = (userId: unknown) =>
    typeof userId === "string" ? editTime(readStoredText(userId)?.editedAt, now) : -Infinity;
  const livePhotos = new Map<string, number>();
  const database = await openPhotoDatabase();
  if (database) {
    // One readwrite transaction: a photo saved meanwhile waits for it, so a
    // fresh record is never judged on an older read.
    await new Promise<void>((resolve) => {
      try {
        const transaction = database.transaction(PHOTO_STORE, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
        transaction.onabort = () => resolve();
        const request = transaction.objectStore(PHOTO_STORE).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const value: unknown = cursor.value;
          const userId = isRecord(value) ? value.userId : undefined;
          const savedAt = isRecord(value) ? editTime(value.savedAt, now) : -Infinity;
          if (typeof userId === "string" && draftAlive(Math.max(savedAt, textEditTime(userId)), now)) livePhotos.set(userId, savedAt);
          else cursor.delete();
          cursor.continue();
        };
      } catch {
        resolve();
      }
    });
    database.close();
  }
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter((key): key is string => key !== null && key.startsWith(KEY_PREFIX));
    for (const key of keys) {
      const userId = key.slice(KEY_PREFIX.length);
      const editedAt = textEditTime(userId);
      if (editedAt === -Infinity || !draftAlive(Math.max(editedAt, livePhotos.get(userId) ?? -Infinity), now)) storage.removeItem(key);
    }
  } catch {
    // Unavailable storage holds no draft to clear.
  }
}
