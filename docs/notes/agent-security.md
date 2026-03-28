# Agent: security

## Changes Made

- `src/middleware.ts` — Rewrote to verify JWT signatures using `jose` (edge-compatible) instead of just checking cookie existence. Added CSRF double-submit cookie validation for state-changing API requests. Sets CSRF cookie on authenticated responses when not already present.
- `src/utils/csrf.ts` — New utility with `generateCsrfToken()` (Web Crypto API random hex), `validateCsrfToken(request)` (constant-time comparison of header vs cookie), and exported constants for cookie/header names.
- `src/hooks/useCsrf.ts` — New React hook providing `csrfFetch()` wrapper that automatically reads the CSRF cookie and attaches it as `X-CSRF-Token` header on POST/PUT/DELETE/PATCH requests. Also exports `getCsrfToken()` for manual use.
- `package.json` — Added `jose` ^6.0.11 dependency.

## Architecture Decisions

- **jose over manual Web Crypto**: `jose` is the standard edge-compatible JWT library, well-maintained, and avoids reimplementing signature verification. The `jsonwebtoken` package remains for API route handlers (Node.js runtime) where it already works.
- **Double-submit cookie over synchronizer token pattern**: The synchronizer pattern requires server-side session state, which this app does not have (it's stateless JWT auth). Double-submit works purely with cookies and headers — no server state needed. The CSRF cookie is non-httpOnly so JS can read it, while the auth token cookie remains httpOnly.
- **CSRF exempt routes**: `/api/auth/login` and `/api/auth/register` are exempt because the user has no CSRF cookie yet at that point. Public API routes (institutions, assets, emissores) are also exempt since they require no auth.
- **Constant-time comparison**: `validateCsrfToken` uses bitwise XOR comparison to prevent timing side-channel attacks.

## How CSRF Works

1. When an authenticated user first visits a page, the middleware generates a random 32-byte hex token and sets it as the `csrf-token` cookie (non-httpOnly, SameSite=Lax).
2. Client-side code reads this cookie via `useCsrf()` hook or `getCsrfToken()`.
3. On state-changing requests (POST, PUT, DELETE, PATCH), the client includes the token in the `X-CSRF-Token` header.
4. The middleware validates that the header value matches the cookie value.
5. A cross-site attacker cannot read the cookie value (same-origin policy), so they cannot forge the header, even though the browser will automatically send the cookie.

## Issues Found

- The previous middleware only checked for cookie existence — a trivially forgeable `token=anything` cookie would bypass it.
- The middleware matcher config already excludes some public routes, but `isPublicRoute()` also checks them for defense in depth (some routes like `/api/institutions` pass through the matcher but should still be public).
- No existing tests were found in the project (`src/**/*.test.ts` and `src/**/*.test.tsx` returned no results), so no test updates were needed.
- **Action required**: Run `npm install` to install the `jose` dependency before building.

## Security Headers (added 2026-03-28)

The Edge middleware (`src/middleware.ts`) now sets security headers on ALL responses (public routes, redirects, CSRF errors, and authenticated pass-through). Headers added:

- `X-Content-Type-Options: nosniff` — Prevents MIME-type sniffing. Also present in `next.config.ts` headers; reinforced in middleware for defense in depth (covers edge responses that bypass Next.js static headers).
- `X-Frame-Options: DENY` — Prevents the site from being embedded in iframes (clickjacking protection). Also in `next.config.ts`; reinforced in middleware.
- `Referrer-Policy: strict-origin-when-cross-origin` — Limits referrer information sent to external origins. Only set in middleware (not in `next.config.ts`).
- `Permissions-Policy: geolocation=(), microphone=(), camera=()` — Disables access to sensitive browser APIs the application does not need. Only set in middleware (not in `next.config.ts`).

## Rate Limiting (added 2026-03-28)

In-memory sliding-window rate limiter applied in Edge middleware before authentication, so brute-force attempts are blocked before any JWT verification occurs.

### Implementation

- **Utility:** `src/lib/rateLimit.ts` — Edge-compatible (Web APIs only), no external dependencies.
- **Store:** Module-level `Map<string, { timestamps: number[] }>` in `src/middleware.ts`. Each entry tracks request timestamps within the sliding window.
- **Key format:** `{clientIP}:{routePrefix}` — the route prefix is the first 4 path segments (e.g., `/api/auth/login`), so each route pattern gets its own bucket per IP.
- **IP extraction:** `x-forwarded-for` (first entry) > `x-real-ip` > `"unknown"` fallback.
- **Cleanup:** Expired entries are lazily pruned when the map exceeds 5,000 entries.

### Tiers

| Route pattern                           | Limit   | Window |
| --------------------------------------- | ------- | ------ |
| `/api/auth/login`, `/api/auth/register` | 5 req   | 1 min  |
| `/api/consultant/acting`                | 10 req  | 1 min  |
| `/api/*` (general)                      | 60 req  | 1 min  |
| All other routes                        | 120 req | 1 min  |

### Response headers

All API responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. Blocked requests (HTTP 429) additionally include `Retry-After`.

### Middleware matcher change

The matcher was updated from `/((?!api/auth|api/public|_next|public|favicon.ico|signin|signup|test).*)` to `/((?!_next|public|favicon.ico|signin|signup|test).*)` so that `/api/auth/*` and `/api/public/*` routes now pass through the middleware and receive rate limiting. The existing `isPublicRoute()` function continues to skip authentication for these routes.

### Known limitations

- **Cold start reset:** The in-memory store is lost when the Edge isolate is recycled. This means limits reset on cold starts.
- **Per-isolate:** Each Vercel Edge isolate has its own store, so limits are not globally coordinated across isolates.
- **Upgrade path:** Replace the `Map` store with Redis (Upstash or ElastiCache) when migrating to AWS (see ADR-007).

## Consultant Impersonation — Opaque Token Approach (added 2026-03-28)

Previously, the `consultant-acting` cookie stored the raw `clientId` (UUID). An attacker who guessed or leaked a client UUID could forge the cookie to impersonate any client. The cookie TTL was also 2 hours, which was unnecessarily long.

### Changes

- **Opaque session token:** The cookie now contains a random UUID (`crypto.randomUUID()`) that maps to a server-side `ImpersonationSession` record. The raw `clientId` is never exposed in the cookie.
- **Server-side session table:** New Prisma model `ImpersonationSession` (`impersonation_sessions`) stores `sessionToken`, `consultantId`, `clientId`, `createdAt`, `expiresAt`, and `endedAt`.
- **Reduced TTL:** Cookie `maxAge` reduced from 7200s (2h) to 1800s (30min).
- **Session lifecycle tracking:** `START_IMPERSONATION` and `END_IMPERSONATION` logs now include the `sessionToken`. The `ConsultantImpersonationLog` table has a new optional `sessionToken` column for correlation.
- **Explicit session end:** `DELETE /api/consultant/acting` marks the session as ended (`endedAt` timestamp) in addition to clearing the cookie.
- **Active sessions endpoint:** `GET /api/consultant/active-sessions` returns all non-expired, non-ended sessions for the authenticated consultant, enabling audit of concurrent impersonations.

### Resolution flow

1. `resolveActingContext()` reads the opaque token from the cookie.
2. Looks up `ImpersonationSession` by `sessionToken`.
3. Rejects if session is ended (`endedAt` set) or expired (`expiresAt < now`).
4. Extracts `clientId` and verifies consultant-client relationship via `ClientConsultant`.
5. Returns the acting context with client info.

### Files modified

- `prisma/schema.prisma` — Added `ImpersonationSession` model and `sessionToken` field to `ConsultantImpersonationLog`.
- `src/pages/api/consultant/acting.ts` — Generates opaque token, creates session, stores token in cookie.
- `src/pages/api/consultant/active-sessions.ts` — New endpoint for listing active sessions.
- `src/utils/consultantActing.ts` — `resolveActingContext()` resolves opaque token via DB lookup.
- `src/services/impersonationLogger.ts` — Accepts optional `sessionToken` param, resolves tokens in `isConsultantImpersonating()`.
