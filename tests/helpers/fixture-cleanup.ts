import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";

export async function disposeFixtures(service: SupabaseClient<Database>, runId: string, venues: { id: string; slug: string }[], userIds: string[]) {
  const errors: unknown[] = [];
  // Continue after each failure; leftover fixtures must fail the test, not just log.
  const attempt = async (operation: () => PromiseLike<{ error: unknown }>) => {
    try {
      const { error } = await operation();
      if (error) errors.push(error);
    } catch (error) { errors.push(error); }
  };
  for (const venue of venues) {
    if (!venue.slug.startsWith(`e2e-${runId}-`)) throw new Error("Refusing to clean an unowned venue");
    await attempt(() => service.from("reports").delete().eq("venue_id", venue.id));
    await attempt(() => service.from("venues").delete().eq("id", venue.id).eq("slug", venue.slug));
  }
  for (const id of userIds) {
    // Auth deletion does not delete Storage objects uploaded during onboarding.
    for (const bucket of ["profile-photos", "profile-photo-staging", "profile-photo-sources", "profile-photo-rounds"]) await attempt(async () => {
      const { data, error } = await service.storage.from(bucket).list(id);
      if (error) return { error };
      if (data.length) return service.storage.from(bucket).remove(data.map((file) => `${id}/${file.name}`));
      return { error: null };
    });
    await attempt(() => service.auth.admin.deleteUser(id));
  }
  if (errors.length) throw new AggregateError(errors, `E2E cleanup failed for run ${runId}`);
}
