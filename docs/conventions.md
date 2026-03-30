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

## Input Validation

- **Library:** [zod](https://zod.dev/) v4 for runtime schema validation on all POST/PUT/PATCH/DELETE API endpoints
- **Schemas location:** `src/utils/validation-schemas.ts` — reusable schemas and primitive builders (`zString`, `zPositiveNumber`, `zEmail`, `zDateString`, etc.)
- **Pattern:** Use `safeParse` at the entry point of every mutation handler, before any business logic:

  ```typescript
  import { someSchema, validationError } from '@/utils/validation-schemas';

  const body = await request.json();
  const parsed = someSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { field1, field2 } = parsed.data;
  ```

- **Error format:** `{ error: "Dados inválidos: field1, field2", details: { field1: [...], field2: [...] } }` with status 400
- **Constraints applied:** `.finite()` and `.positive()` on monetary values; `.max(255)` on names; `.max(1000)` on descriptions/notes; `.email()` on emails; date strings validated via `new Date()` parsing
- **Existing business logic untouched:** Zod validates structure and types at the entry point; domain-specific rules (e.g. quantity > available, date ranges) remain as-is after the schema check

## Asset Types

- Asset types extend base interfaces from `src/types/base.ts`. Use `BaseQuantityAtivo` for quantity-tracked assets (acoes, fii, etf, reit, stocks, opcoes, moedas-criptos, previdencia-seguros), `BaseFundAtivo` for fund-type assets (rendaFixa, fimFia), and `BaseAtivo` directly for unique structures (imoveis-bens).
- Shared section totals use `BaseQuantitySecaoTotals` or `BaseFundSecaoTotals`.
- When adding a new asset type, extend the appropriate base and only declare fields unique to that asset.
- Asset data hooks use `useAssetData<T>` from `src/hooks/useAssetData.ts`. Specific hooks extend it with custom calculations.

## API Error Handling

- **Wrapper:** All App Router API handlers (`src/app/api/`) use `withErrorHandler` from `@/utils/apiErrorHandler.ts`
- **Pattern:** Export handlers as `export const METHOD = withErrorHandler(async (request) => { ... });` — no manual try-catch needed for unhandled errors
- **ApiError class:** Throw `new ApiError(statusCode, message, details?)` for known error conditions within business logic
- **Common errors factory:** `Errors.unauthorized()`, `Errors.forbidden()`, `Errors.notFound(resource)`, `Errors.badRequest(message)`, `Errors.internal()` — all messages in Portuguese
- **Auth errors:** Errors thrown by `requireAuth`/`requireAuthWithActing` (`'Não autorizado'`) are caught automatically by the wrapper and returned as 401
- **Validation errors:** Zod `safeParse` + `validationError()` responses are returned inline (not thrown), so they bypass the wrapper — this is intentional
- **Error messages language:** All user-facing error messages must be in Portuguese (this is a Brazilian platform)
- **Standard messages:**
  - 401: `'Não autorizado'`
  - 403: `'Acesso negado'`
  - 404: `'{Resource} não encontrado(a)'`
  - 400: domain-specific Portuguese message
  - 500: `'Erro interno do servidor'`

  ```typescript
  import { withErrorHandler } from '@/utils/apiErrorHandler';

  export const GET = withErrorHandler(async (request) => {
    const { targetUserId } = await requireAuthWithActing(request);
    // ... business logic — no try-catch needed
    return NextResponse.json(result);
  });
  ```

## Formatting

- Prettier: semi, singleQuote, trailingComma all, printWidth 100, tabWidth 2

---

_Last updated: 2026-03-28_
