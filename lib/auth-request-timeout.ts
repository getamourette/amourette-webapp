// Auth requests hang the same way, and every database request first waits for
// the session: a stalled first sign-in held the doorway logo forever (#244). An
// Auth request gives up after this long; supabase-js reports it as a retryable
// network error, so a first scan shows its Retry path and a token refresh goes
// to "Reconnecting…" without replacing the guest (#480).
export const AUTH_REQUEST_TIMEOUT_MS = 15_000;

export function withAuthRequestTimeout(
  supabaseUrl: string,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
  base: typeof fetch = (...args) => fetch(...args),
): typeof fetch {
  const authPrefix = new URL("/auth/v1/", supabaseUrl).href;
  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(authPrefix)) return base(input, init);
    // The timer is not cleared on headers: it also bounds reading the body.
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Auth request timed out", "TimeoutError")), timeoutMs);
    const caller = init?.signal;
    if (caller?.aborted) controller.abort(caller.reason);
    else caller?.addEventListener("abort", () => controller.abort(caller.reason), { once: true });
    return base(input, { ...init, signal: controller.signal });
  };
}
