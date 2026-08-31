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
    // /api/assets NÃO é público: a tabela Asset também guarda ativos manuais
    // nomeados pelos usuários (auditoria 29/08/2026, achado 1.1).
    pathname.startsWith('/api/emissores') ||
    // Vercel Cron requests carry no JWT cookie — the route itself authenticates
    // via Authorization: Bearer CRON_SECRET, so let them pass the JWT gate.
    pathname.startsWith('/api/cron') ||
    pathname === '/api/health' ||
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

/**
 * Content Security Policy (LGPD ATENÇÃO).
 *
 * Diretivas:
 *  - default-src 'self': bloqueia tudo que não seja do próprio domínio.
 *  - script-src: 'self' + nonce por request + 'strict-dynamic' (scripts
 *    inline do Next.js recebem o nonce; chunks e scripts criados por eles
 *    herdam a confiança) + 'unsafe-eval' (ApexCharts usa Function construtor).
 *  - style-src 'self' + 'unsafe-inline': TailAdmin + flatpickr injetam
 *    estilos inline.
 *  - img-src: 'self' + data: (QR codes/avatars base64) + https: (logos
 *    externos eventuais).
 *  - connect-src: 'self' (todas APIs do app são same-origin).
 *  - frame-ancestors 'none': mesmo papel que X-Frame-Options=DENY pra
 *    browsers modernos.
 *  - form-action 'self': forms só submetem pro próprio domínio.
 *  - base-uri 'self': proteção contra base tag injection.
 *  - upgrade-insecure-requests: força HTTPS em recursos opcionais.
 */
// Área Educacional (ticket 21/08/2026): os vídeos dos cursos são hospedados na
// VTurb (ConverteAI) — o embed JS injeta scripts de *.converteai.net e o player
// carrega mídia HLS via XHR/blob. Verificado com embed real (25/08/2026): além
// de *.converteai.net (scripts, m3u8, segmentos, thumbnails) o player consulta
// license.vturb.com (checagem de licença — sem ela o player loga erro), a.vturb.com
// (analytics) e vt-h-*.b-cdn.net (CDN auxiliar). sentry.io (telemetria de erro da
// VTurb) fica bloqueado de propósito. Se um vídeo novo falhar, conferir no
// console qual host faltou e adicioná-lo aqui.
const VTURB_HOSTS = 'https://*.converteai.net https://*.vturb.com https://*.b-cdn.net';
// Scripts só de converteai/vturb — *.b-cdn.net é CDN compartilhado (qualquer
// cliente Bunny hospeda lá) e fica apenas em connect/media (auditoria 29/08/2026).
const VTURB_SCRIPT_HOSTS = 'https://*.converteai.net https://*.vturb.com';

/**
 * Nonce por request (auditoria 29/08/2026, achado 5.2): `script-src` deixa de
 * usar 'unsafe-inline'. O Next.js lê o nonce do header Content-Security-Policy
 * do REQUEST e o aplica nos próprios scripts inline de hidratação; 'strict-dynamic'
 * estende a confiança aos chunks carregados por eles e aos scripts que o
 * VturbPlayer cria via createElement. 'unsafe-eval' permanece por causa do
 * ApexCharts (Function construtor).
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' ${VTURB_SCRIPT_HOSTS}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${VTURB_HOSTS}`,
    `media-src 'self' blob: ${VTURB_HOSTS}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * Cria a resposta "passa adiante" propagando nonce + CSP nos headers do
 * request, que é de onde o Next.js os lê ao renderizar.
 */
function nextWithNonce(request: NextRequest, nonce: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/** Apply security headers to a response. */
function setSecurityHeaders(
  response: NextResponse,
  request: NextRequest,
  nonce: string = generateNonce(),
): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // LGPD ATENÇÃO: CSP (nonce por request) + HSTS.
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));
  // HSTS apenas em produção — em dev local sobre HTTP, o browser
  // memoriza preload e impede acesso futuro via HTTP.
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // Prevent Safari/macOS from serving stale pages and API responses from disk cache
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/_next/static')) {
    response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    response.headers.set('Vary', 'Cookie');
  }
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
      setSecurityHeaders(response, request);
      return response;
    }

    rateLimitHeaders = result.headers;
  }

  // --- Public routes: allow through without auth ---
  if (isPublicRoute(pathname)) {
    const nonce = generateNonce();
    const response = nextWithNonce(request, nonce);
    setSecurityHeaders(response, request, nonce);
    applyRateLimitHeaders(response, rateLimitHeaders);
    return response;
  }

  // --- JWT verification ---
  const tokenCookie = request.cookies.get('token');
  if (!tokenCookie?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    const response = NextResponse.redirect(url);
    setSecurityHeaders(response, request);
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
    setSecurityHeaders(response, request);
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
      setSecurityHeaders(response, request);
      return response;
    }
  }

  // --- Ensure CSRF cookie is set (for all authenticated responses) ---
  const nonce = generateNonce();
  const response = nextWithNonce(request, nonce);
  setSecurityHeaders(response, request, nonce);
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
  matcher: [
    // Páginas legais (políticas, termos, subprocessadores) acessíveis sem
    // login — usuário precisa lê-las antes de aceitar/cadastrar (LGPD #1).
    '/((?!_next|public|favicon.ico|signin|signup|test|politica-de-privacidade|termos-de-uso|subprocessadores).*)',
  ],
};
