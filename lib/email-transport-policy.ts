export function isRetryableResendStatus(status: number) {
  return status === 429 || status >= 500;
}

export function retryAt(attemptCount: number, nowMs = Date.now()) {
  return new Date(nowMs + Math.min(3_600_000, 30_000 * 2 ** attemptCount)).toISOString();
}

