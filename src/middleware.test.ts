import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockJwtVerify = vi.hoisted(() => vi.fn());

vi.mock('jose', () => ({
  jwtVerify: mockJwtVerify,
}));

// Provide JWT_SECRET so getJwtSecret() doesn't throw
vi.stubEnv('JWT_SECRET', 'test-secret-key-for-vitest');

// ---------------------------------------------------------------------------
// Import the middleware under test (after mocks are set up)
// ---------------------------------------------------------------------------
import { middleware } from './middleware';
import { CSRF_COOKIE_NAME } from '@/utils/csrf';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createRequest(url: string, options?: RequestInit & { cookies?: Record<string, string> }) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options?.method ?? 'GET',
    headers: options?.headers as HeadersInit,
  });
  if (options?.cookies) {
    Object.entries(options.cookies).forEach(([name, value]) => {
      req.cookies.set(name, value);
    });
  }
  return req;
}

const VALID_JWT = 'valid.jwt.token';
const CSRF_TOKEN = 'a'.repeat(64);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJwtVerify.mockResolvedValue({ payload: { sub: 'user-1' } });
  });

  // =========================================================================
  // Auth flow
  // =========================================================================
  describe('Auth flow', () => {
    it('should allow public route /signin without JWT token', async () => {
      const res = await middleware(createRequest('/signin'));
      expect(res.status).not.toBe(307);
      expect(res.headers.get('location')).toBeNull();
    });

    it('should allow public route /signup without JWT token', async () => {
      const res = await middleware(createRequest('/signup'));
      expect(res.status).not.toBe(307);
    });

    it('should allow /api/auth routes without JWT token', async () => {
      const res = await middleware(createRequest('/api/auth/login'));
      expect(res.status).not.toBe(307);
    });

    it('should allow /api/public routes without JWT token', async () => {
      const res = await middleware(createRequest('/api/public/health'));
      expect(res.status).not.toBe(307);
    });

    it('should redirect protected routes to /signin without JWT token', async () => {
      const res = await middleware(createRequest('/dashboard'));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname).toBe('/signin');
    });

    it('should allow protected routes with valid JWT token', async () => {
      const res = await middleware(createRequest('/dashboard', { cookies: { token: VALID_JWT } }));
      expect(res.status).not.toBe(307);
      expect(res.headers.get('location')).toBeNull();
    });

    it('should redirect to /signin when JWT is invalid/expired', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('token expired'));
      const res = await middleware(
        createRequest('/dashboard', { cookies: { token: 'expired.jwt' } }),
      );
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname).toBe('/signin');
    });

    it('should clear the token cookie when JWT is invalid', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('invalid'));
      const res = await middleware(createRequest('/dashboard', { cookies: { token: 'bad.jwt' } }));
      // NextResponse.redirect sets cookies via Set-Cookie header
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('token=');
    });
  });

  // =========================================================================
  // CSRF validation
  // =========================================================================
  describe('CSRF validation', () => {
    it('POST to /api/* should FAIL (403) without x-csrf-token header', async () => {
      const res = await middleware(
        createRequest('/api/carteira/operacao', {
          method: 'POST',
          cookies: { token: VALID_JWT, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
        }),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain('CSRF');
    });

    it('PUT to /api/* should FAIL (403) without x-csrf-token header', async () => {
      const res = await middleware(
        createRequest('/api/carteira/operacao', {
          method: 'PUT',
          cookies: { token: VALID_JWT, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
        }),
      );
      expect(res.status).toBe(403);
    });

    it('DELETE to /api/* should FAIL (403) without x-csrf-token header', async () => {
      const res = await middleware(
        createRequest('/api/carteira/operacao/1', {
          method: 'DELETE',
          cookies: { token: VALID_JWT, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
        }),
      );
      expect(res.status).toBe(403);
    });

    it('PATCH to /api/* should FAIL (403) without x-csrf-token header', async () => {
      const res = await middleware(
        createRequest('/api/carteira/operacao/1', {
          method: 'PATCH',
          cookies: { token: VALID_JWT, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
        }),
      );
      expect(res.status).toBe(403);
    });

    it('POST to /api/* should FAIL (403) with mismatched x-csrf-token', async () => {
      const res = await middleware(
        createRequest('/api/carteira/operacao', {
          method: 'POST',
          headers: { 'x-csrf-token': 'b'.repeat(64) },
          cookies: { token: VALID_JWT, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
        }),
      );
      expect(res.status).toBe(403);
    });

    it('POST to /api/* should PASS with matching x-csrf-token cookie+header', async () => {
      const res = await middleware(
        createRequest('/api/carteira/operacao', {
          method: 'POST',
          headers: { 'x-csrf-token': CSRF_TOKEN },
          cookies: { token: VALID_JWT, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
        }),
      );
      expect(res.status).not.toBe(403);
    });

    it('GET requests should NOT require CSRF token', async () => {
      const res = await middleware(
        createRequest('/api/carteira/operacao', {
          method: 'GET',
          cookies: { token: VALID_JWT },
        }),
      );
      expect(res.status).not.toBe(403);
    });

    it('CSRF-exempt route /api/auth/login should pass POST without CSRF token', async () => {
      const res = await middleware(createRequest('/api/auth/login', { method: 'POST' }));
      expect(res.status).not.toBe(403);
    });

    it('CSRF-exempt route /api/auth/register should pass POST without CSRF token', async () => {
      const res = await middleware(createRequest('/api/auth/register', { method: 'POST' }));
      expect(res.status).not.toBe(403);
    });

    it('CSRF-exempt route /api/public/* should pass POST without CSRF token', async () => {
      const res = await middleware(createRequest('/api/public/something', { method: 'POST' }));
      expect(res.status).not.toBe(403);
    });

    it('CSRF-exempt route /api/institutions should pass POST without CSRF token', async () => {
      const res = await middleware(createRequest('/api/institutions', { method: 'POST' }));
      expect(res.status).not.toBe(403);
    });

    it('should set CSRF cookie on authenticated response when cookie is absent', async () => {
      const res = await middleware(createRequest('/dashboard', { cookies: { token: VALID_JWT } }));
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(CSRF_COOKIE_NAME);
    });

    it('should NOT set CSRF cookie when it already exists', async () => {
      const res = await middleware(
        createRequest('/dashboard', {
          cookies: { token: VALID_JWT, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
        }),
      );
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).not.toContain(CSRF_COOKIE_NAME);
    });
  });

  // =========================================================================
  // Rate limiting
  // =========================================================================
  describe('Rate limiting', () => {
    it('should include X-RateLimit-* headers on API responses', async () => {
      const res = await middleware(createRequest('/api/auth/login'));
      expect(res.headers.get('X-RateLimit-Limit')).toBeDefined();
      expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('should return 429 when rate limit exceeded', async () => {
      // Auth login tier has limit of 5
      const url = '/api/auth/login';
      for (let i = 0; i < 5; i++) {
        await middleware(createRequest(url));
      }
      const res = await middleware(createRequest(url));
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain('requisições');
    });

    it('should include Retry-After header on 429 responses', async () => {
      const url = '/api/auth/login';
      for (let i = 0; i < 5; i++) {
        await middleware(createRequest(url));
      }
      const res = await middleware(createRequest(url));
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeDefined();
      expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Security headers
  // =========================================================================
  describe('Security headers', () => {
    it('should include security headers on public route responses', async () => {
      const res = await middleware(createRequest('/signin'));
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Permissions-Policy')).toBe(
        'geolocation=(), microphone=(), camera=()',
      );
    });

    it('should include security headers on authenticated responses', async () => {
      const res = await middleware(createRequest('/dashboard', { cookies: { token: VALID_JWT } }));
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Permissions-Policy')).toBe(
        'geolocation=(), microphone=(), camera=()',
      );
    });

    it('should include security headers on redirect (unauthenticated) responses', async () => {
      const res = await middleware(createRequest('/dashboard'));
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should include security headers on 403 CSRF error responses', async () => {
      const res = await middleware(
        createRequest('/api/carteira/operacao', {
          method: 'POST',
          cookies: { token: VALID_JWT, [CSRF_COOKIE_NAME]: CSRF_TOKEN },
        }),
      );
      expect(res.status).toBe(403);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should include security headers on 429 rate limit responses', async () => {
      const url = '/api/auth/register';
      for (let i = 0; i < 5; i++) {
        await middleware(createRequest(url));
      }
      const res = await middleware(createRequest(url));
      expect(res.status).toBe(429);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });
});
