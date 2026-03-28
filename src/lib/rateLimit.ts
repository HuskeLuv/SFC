/**
 * In-memory sliding window rate limiter for Edge Runtime.
 *
 * Uses only Web APIs (no Node.js-specific modules) so it runs in
 * Vercel Edge Middleware.
 *
 * LIMITATIONS:
 * - State lives in the isolate's memory and resets on cold starts.
 * - Each Edge isolate has its own map, so limits are per-isolate,
 *   not globally coordinated.
 * - Acceptable for a first iteration; upgrade path is Redis (Upstash
 *   or ElastiCache) when migrating to AWS.
 *
 * Cleanup runs lazily on every `check()` call — expired entries are
 * pruned when the map exceeds a size threshold, preventing unbounded
 * memory growth.
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix timestamp (seconds) when the window resets. */
  resetAt: number;
  /** Seconds until the caller can retry (only meaningful when blocked). */
  retryAfterSeconds: number;
  headers: Record<string, string>;
}

interface SlidingWindowEntry {
  /** Timestamps (ms) of each request inside the current window. */
  timestamps: number[];
}

/**
 * Prune entries whose newest timestamp is older than `maxAgeMs`.
 * Called when the map exceeds `CLEANUP_THRESHOLD` entries.
 */
const CLEANUP_THRESHOLD = 5_000;

function cleanup(store: Map<string, SlidingWindowEntry>, maxAgeMs: number): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (
      entry.timestamps.length === 0 ||
      entry.timestamps[entry.timestamps.length - 1] < now - maxAgeMs
    ) {
      store.delete(key);
    }
  }
}

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * Uses a sliding window: only timestamps within the last `windowMs`
 * milliseconds count towards the limit.
 */
export function checkRateLimit(
  store: Map<string, SlidingWindowEntry>,
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Lazy cleanup
  if (store.size > CLEANUP_THRESHOLD) {
    cleanup(store, config.windowMs);
  }

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Drop timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const resetAt = Math.ceil((now + config.windowMs) / 1000);

  if (entry.timestamps.length >= config.limit) {
    // Blocked — compute retry-after from the oldest timestamp still in window
    const oldestInWindow = entry.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldestInWindow + config.windowMs - now) / 1000);

    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(retryAfterSeconds, 1),
      headers: {
        'X-RateLimit-Limit': String(config.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(resetAt),
        'Retry-After': String(Math.max(retryAfterSeconds, 1)),
      },
    };
  }

  // Allowed — record the request
  entry.timestamps.push(now);
  const remaining = config.limit - entry.timestamps.length;

  return {
    allowed: true,
    limit: config.limit,
    remaining,
    resetAt,
    retryAfterSeconds: 0,
    headers: {
      'X-RateLimit-Limit': String(config.limit),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(resetAt),
    },
  };
}

// ---------------------------------------------------------------------------
// Route-tier helpers
// ---------------------------------------------------------------------------

export interface RateLimitTier {
  /** Matcher function — first match wins. */
  match: (pathname: string) => boolean;
  config: RateLimitConfig;
}

/** Pre-configured tiers, ordered from most to least specific. */
export const RATE_LIMIT_TIERS: RateLimitTier[] = [
  {
    // Auth routes — strict brute-force protection
    match: (p) => p === '/api/auth/login' || p === '/api/auth/register',
    config: { limit: 5, windowMs: 60_000 },
  },
  {
    // Consultant acting
    match: (p) => p.startsWith('/api/consultant/acting'),
    config: { limit: 10, windowMs: 60_000 },
  },
  {
    // General API
    match: (p) => p.startsWith('/api/'),
    config: { limit: 60, windowMs: 60_000 },
  },
  {
    // Public / read routes (catch-all)
    match: () => true,
    config: { limit: 120, windowMs: 60_000 },
  },
];

/**
 * Resolve which rate-limit tier applies for a given pathname.
 * Returns the first matching tier's config.
 */
export function getTierForPath(pathname: string): RateLimitConfig {
  for (const tier of RATE_LIMIT_TIERS) {
    if (tier.match(pathname)) {
      return tier.config;
    }
  }
  // Fallback (should never reach here because the last tier matches all)
  return { limit: 120, windowMs: 60_000 };
}

// ---------------------------------------------------------------------------
// IP extraction helper (Edge-compatible)
// ---------------------------------------------------------------------------

/**
 * Extract client IP from request headers.
 * Vercel sets `x-forwarded-for`; fallback to `x-real-ip`.
 * If nothing is available, fall back to a constant to avoid crashes
 * (every request will share the same bucket — still safer than no limit).
 */
export function getClientIp(request: { headers: { get(name: string): string | null } }): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    // x-forwarded-for can be a comma-separated list; first entry is the client
    return xff.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}
