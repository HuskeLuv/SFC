# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SFC is a Brazilian financial management platform (Next.js 15, React 19, TypeScript, Prisma 6, PostgreSQL). It targets ~1,000 DAU with B3/Bacen market integrations. Runs on a single AWS Lightsail instance (app + Postgres 16, sa-east-1); deploy = merge to `main` (GitHub Actions, ~4 min). See `infra/README.md`.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (runs ESLint + TypeScript checks)
npm run lint         # ESLint
npm run type-check   # TypeScript strict check (tsc --noEmit)
npm test             # Run all unit tests (vitest run)
npx vitest run src/app/api/carteira/operacao  # Run tests for a specific route
npx vitest --watch   # Watch mode
npm run test:e2e     # Run E2E tests (Playwright, requires dev server)
npm run test:e2e:ui  # E2E tests with interactive UI
npm run seed         # Seed database (npx tsx prisma/seed.ts)
npx prisma migrate deploy  # Apply migrations (NEVER `migrate dev`: the dev DB has drift and it wants to reset)
npx prisma generate      # Regenerate Prisma client
```

## Architecture

**Next.js 15 App Router** with server components by default. Client components use `"use client"` directive.

- `src/app/` — Pages and ~73 API routes organized by feature
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

**Edit/mutation flow:** Two layers must stay in sync:

1. _Backend recalc_ — `src/services/portfolio/portfolioRecalculation.ts` exports `recalculatePortfolioFromTransactions()`. Single source of truth that recomputes `Portfolio.{quantity,avgPrice,totalInvested}` from `StockTransaction` history AND syncs `FixedIncomeAsset.investedAmount` for renda-fixa. Call after any transaction mutation (PATCH/DELETE on `/api/historico/transacao/[id]`, novo aporte/resgate, etc.).
2. _Frontend invalidation_ — `src/lib/invalidatePortfolio.ts` exports `invalidatePortfolioDerivedQueries(queryClient)` that wipes carteira/assets/proventos/instituicao/sensibilidade/coberturaFgc/riscoRetorno/ir/alocacao/reserva caches. Call after any successful mutation in hooks (`useAssetData`, `useRendaFixa`, `useImoveisBens`, `useReserva*`, `useCarteira`, `useAlocacaoConfig`) or pages (`/ativos/[id]/editar`).

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

Vitest 1.6 with v8 coverage. Tests live in `__tests__/` directories next to the module they test. Coverage threshold: 50% statements on `src/app/api/carteira/{operacao,aporte,resgate}/**/*.ts` plus `src/services/**/*.ts` and `src/hooks/**/*.ts`.

Playwright E2E tests (13 tests, 3 spec files in `e2e/`). Run with `npm run test:e2e`. Auth setup uses seed user `usuario.demo@finapp.local` / `123456`. Requires dev server running.

Test pattern: mock Prisma via `vi.hoisted()`, mock `requireAuthWithActing` from `@/utils/auth`, mock `@/lib/prisma`. Test the exported route handler (POST, GET, etc.) with `NextRequest`.

Test infrastructure in `src/test/`: `setup.ts` (jest-dom matchers), `wrappers.tsx` (React Query test wrapper via `renderHookWithClient`), `mocks/prisma.ts` (reusable `createMockPrisma()` factory), `mocks/auth.ts` (`mockAuthAsUser`/`mockAuthAsConsultant`), `mocks/fetch.ts` (`mockFetchResponse`/`stubFetch`). Hook/component tests use `// @vitest-environment jsdom` directive.

## Environment Variables Required

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing key
- `BRAPI_API_KEY` — BRAPI market data API key
- Optional: `PLUGGY_HABILITADO`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`, `PLUGGY_INCLUI_SANDBOX` — Pluggy (Open Finance) integration: off by default in dev, **on in production since 2026-09-25**; see `docs/pluggy-dev-setup.md` (dev + production recipe). Config in `src/lib/pluggyConfig.ts` (edge-safe) and SDK client in `src/lib/pluggy.ts` (Node only).
- Optional: `COMUNIDADE_HABILITADA` — Comunidade (posts/curtidas/comentários, `/comunidade`), off by default (dev-only until the terms are reviewed). Flag in `src/lib/comunidadeConfig.ts`.
