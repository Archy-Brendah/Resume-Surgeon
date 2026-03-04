/**
 * Anti-Spam rate limiter for AI endpoints (e.g. Sharpen: max 10 req/min per user).
 * Uses in-memory store per process. For multi-instance production, use Upstash Redis:
 *   npm install @upstash/ratelimit @upstash/redis
 *   Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, then switch to Upstash in this module.
 */

const windowMs = 60 * 1000; // 1 minute
const limits = new Map<string, { count: number; resetAt: number }>();

function getKey(userId: string, action: string): string {
  return `rl:${userId}:${action}`;
}

/**
 * Returns true if the request is allowed, false if rate limited.
 * Call this at the start of the API route after auth; if false, return 429.
 */
export function checkRateLimit(userId: string, action: string, maxPerWindow: number): boolean {
  const key = getKey(userId, action);
  const now = Date.now();
  const entry = limits.get(key);

  if (!entry) {
    limits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (now >= entry.resetAt) {
    limits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxPerWindow) {
    return false;
  }

  entry.count += 1;
  return true;
}

/** Cleanup old entries periodically to avoid unbounded memory growth. */
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of limits.entries()) {
      if (now >= v.resetAt) limits.delete(k);
    }
  }, 5 * 60 * 1000); // every 5 min
}
