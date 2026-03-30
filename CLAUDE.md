# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SFC is a Brazilian financial management platform (Next.js 15, React 19, TypeScript, Prisma 6, PostgreSQL). It targets ~1,000 DAU with B3/Bacen market integrations. Deployed on Vercel (São Paulo region).

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (runs ESLint + TypeScript checks)
npm run lint         # ESLint
npm run type-check   # TypeScript strict check (tsc --noEmit)
npm test             # Run all tests (vitest run)
npx vitest run src/app/api/carteira/operacao  # Run tests for a specific route
npx vitest --watch   # Watch mode
npm run seed         # Seed database (npx tsx prisma/seed.ts)
npx prisma migrate dev   # Run migrations
npx prisma generate      # Regenerate Prisma client
```

## Architecture

**Next.js 15 App Router** with server components by default. Client components use `"use client"` directive.

- `src/app/` — Pages and 81 API routes organized by feature
- `src/components/<feature>/` — UI components grouped by domain
- `src/hooks/use<Name>.ts` — 24 custom hooks wrapping fetch with dedup guards
- `src/services/` — Business logic (BRAPI market data, portfolio snapshots, dividends)
- `src/context/` — 4 React Contexts (Auth, Theme, Sidebar, CarteiraResumo) — no Redux/Zustand
- `src/lib/prisma.ts` — PrismaClient singleton
- `src/middleware.ts` — Edge middleware for JWT verification (jose) + CSRF validation

**Auth flow:** JWT in httpOnly cookies. Edge middleware verifies via `jose.jwtVerify()`. Server-side token generation uses `jsonwebtoken`. CSRF uses double-submit cookie pattern — state-changing requests must use `csrfFetch()` from `useCsrf()` hook.

**Consultant impersonation:** Consultants can act on behalf of clients. Use `requireAuthWithActing()` from `src/utils/auth.ts` which returns `{ payload, targetUserId, actingClient }`. All impersonation is logged.

**Data fetching in hooks:** Hooks use `useRef` guards (`isFetchingRef`, `hasFetchedRef`) to prevent duplicate fetches. Always include `credentials: 'include'` for cookie auth.

**Database:** 40+ Prisma models. Portfolio supports stocks, ETFs, FIIs, crypto, fixed income, real estate all consolidated in a single Asset table. Cashflow uses hierarchical groups with templates + personalization.

## Code Conventions

- **Path alias:** `@/*` → `./src/*`
- **Formatting:** Prettier — semi, singleQuote, trailingComma all, printWidth 100, tabWidth 2
- **Unused vars:** Prefix with `_` (ESLint configured)
- **Error handling:** `catch {}` or `catch (error: unknown)` with `instanceof Error` guard
- **Language mix:** Routes and domain terms use Portuguese; code structure uses English

## Quality Gates

Pre-commit (Husky): lint-staged runs `eslint --fix` + `prettier --write` on staged files.
CI (GitHub Actions on PR to main): type-check → lint → test → build. All must pass.
Both `ignoreBuildErrors` and `ignoreDuringBuilds` are `false` — lint and type errors fail the build.

## Testing

Vitest 1.6 with v8 coverage (88 test files, 699 tests). Tests live in `__tests__/` directories next to the module they test. Coverage threshold: 50% statements on `src/app/api/carteira/{operacao,aporte,resgate}/**/*.ts` plus `src/services/**/*.ts` and `src/hooks/**/*.ts`.

Test pattern: mock Prisma via `vi.hoisted()`, mock `requireAuthWithActing` from `@/utils/auth`, mock `@/lib/prisma`. Test the exported route handler (POST, GET, etc.) with `NextRequest`.

Test infrastructure in `src/test/`: `setup.ts` (jest-dom matchers), `wrappers.tsx` (React Query test wrapper via `renderHookWithClient`), `mocks/prisma.ts` (reusable `createMockPrisma()` factory), `mocks/auth.ts` (`mockAuthAsUser`/`mockAuthAsConsultant`), `mocks/fetch.ts` (`mockFetchResponse`/`stubFetch`). Hook tests use `// @vitest-environment jsdom` directive.

