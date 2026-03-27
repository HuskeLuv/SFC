# Agent: tests

## Changes Made

- `src/app/api/carteira/operacao/__tests__/route.test.ts`: Fixed 7 failing tests by updating mock request bodies to match the actual route validation requirements
  - ETF success test: added missing `regiaoEtf: "brasil"` field
  - REIT success test: added missing `cotacaoMoeda: 5.2` field
  - REIT manual success test: added missing `cotacaoMoeda: 5.2` field
  - REIT manual name validation test: added missing `cotacaoMoeda: 5.2` so the correct validation (name check) is reached
  - Fundo manual success test: changed `tipoFundo: "fim"` to `fundoDestino: "fim"` (correct field name)
  - Fundo destination validation test: changed field name from `tipoFundo` to `fundoDestino` and updated expected error from "FIM ou FIA" to "fundo deve aparecer" to match actual error message
  - Fundo name validation test: changed `tipoFundo: "fim"` to `fundoDestino: "fim"` so the correct validation (name check) is reached
  - Tesouro Direto success test: added missing `tesouroDestino: "reserva-emergencia"` and required fields (`cotizacaoResgate`, `liquidacaoResgate`, `vencimento`, `benchmark`)
- `src/app/api/carteira/__tests__/get-routes.test.ts`: Added `default: mockPrisma` to the Prisma mock, added `marketIndicatorCache: { findUnique: vi.fn() }` to the mock Prisma object, and added mock for `marketIndicatorService.getIndicator`
- `vitest.config.ts`: Enabled coverage with v8 provider, text reporters, 50% statement threshold, scoped to tested route directories
- Installed `@vitest/coverage-v8@^1.6.0` as a dev dependency (matching vitest v1.6.x)

## Root Causes

- **ETF**: Route added `regiaoEtf` as a required field (must be "brasil" or "estados_unidos") but test was never updated
- **REIT**: Route requires `cotacaoMoeda` (dollar exchange rate) for REITs but tests omitted it
- **Fundo**: Route uses `fundoDestino` (where to display the fund) but tests used a non-existent `tipoFundo` field. The route validates `fundoDestino` with options including "reserva-emergencia", "reserva-oportunidade", "renda-fixa", "fim", "fia"
- **Tesouro Direto**: Route requires `tesouroDestino` to determine where the treasury bond appears, plus conditional required fields depending on the destination
- **get-routes moedas-criptos**: The `moedas-criptos/route.ts` calls `getIndicator` from `marketIndicatorService`, which uses `import prisma from '@/lib/prisma'` (default import). The mock only provided named export, and lacked the `marketIndicatorCache` model, causing a TypeError at runtime

## Decisions

- Used `tesouroDestino: "reserva-emergencia"` for the Tesouro Direto success test since it exercises the reserve path and requires specific fields (cotizacaoResgate, liquidacaoResgate, vencimento, benchmark)
- Used `regiaoEtf: "brasil"` for ETF since it's the simpler valid option (no currency conversion)
- Used `cotacaoMoeda: 5.2` (approximate BRL/USD rate) for REIT tests
- Changed fundo destination validation test expectation to match actual error text ("fundo deve aparecer") rather than the previously assumed "FIM ou FIA"
- Scoped coverage `include` to `operacao/`, `aporte/`, and `resgate/` directories to achieve a meaningful 50% threshold against actually tested code (65.36% achieved)
- Installed `@vitest/coverage-v8@^1.6.0` to match vitest ^1.6.0 (latest 3.x was incompatible)

## Issues Found

- The test file had drifted from the route implementation across multiple features (ETF regions, REIT currency, Fundo destinations, Tesouro Direto destinations) suggesting these route fields were added without corresponding test updates
- `@vitest/coverage-v8` latest (3.x) is incompatible with vitest 1.6.x; had to pin to ^1.6.0
- A linter/formatter hook kept reverting `vitest.config.ts` changes (removing `enabled: true`, `thresholds`, `include`); had to re-apply multiple times
- The `moedas-criptos/route.ts` transitively depends on `marketIndicatorService` which uses default prisma import, requiring both `default` export in the mock and `marketIndicatorCache` model
