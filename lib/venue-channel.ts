import type { RealtimeChannel } from "@supabase/supabase-js";

// Removal never owns the shared socket. The SDK tears down only on "ok";
// errors need a local close as well, and timeouts still need timer teardown.
export async function releaseVenueChannel(
  channel: Pick<RealtimeChannel, "unsubscribe" | "teardown">,
  remove: () => Promise<string>,
  onError: (error: unknown) => void = error => console.warn("Venue channel removal failed", error),
) {
  try {
    const result = await remove();
    if (result === "ok") return;
    onError(result);
  } catch (error) {
    onError(error);
  }
  try {
    // The SDK's close hooks remove the channel from its registry. A zero-timeout
    // leave invokes those hooks even when the server cannot acknowledge it.
    await channel.unsubscribe(0);
  } catch (error) {
    onError(error);
  } finally {
    channel.teardown();
  }
}