## Environment Variables Required

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing key
- `BRAPI_API_KEY` — BRAPI market data API key

---

## Work Plan — Issues, Improvements & Refactoring

> Organized by phase. Each task has a status: `[ ]` pending, `[~]` in progress, `[x]` done.
> Last updated: 2026-03-30 (Phase 6 added)

### Phase 1 — Security & Critical Fixes

| #   | Task                                                                                                                                                                                 | Priority | Files/Scope                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1.1 | [x] **Rotate exposed secrets** — JWT_SECRET, DATABASE_URL, BRAPI_API_KEY were committed to git. Rotate all credentials and scrub from history (BFG or git filter-repo)               | CRITICAL | `.env`, git history                                                                                                            |
| 1.2 | [x] **Add input validation with zod** — Most API routes accept unvalidated JSON bodies. Add zod schemas for all POST/PUT/PATCH/DELETE endpoints                                      | HIGH     | `src/app/api/**/*.ts`, `src/pages/api/**/*.ts`                                                                                 |
| 1.3 | [x] **Wrap JSON.parse calls in try-catch** — Several routes parse `notes` field without error handling, causing crashes on malformed data                                            | HIGH     | `src/app/api/carteira/resgate/route.ts`, `src/app/api/carteira/renda-fixa/route.ts`, `src/app/api/carteira/operacoes/route.ts` |
| 1.4 | [x] **Add rate limiting** — No rate limiting on login, register, or any endpoint. Add rate limiting middleware (e.g. Upstash ratelimit) starting with auth routes                    | HIGH     | `src/middleware.ts`, `src/app/api/auth/**`                                                                                     |
| 1.5 | [x] **Strengthen consultant impersonation** — Cookie stores raw clientId without encryption, 2h expiration is too long. Use opaque tokens, reduce TTL to 30min, add session tracking | HIGH     | `src/pages/api/consultant/acting.ts`, `src/utils/consultantActing.ts`                                                          |
| 1.6 | [x] **Add security headers** — Missing X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy in middleware responses                                                             | MEDIUM   | `src/middleware.ts`                                                                                                            |

### Phase 2 — Code Deduplication & Architecture

| #   | Task                                                                                                                                                                                                                                                                                                                         | Priority | Files/Scope                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | [x] **Extract generic `useAssetData<T>` hook** — 9 asset hooks (useAcoes, useFii, useEtf, useReit, useFimFia, useOpcoes, useMoedasCriptos, usePrevidenciaSeguros, useStocks) are near-identical (~354 lines each, ~3,200 lines total). Extract shared fetch, formatting, calculation, and mutation logic into a generic hook | CRITICAL | `src/hooks/useAcoes.ts`, `useFii.ts`, `useEtf.ts`, `useReit.ts`, `useFimFia.ts`, `useOpcoes.ts`, `useMoedasCriptos.ts`, `usePrevidenciaSeguros.ts`, `useStocks.ts`                                                                     |
| 2.2 | [x] **Extract generic `<AssetTable>` component** — 9 table components (AcoesTable, FiiTable, EtfTable, etc.) duplicate ~3,400 lines of table rendering, sorting, filtering, expansion, cell editing. Create a generic component accepting column definitions and data types                                                  | HIGH     | `src/components/carteira/*Table.tsx` (9 files)                                                                                                                                                                                         |
| 2.3 | [x] **Consolidate duplicate types** — Asset type definitions (acoes.ts, fii.ts, etf.ts, reit.ts, etc.) share 90% of fields. Create `BaseAtivo`, `BaseSecao`, `BaseResumo` base interfaces, extend per asset type                                                                                                             | HIGH     | `src/types/acoes.ts`, `fii.ts`, `etf.ts`, `reit.ts`, `fimFia.ts`, `opcoes.ts`, `moedas-criptos.ts`, `previdencia-seguros.ts`                                                                                                           |
| 2.4 | [x] **Migrate remaining Pages Router APIs to App Router** — 5 legacy routes still use Pages Router with different auth/error patterns                                                                                                                                                                                        | HIGH     | `src/pages/api/notifications/index.ts`, `src/pages/api/consultant/[...params].ts`, `src/pages/api/consultant/acting.ts`, `src/pages/api/consultant/invitations/index.ts`, `src/pages/api/consultant/invitations/[inviteId]/respond.ts` |
| 2.5 | [x] **Standardize API error handling** — Routes use 3+ different error handling patterns and mixed English/Portuguese messages. Create a shared error handler wrapper and standardized error response format                                                                                                                 | MEDIUM   | All 86 API routes                                                                                                                                                                                                                      |
| 2.6 | [x] **Split mega-components** — Step4AssetInfo.tsx (2,004 lines), DataTableTwo.tsx (1,576 lines), Step3Asset.tsx (948 lines) need to be broken into smaller focused components (<300 lines each)                                                                                                                             | MEDIUM   | `src/components/carteira/wizard/Step4AssetInfo.tsx`, `src/components/tables/DataTables/TableTwo/DataTableTwo.tsx`, `src/components/carteira/wizard/Step3Asset.tsx`                                                                     |

