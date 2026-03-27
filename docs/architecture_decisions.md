# Architecture Decisions

> Records why specific technical choices were made. Prevents re-litigating settled decisions.

## ADR-001: JWT Authentication with Cookie Storage

- **Decision:** JWT tokens stored in httpOnly cookies, verified with `jose` in Edge middleware
- **Why:** SSR-compatible, no client-side token exposure. `jose` is edge-compatible (unlike `jsonwebtoken` which requires Node.js crypto).
- **Status:** Active — implemented in Phase 1

## ADR-002: CSRF Double-Submit Cookie Pattern

- **Decision:** CSRF protection via non-httpOnly `csrf-token` cookie + `X-CSRF-Token` header validation
- **Why:** Stateless (no server-side session needed — fits JWT auth model). Client reads cookie via `useCsrf()` hook, attaches to state-changing requests. Middleware validates on POST/PUT/DELETE/PATCH.
- **Exempt routes:** `/api/auth/login`, `/api/auth/register`, all public API routes
- **Status:** Active — implemented in Phase 1

## ADR-003: React Context for State Management

- **Decision:** 4 React Contexts (Auth, Theme, Sidebar, CarteiraResumo) + custom hooks
- **Why:** Lightweight, no external dependency
- **Status:** Active — candidate for React Query migration (Phase 4)

## ADR-004: Prisma ORM with PostgreSQL

- **Decision:** Prisma for type-safe DB access, Neon for hosted PostgreSQL
- **Why:** TypeScript-native, migration management, serverless-friendly
- **Status:** Active — Neon to be replaced with RDS in sa-east-1 (Phase 5)

## ADR-005: ESLint `_` Prefix Convention for Unused Vars

- **Decision:** Variables prefixed with `_` are allowed to be unused (`argsIgnorePattern`/`varsIgnorePattern` in ESLint config)
- **Why:** Necessary for destructuring patterns where some fields must be captured but aren't used (e.g., `{ objetivo: _objetivo, ...rest }` in portfolio routes)
- **Status:** Active

## ADR-006: CI/CD with GitHub Actions + Husky

- **Decision:** GitHub Actions for CI (type-check, lint, test, build). Husky + lint-staged for pre-commit (eslint --fix + prettier).
- **Why:** Prevents shipping lint errors and failing tests. Concurrency groups cancel stale PR runs.
- **Required secrets:** `DATABASE_URL`, `JWT_SECRET`, `BRAPI_API_KEY` in GitHub repo settings
- **Status:** Active — implemented in Phase 1

---

_Last updated: 2026-03-27_
