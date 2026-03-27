# Known Issues

> Tracked problems and technical debt. Updated by agents and manual review.

## Critical

- [ ] Credentials were previously committed to git history (.env) — rotation in progress
- [x] ~~Middleware checks cookie presence but does NOT validate JWT signature~~ — Fixed: uses `jose` jwtVerify
- [x] ~~No CSRF protection on state-changing endpoints~~ — Fixed: double-submit cookie pattern
- [x] ~~No CI/CD pipeline~~ — Fixed: GitHub Actions + Husky + lint-staged

## High

- [x] ~~7 failing tests in operacao/route.test.ts~~ — Fixed: mock bodies updated (ETF region, REIT currency, Fundo destination, Tesouro destination)
- [x] ~~100+ ESLint errors shipping to production (ignoreDuringBuilds: true)~~ — Fixed: all errors resolved, `ignoreDuringBuilds: false`
- [ ] No rate limiting on any endpoint
- [ ] Test coverage at 65% on tested routes, but only 6 of 81 API routes have tests

## Medium

- [ ] Legacy Pages Router still in src/pages/ (64K) — migrate to App Router
- [ ] Mixed Portuguese/English route naming
- [ ] No React Error Boundaries
- [ ] No accessibility (ARIA labels, focus management, contrast)
- [ ] Sequential API calls in useCashflowData.ts — use Promise.all
- [ ] Memory leak: AppHeader.tsx removes listener from `document` but adds to `window`
- [ ] No data caching layer (candidate for React Query)
- [ ] No pagination on table endpoints
- [ ] Heavy libraries (ApexCharts, FullCalendar, Swiper) not lazy-loaded

---

_Last updated: 2026-03-27_