### Phase 3 — Performance & Optimization

| #   | Task                                                                                                                                                                                                                           | Priority | Files/Scope                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| 3.1 | [x] **Fix N+1 queries — parallelize sequential DB fetches** — `carteira-historico` route fetches asset history in a sequential for-loop. `analises/indices` route fetches benchmark data sequentially. Convert to Promise.all  | HIGH     | `src/app/api/analises/carteira-historico/route.ts`, `src/app/api/analises/indices/route.ts` |
| 3.2 | [x] **Fix AuthContext cascading re-renders** — Provider value object recreated every render, unnecessary setState calls when value doesn't change. Wrap value in useMemo, fix redundant null assignments                       | HIGH     | `src/context/AuthContext.tsx`                                                               |
| 3.3 | [x] **Add missing Prisma indexes** — Notification.userId, ConsultantInvite.invitedUserId, Portfolio.userId lack explicit indexes                                                                                               | MEDIUM   | `prisma/schema.prisma`                                                                      |
| 3.4 | [x] **Lazy-load heavy libraries** — FullCalendar, Swiper, react-spreadsheet are statically imported. Wrap with `next/dynamic` and `ssr: false`                                                                                 | MEDIUM   | Components importing these libraries                                                        |
| 3.5 | [x] **Audit client vs server components** — Audited 168 client components. Converted 7 to server components, fixed 4 pages with broken `dynamic`+`ssr:false` in server context. 161 must remain client (hooks/handlers/charts) | MEDIUM   | `src/components/` (168 client components audited)                                           |
| 3.6 | [x] **Fix memory leaks in hooks** — Missing AbortController cleanup for in-flight fetches on unmount. useAcoes uses `JSON.parse(JSON.stringify())` for deep clone instead of `structuredClone()`                               | MEDIUM   | `src/hooks/useAcoes.ts` and similar hooks                                                   |
| 3.7 | [x] **Optimize next.config.ts** — Add framer-motion to optimizePackageImports, configure image optimization (avif/webp), disable production source maps                                                                        | LOW      | `next.config.ts`                                                                            |

### Phase 4 — Testing & Reliability

| #   | Task                                                                                                                                                                     | Priority | Files/Scope                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------- |
| 4.1 | [x] **Expand API route test coverage** — Only 6 of 86 routes have tests (7%). Priority targets: auth routes, cashflow, stocks, consultant endpoints                      | HIGH     | `src/app/api/auth/**`, `src/app/api/cashflow/**`, `src/app/api/stocks/**` |
| 4.2 | [x] **Add React Error Boundaries** — No error boundaries exist. Add at layout level and around chart/dynamic components to prevent full-page crashes                     | MEDIUM   | `src/app/layout.tsx`, chart wrapper components                            |
| 4.3 | [x] **Add loading states and skeletons** — Page components render child components directly without loading/error UI. Add Suspense boundaries with skeleton fallbacks    | MEDIUM   | `src/app/(admin)/` page components                                        |
| 4.4 | [x] **Add pagination to table API endpoints** — Opt-in offset pagination (page/limit params) on transactions, watchlist, invitations, investimento. Backwards compatible | MEDIUM   | `src/utils/pagination.ts`, 4 API routes                                   |

