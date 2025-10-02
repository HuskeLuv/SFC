import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Allow public and auth pages
  if (
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
  ) {
    return NextResponse.next();
  }
  const token = request.cookies.get('token');
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|api/public|_next|public|favicon.ico|signin|signup|test).*)'],
}; 