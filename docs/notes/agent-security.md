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