### Phase 5 — Data Layer & Future Architecture

| #   | Task                                                                                                                                                                                                                                                             | Priority | Files/Scope                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| 5.1 | [x] **Evaluate React Query (TanStack Query) migration** — Replace custom fetch hooks with React Query for caching, deduplication, optimistic updates, retry logic. Would eliminate most of the custom hook complexity (see ADR-003)                              | HIGH     | `src/hooks/`, `src/context/CarteiraResumoContext.tsx` |
| 5.2 | [x] **Consolidate services by domain** — 15 service files with overlapping concerns. Group into domains: `services/pricing/` (brapiQuote + brapiSync + assetPriceService), `services/portfolio/` (snapshots + series), `services/market/` (indicators + indexes) | MEDIUM   | `src/services/`                                       |
| 5.3 | [ ] **Plan Neon → AWS RDS migration** — Database is on Neon, planned move to RDS sa-east-1 (see ADR-004). Define migration strategy, connection pooling, and failover                                                                                            | LOW      | Infrastructure, `prisma/schema.prisma`                |

### Phase 6 — Test Coverage Expansion

| #   | Task                                                                                                                                                                                                         | Priority | Files/Scope                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | [x] **Test infrastructure** — Install RTL, jest-dom, jsdom. Create reusable mocks (`src/test/mocks/`), QueryClient wrapper (`src/test/wrappers.tsx`), setup file. Expand vitest coverage to services + hooks | HIGH     | `vitest.config.ts`, `src/test/`                                                                                              |
| 6.2 | [x] **Service layer tests** — 102 tests covering patrimonioHistoricoBuilder (46), assetPriceService (23), dividendService (15), marketIndicatorService (10), impersonationLogger (8)                         | HIGH     | `src/services/{portfolio,pricing,market}/__tests__/`, `src/services/__tests__/`                                              |
| 6.3 | [x] **Hook tests** — 40 tests covering useAssetData (18), useCarteira (12), useCashflow (10). Validates React Query migration with optimistic updates, progressive loading, multi-endpoint orchestration     | HIGH     | `src/hooks/__tests__/`                                                                                                       |
| 6.4 | [x] **API route template tests** — 83 tests for identical cotacao (7 assets × 5 tests) and objetivo (8 assets × 6 tests) routes                                                                              | MEDIUM   | `src/app/api/carteira/{etf,fii,stocks,moedas-criptos,opcoes,previdencia-seguros,reit,fim-fia}/{cotacao,objetivo}/__tests__/` |
| 6.5 | [x] **Component tests** — 54 tests: ErrorBoundary, LoadingSpinner, ComponentCard, SignInForm, ProtectedRoute, CarteiraTabs, GenericAssetTable, CaixaParaInvestirCard                                         | MEDIUM   | `src/components/{common,auth,carteira}/__tests__/`                                                                           |
| 6.6 | [x] **Remaining API route tests** — 111 tests: analises (18), cashflow sub-routes (25), portfolio GET routes (46), profile/calendar/historico/reserves (26)                                                  | LOW      | `src/app/api/analises/**`, `src/app/api/cashflow/**`, `src/app/api/carteira/**`, `src/app/api/historico/**`                  |
| 6.7 | [ ] **E2E tests** — Login flow, add asset, consultant impersonation. Requires Playwright setup                                                                                                               | LOW      | New Playwright config + `e2e/` directory                                                                                     |

### Task Dependencies

```
Phase 1 (Security) → can start immediately, independent tasks
Phase 2.3 (Types) → must complete before 2.1 (Generic Hook) → must complete before 2.2 (Generic Table)
Phase 2.4 (Pages Router migration) → independent, can parallel with 2.1-2.3
Phase 3.2 (AuthContext) → independent, can start anytime
Phase 4.1 (Tests) → should run after Phase 2 refactors to avoid throwaway tests
Phase 5.1 (React Query) → depends on Phase 2.1 (generic hook) being done first
Phase 6.5 (Component tests) → depends on 6.1 (infrastructure)
Phase 6.7 (E2E) → independent, can start anytime
```
