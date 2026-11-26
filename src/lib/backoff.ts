export const BASE_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30000;
export const MAX_JITTER_MS = 1000;

/**
 * Computes exponential backoff delay capped at 30s with bounded random jitter
 * to avoid thundering-herd reconnect spikes.
 */
export function calculateBackoffDelay(
  attempt: number,
  randomFn: () => number = Math.random,
): number {
  const safeAttempt = Number.isFinite(attempt)
    ? Math.max(0, Math.floor(attempt))
    : 0;
  const exponential = Math.min(
    BASE_BACKOFF_MS * 2 ** safeAttempt,
    MAX_BACKOFF_MS,
  );
  const clampedRand = Math.min(0.999999, Math.max(0, randomFn()));
  const jitter = Math.floor(clampedRand * MAX_JITTER_MS);
  return exponential + jitter;
}
