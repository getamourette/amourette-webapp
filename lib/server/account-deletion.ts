// #258: founder deletion of a guest's profile and account on a verified request.
// Server-only: the client passed in holds the service-role key.

// Every bucket a guest's photo files can live in, each under `<user id>/`.
export const ACCOUNT_PHOTO_BUCKETS = ["profile-photos", "profile-photo-staging", "profile-photo-sources", "profile-photo-rounds"] as const;

export type DeletionVerdict = "deleted" | "gone" | "self" | "founder" | "open_report" | "open_case" | "removed";
export const DELETION_VERDICTS: readonly DeletionVerdict[] = ["deleted", "gone", "self", "founder", "open_report", "open_case", "removed"];

// What the founder reads when the account cannot be deleted yet.
export const DELETION_REFUSALS: Record<Exclude<DeletionVerdict, "deleted" | "gone">, string> = {
  self: "You cannot delete your own account here.",
  founder: "Founder accounts cannot be deleted from the console.",
  open_report: "A report this person made or received is still open. Decide it in the moderation queue first: deleting the account would erase it.",
  open_case: "A moderation case about this person is waiting for review. Decide it first.",
  removed: "This person is removed from a night that has not ended. Delete the account after the night ends.",
};

type Failure = { message?: string } | null;
export type PhotoStorage = {
  storage: { from(bucket: string): {
    list(prefix: string, options: { limit: number }): PromiseLike<{ data: { name: string }[] | null; error: Failure }>;
    remove(paths: string[]): PromiseLike<{ error: Failure }>;
  } };
};

// Runs once the account is gone (admin_delete_guest_account returned
// 'deleted' or 'gone'): nothing points at these files any more. Repeatable: a
// retry after a failure lists what is left and finishes the job.
export async function removePhotoFiles(service: PhotoStorage, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of ACCOUNT_PHOTO_BUCKETS) {
    const files = service.storage.from(bucket);
    // A page at a time until the folder is empty; bounded so a remove that
    // reports success without removing cannot loop forever.
    for (let page = 0; ; page++) {
      const listed = await files.list(userId, { limit: 100 });
      if (listed.error) throw new Error("storage_list_failed");
      const names = (listed.data ?? []).map(file => `${userId}/${file.name}`);
      if (!names.length) break;
      if (page === 50) throw new Error("storage_not_emptied");
      const { error } = await files.remove(names);
      if (error) throw new Error("storage_remove_failed");
      removed += names.length;
    }
  }
  return removed;
}
