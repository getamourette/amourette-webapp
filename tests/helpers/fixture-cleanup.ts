import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";

export async function disposeFixtures(service: SupabaseClient<Database>, runId: string, venues: { id: string; slug: string }[], userIds: string[], progress: (step: string) => void = () => {}) {
  const errors: unknown[] = [];
  // Continue after each failure; leftover fixtures must fail the test, not just log.
  const attempt = async (step: string, operation: () => PromiseLike<{ error: unknown }>) => {
    progress(step);
    try {
      const { error } = await operation();
      if (error) errors.push(error);
    } catch (error) { errors.push(error); }
  };
  for (const [index, venue] of venues.entries()) {
    if (!venue.slug.startsWith(`e2e-${runId}-`)) throw new Error("Refusing to clean an unowned venue");
    await attempt(`venue ${index + 1}: reports`, () => service.from("reports").delete().eq("venue_id", venue.id));
    await attempt(`venue ${index + 1}: venue`, () => service.from("venues").delete().eq("id", venue.id).eq("slug", venue.slug));
  }
  for (const [index, id] of userIds.entries()) {
    // Auth deletion does not delete Storage objects uploaded during onboarding.
    for (const bucket of ["profile-photos", "profile-photo-staging", "profile-photo-sources", "profile-photo-rounds"]) await attempt(`user ${index + 1}: list ${bucket}`, async () => {
      const { data, error } = await service.storage.from(bucket).list(id);
      if (error) return { error };
      if (data.length) {
        progress(`user ${index + 1}: remove ${bucket}`);
        return service.storage.from(bucket).remove(data.map((file) => `${id}/${file.name}`));
      }
      return { error: null };
    });
    await attempt(`user ${index + 1}: delete auth`, () => service.auth.admin.deleteUser(id));
  }
  if (errors.length) throw new AggregateError(errors, `E2E cleanup failed for run ${runId}`);
  progress('complete');
}
