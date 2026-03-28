import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { generateCsrfToken, validateCsrfToken, CSRF_COOKIE_NAME } from '@/utils/csrf';
import { checkRateLimit, getClientIp, getTierForPath } from '@/lib/rateLimit';

// ---------------------------------------------------------------------------
// Rate-limit store — lives in isolate memory, resets on cold start.
// Each Edge isolate has its own store (acceptable for first iteration).
// ---------------------------------------------------------------------------
const rateLimitStore = new Map<string, { timestamps: number[] }>();

const PUBLIC_FILE = /\.(.*)$/;

/** Encode the JWT secret once as a Uint8Array for jose. */
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

/** Routes that skip authentication entirely. */
function isPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/api/institutions') ||
    pathname.startsWith('/api/assets') ||
    pathname.startsWith('/api/emissores') ||
    pathname === '/signin' ||
    pathname === '/signup' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/public') ||
    pathname.startsWith('/test') ||
    PUBLIC_FILE.test(pathname)
  );
}

/** API routes exempt from CSRF checks (no auth token yet). */
function isCsrfExempt(pathname: string): boolean {
  return (
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/register') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/api/institutions') ||
    pathname.startsWith('/api/assets') ||
    pathname.startsWith('/api/emissores')
  );
}

/** HTTP methods that change state and therefore require CSRF. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/** Apply rate-limit headers from a check result to a response. */
function applyRateLimitHeaders(
  response: NextResponse,
  headers: Record<string, string> | null,
): void {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
}

/** Apply security headers to a response. */
function setSecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Rate limiting (runs before auth so brute-force is blocked early) ---
  let rateLimitHeaders: Record<string, string> | null = null;

  if (pathname.startsWith('/api/')) {
    const clientIp = getClientIp(request);
    const tierConfig = getTierForPath(pathname);
    // Group by route prefix (up to 4 segments) so /api/auth/login and
    // /api/auth/register each get their own bucket.
    const key = `${clientIp}:${pathname.split('/').slice(0, 4).join('/')}`;
    const result = checkRateLimit(rateLimitStore, key, tierConfig);

    if (!result.allowed) {
      const response = NextResponse.json(
        {
          error: `Muitas requisições. Tente novamente em ${result.retryAfterSeconds} segundos.`,
        },
        { status: 429 },
      );
      applyRateLimitHeaders(response, result.headers);
      setSecurityHeaders(response);
      return response;
    }

    rateLimitHeaders = result.headers;
  }

  // --- Public routes: allow through without auth ---
  if (isPublicRoute(pathname)) {
    const response = NextResponse.next();
    setSecurityHeaders(response);
    applyRateLimitHeaders(response, rateLimitHeaders);
    return response;
  }

  // --- JWT verification ---
  const tokenCookie = request.cookies.get('token');
  if (!tokenCookie?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    const response = NextResponse.redirect(url);
    setSecurityHeaders(response);
    return response;
  }

  try {
    await jwtVerify(tokenCookie.value, getJwtSecret());
  } catch {
    // Token is invalid or expired — clear it and redirect
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    const response = NextResponse.redirect(url);
    response.cookies.delete('token');
    setSecurityHeaders(response);
    return response;
  }

  // --- CSRF validation for state-changing API requests ---
  if (
    pathname.startsWith('/api/') &&
    STATE_CHANGING_METHODS.has(request.method) &&
    !isCsrfExempt(pathname)
  ) {
    if (!validateCsrfToken(request)) {
      const response = NextResponse.json(
        { error: 'CSRF token missing or invalid' },
        { status: 403 },
      );
      setSecurityHeaders(response);
      return response;
    }
  }

  // --- Ensure CSRF cookie is set (for all authenticated responses) ---
  const response = NextResponse.next();
  setSecurityHeaders(response);
  applyRateLimitHeaders(response, rateLimitHeaders);
  if (!request.cookies.get(CSRF_COOKIE_NAME)) {
    response.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
      httpOnly: false, // JS must be able to read it
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|public|favicon.ico|signin|signup|test).*)'],
};
