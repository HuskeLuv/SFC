import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit, getTierForPath, getClientIp, RateLimitConfig } from '../rateLimit';

describe('checkRateLimit', () => {
  let store: Map<string, { timestamps: number[] }>;
  const config: RateLimitConfig = { limit: 3, windowMs: 10_000 };

  beforeEach(() => {
    store = new Map();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests within the limit', () => {
    const r1 = checkRateLimit(store, 'ip1:/api/test', config);
    const r2 = checkRateLimit(store, 'ip1:/api/test', config);
    const r3 = checkRateLimit(store, 'ip1:/api/test', config);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('should deny requests exceeding the limit', () => {
    checkRateLimit(store, 'ip1:/api/test', config);
    checkRateLimit(store, 'ip1:/api/test', config);
    checkRateLimit(store, 'ip1:/api/test', config);

    const result = checkRateLimit(store, 'ip1:/api/test', config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset after the window expires', () => {
    checkRateLimit(store, 'ip1:/api/test', config);
    checkRateLimit(store, 'ip1:/api/test', config);
    checkRateLimit(store, 'ip1:/api/test', config);

    // Advance past the window
    vi.advanceTimersByTime(11_000);

    const result = checkRateLimit(store, 'ip1:/api/test', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('should track different IPs separately', () => {
    checkRateLimit(store, 'ip1:/api/test', config);
    checkRateLimit(store, 'ip1:/api/test', config);
    checkRateLimit(store, 'ip1:/api/test', config);

    // ip1 is now exhausted, but ip2 should still be allowed
    const result = checkRateLimit(store, 'ip2:/api/test', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('should return correct headers when allowed', () => {
    const result = checkRateLimit(store, 'ip1:/api/test', config);
    expect(result.headers['X-RateLimit-Limit']).toBe('3');
    expect(result.headers['X-RateLimit-Remaining']).toBe('2');
    expect(result.headers['X-RateLimit-Reset']).toBeDefined();
    expect(result.headers['Retry-After']).toBeUndefined();
  });

  it('should return Retry-After header when blocked', () => {
    checkRateLimit(store, 'ip1:/api/test', config);
    checkRateLimit(store, 'ip1:/api/test', config);
    checkRateLimit(store, 'ip1:/api/test', config);

    const result = checkRateLimit(store, 'ip1:/api/test', config);
    expect(result.allowed).toBe(false);
    expect(result.headers['Retry-After']).toBeDefined();
    expect(Number(result.headers['Retry-After'])).toBeGreaterThanOrEqual(1);
  });
});

describe('getTierForPath', () => {
  it('should return strict config for /api/auth/login', () => {
    const config = getTierForPath('/api/auth/login');
    expect(config.limit).toBe(5);
    expect(config.windowMs).toBe(60_000);
  });

  it('should return strict config for /api/auth/register', () => {
    const config = getTierForPath('/api/auth/register');
    expect(config.limit).toBe(5);
  });

  it('should return consultant config for /api/consultant/acting paths', () => {
    const config = getTierForPath('/api/consultant/acting/123');
    expect(config.limit).toBe(10);
  });

  it('should return general API config for other /api/ paths', () => {
    const config = getTierForPath('/api/carteira/operacao');
    expect(config.limit).toBe(60);
  });

  it('should return catch-all config for non-API paths', () => {
    const config = getTierForPath('/dashboard');
    expect(config.limit).toBe(120);
  });
});

describe('getClientIp', () => {
  it('should extract IP from x-forwarded-for header', () => {
    const req = {
      headers: { get: (name: string) => (name === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : null) },
    };
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('should extract single IP from x-forwarded-for', () => {
    const req = {
      headers: { get: (name: string) => (name === 'x-forwarded-for' ? '10.0.0.1' : null) },
    };
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('should fall back to x-real-ip', () => {
    const req = {
      headers: { get: (name: string) => (name === 'x-real-ip' ? '9.8.7.6' : null) },
    };
    expect(getClientIp(req)).toBe('9.8.7.6');
  });

  it('should return "unknown" when no IP headers are present', () => {
    const req = { headers: { get: () => null } };
    expect(getClientIp(req)).toBe('unknown');
  });
});
