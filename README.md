# SFC — Sistema de Gestão Financeira

Plataforma brasileira de gestão financeira pessoal e profissional, com foco em controle de carteira de investimentos, fluxo de caixa, planejamento, análises de risco/retorno e apuração de IR. Integra dados de mercado da B3 e indicadores macro do Bacen.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript)
- **Prisma 6** + **PostgreSQL**
- **TanStack Query** (cache/dedup de dados)
- **Tailwind CSS 4**
- **Vitest** (unit/integration) + **Playwright** (E2E)
- **JWT** em cookies httpOnly + CSRF double-submit

## Pré-requisitos

- Node.js >= 18
- PostgreSQL local ou remoto

## Setup

```bash
npm install
cp .env.example .env       # preencha as variáveis abaixo
npx prisma migrate dev     # cria schema no banco
npm run seed               # dados iniciais (opcional)
npm run dev                # http://localhost:3000
```

## Variáveis de ambiente

| Variável        | Descrição                                 |
| --------------- | ----------------------------------------- |
| `DATABASE_URL`  | Connection string PostgreSQL              |
| `JWT_SECRET`    | Chave de assinatura JWT (mínimo 32 bytes) |
| `BRAPI_API_KEY` | Chave da BRAPI para cotações B3           |

## Comandos

```bash
npm run dev          # Dev server
npm run build        # Build produção (roda ESLint + type-check)
npm run lint         # ESLint
npm run type-check   # TypeScript strict (tsc --noEmit)
npm test             # Testes unitários (Vitest)
npm run test:e2e     # Testes E2E (Playwright, requer dev server)
npm run seed         # Popular banco com dados iniciais
npx prisma migrate dev   # Aplicar migrations
npx prisma generate      # Regenerar Prisma client
```

## Estrutura

```
src/
├── app/              # Pages e API routes (App Router)
├── components/       # Componentes React por domínio
├── hooks/            # Custom hooks (TanStack Query)
├── services/         # Lógica de negócio (BRAPI, snapshots, dividendos)
├── context/          # React Contexts (Auth, Theme, Sidebar)
├── lib/              # Singletons (Prisma, query keys)
├── middleware.ts     # Edge middleware (JWT + CSRF)
└── utils/            # Helpers (auth, validação, formatação)

prisma/               # Schema + migrations + seed
e2e/                  # Playwright specs
```

Documentação detalhada de arquitetura, convenções e padrões internos em `CLAUDE.md`.

## Qualidade

- Pre-commit (Husky): `lint-staged` roda `eslint --fix` + `prettier --write`
- CI (GitHub Actions): `type-check` → `lint` → `test` → `build` em cada PR pra `main`

## Licença

Software proprietário. Todos os direitos reservados. Veja [LICENSE](./LICENSE).
