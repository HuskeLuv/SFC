import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { generateCsrfToken, validateCsrfToken, CSRF_COOKIE_NAME } from '@/utils/csrf';

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Public routes: allow through without auth ---
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // --- JWT verification ---
  const tokenCookie = request.cookies.get('token');
  if (!tokenCookie?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    return NextResponse.redirect(url);
  }

  try {
    await jwtVerify(tokenCookie.value, getJwtSecret());
  } catch {
    // Token is invalid or expired — clear it and redirect
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    const response = NextResponse.redirect(url);
    response.cookies.delete('token');
    return response;
  }

  // --- CSRF validation for state-changing API requests ---
  if (
    pathname.startsWith('/api/') &&
    STATE_CHANGING_METHODS.has(request.method) &&
    !isCsrfExempt(pathname)
  ) {
    if (!validateCsrfToken(request)) {
      return NextResponse.json({ error: 'CSRF token missing or invalid' }, { status: 403 });
    }
  }

  // --- Ensure CSRF cookie is set (for all authenticated responses) ---
  const response = NextResponse.next();
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
  matcher: ['/((?!api/auth|api/public|_next|public|favicon.ico|signin|signup|test).*)'],
};
