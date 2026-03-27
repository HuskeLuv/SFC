# Conventions

> Coding standards and patterns used in this project.

## File Structure

- App Router: `src/app/` for pages and API routes
- Components: `src/components/<feature>/`
- Hooks: `src/hooks/use<Name>.ts`
- Services: `src/services/<name>Service.ts`
- Types: `src/types/<name>.ts`
- Utilities: `src/utils/<name>.ts`
- Documentation: `docs/` (architecture decisions, known issues, API docs)

## Naming

- Components: PascalCase
- Hooks: camelCase with `use` prefix
- Constants: UPPER_SNAKE_CASE
- Unused variables: prefix with `_` (ESLint configured to allow this)
- Routes: Mixed Portuguese/English (known inconsistency — see known-issues.md)

## Patterns

- Path alias: `@/*` maps to `./src/*`
- Auth guard: `middleware.ts` verifies JWT signature via `jose`, redirects to `/signin` on failure
- CSRF: `useCsrf()` hook provides `csrfFetch()` — use instead of raw `fetch` for state-changing requests
- Fetch deduplication: `useRef` guards in hooks (isFetchingRef, hasFetchedRef)
- Error handling in catch blocks: use `catch {` (no param) or `catch (error: unknown)` with `instanceof Error` guard

## Code Quality Gates

- **Pre-commit:** Husky runs lint-staged (eslint --fix + prettier)
- **CI:** GitHub Actions runs type-check, lint, test, build on every PR to main
- **ESLint:** `ignoreDuringBuilds: false` — lint errors fail the build
- **TypeScript:** strict mode, `ignoreBuildErrors: false`
- **Tests:** Vitest with v8 coverage, 65% statement coverage on tested routes

## Formatting

- Prettier: semi, singleQuote, trailingComma all, printWidth 100, tabWidth 2

---

_Last updated: 2026-03-27_
