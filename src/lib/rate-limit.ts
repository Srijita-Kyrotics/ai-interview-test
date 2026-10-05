/**
 * Per-process fixed-window rate limiter.
 *
 * The counters live in module scope, so they are best-effort: a multi-instance
 * deployment gets one bucket per instance rather than a shared one. That is
 * deliberate — the point is to stop a single client looping an endpoint that
 * costs money, not to be a substitute for a real gateway.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Returns true when the call is allowed, and records it. Callers should treat a
 * false result as "ask the client to slow down" rather than an error to hide.
 */
export function consume(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

export function retryAfterMs(key: string): number {
  const bucket = buckets.get(key);
  if (!bucket) return 0;
  return Math.max(0, bucket.resetAt - Date.now());
}

/** Test seam: drops all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}

function sweep(now: number): void {
  // Cheap and bounded: the map only ever holds keys touched since the last
  // window, and a full sweep is cheaper than tracking a separate timer.
  if (buckets.size < 1024) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}