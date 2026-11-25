export function isRetryableResendStatus(status: number) {
  return status === 429 || status >= 500;
}
/**
 * Outbox state after a non-2xx Resend answer to a reservation email (#489).
 * 401 (revoked key) and 403 (unverified domain) are configuration faults, not the
 * guest's: retry them so mails leave once the founders fix the setup. The outbox
 * retries `failed` every 2 minutes and stops at 23 hours (`unknown`). Other 4xx
 * (422 invalid payload) would fail the same way again: stop now.
 */
export function launchMailFailureState(status: number): "failed" | "unknown" {
  return isRetryableResendStatus(status) || status === 401 || status === 403 || status === 409 ? "failed" : "unknown";
}
export function retryAt(attemptCount: number, nowMs = Date.now()) {
  return new Date(nowMs + Math.min(3_600_000, 30_000 * 2 ** attemptCount)).toISOString();
}
