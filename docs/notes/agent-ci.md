# Agent: ci

## Changes Made

- `.github/workflows/ci.yml` -- GitHub Actions CI pipeline
- `.husky/pre-commit` -- pre-commit hook running `npx lint-staged`
- `.prettierrc` -- Prettier configuration (semi, singleQuote, trailingComma, 100 printWidth)
- `package.json` -- husky, lint-staged, prettier in devDependencies; lint-staged config; `prepare` script for husky

## Pipeline Design

- **Install**: `npm ci` with Node 20 and npm cache for fast installs
- **Type Check**: `tsc --noEmit` catches type errors early
- **Lint**: `next lint` runs ESLint with Next.js rules
- **Test**: `vitest run` executes the test suite
- **Build**: `next build` ensures the project compiles for production
- Steps run sequentially; any failure stops the pipeline (GitHub Actions default)
- Concurrency group `ci-${{ github.ref }}` cancels stale runs on the same branch/PR
- Secrets are set at job level so all steps can access them

## Pre-commit Setup

- **Husky v9**: `prepare` script in package.json runs `husky` on `npm install`
- **lint-staged**: pre-commit hook runs `npx lint-staged`:
  - `*.{ts,tsx}`: `eslint --fix` then `prettier --write`
  - `*.{json,md,yml,yaml}`: `prettier --write`

## Secrets Required

- `DATABASE_URL` -- Prisma/Neon database connection string
- `JWT_SECRET` -- JSON Web Token signing secret
- `BRAPI_API_KEY` -- BrAPI external data service key

These must be configured in GitHub repo settings under Settings > Secrets and variables > Actions.

## Manual Steps Required

Bash access was denied during this run. Please run:

```bash
npm install          # ensure devDependencies are installed
npm run build        # verify nothing is broken
```
