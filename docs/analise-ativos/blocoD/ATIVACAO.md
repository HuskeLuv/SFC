# ATIVAÇÃO — Análise de Ativos, bloco D em produção (Lightsail)

> Bloco D (Fase 2, só Ações e FIIs) = (A) Fundamentos · Raio-X + Exportar CSV, (B) Valuation · Meus
> cenários, (C) Comparador e (D) as entradas do Comparador (pílulas Quadro | Comparador, modo
> Comparar do Quadro com bandeja, botão "Comparar" no cabeçalho do ativo). Todo passo marcado
> **[OK]** é humano, com OK explícito do Wellington. Decisões: `docs/analise-ativos/blocoD/decisoes.md`
> (prevalecem sobre a spec e o protótipo). Spec: `docs/analise-ativos/blocoD/spec-desenho.json` →
> `plano_producao`.

Convenções (iguais às da Fase 1 e do bloco C, `docs/analise-ativos/blocoC/ATIVACAO.md`):

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 node --env-file="$ENVF" --import tsx "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

## REGRA

- **Com as 3 flags desligadas a tela fica IDÊNTICA à de hoje e as rotas novas respondem 404**
  (`/api/analise-ativos/ativos/[ticker]/raio-x`, `/api/analise-ativos/comparador`,
  `/api/analise-ativos/cenarios/[ticker]` e a página `/analise-ativos/comparador`).
- **Única exceção, sem flag (decisão 1):** no Essencial (já em produção), os anos em que a base de
  ações quebra (`salto_acoes_sem_evento`/`dados_incompletos` ou nº de ações < 1/10 da mediana dos
  anos, com ≥ 3 anos) ficam com LPA, P/L e P/VP (FII: VP/cota e rendimento/cota) ocultos e "em
  conferência". Ex.: CBAV3 2021, 2022, 2024 e 2025. Vale assim que o merge entra.
- Ordem de ligar (decisão 15): **RAIOX → COMPARADOR → CENARIOS**, um por vez, com [OK] a cada passo.
  Comparador (Resumo numérico) e Cenários (rodapé literal, `textosCenarios`) dependem do OK do
  jurídico aos textos. O Raio-X não depende.
- Nenhuma rota do bloco chama provedor externo: só o banco.

## Onde fica cada coisa

| O quê                    | Onde                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Raio-X + CSV             | `ANALISE_ATIVOS_RAIOX_HABILITADO=true` em `$ENVF` + restart                                                                        |
| Comparador + entradas    | `ANALISE_ATIVOS_COMPARADOR_HABILITADO=true` em `$ENVF` + restart                                                                   |
| Meus cenários            | `ANALISE_ATIVOS_CENARIOS_HABILITADO=true` em `$ENVF` + restart                                                                     |
| Área inteira             | continua atrás de `ANALISE_ATIVOS_HABILITADA` + beta (`docs/analise-ativos/fase1/ATIVACAO.md`); sem beta próprio do bloco D        |
| `/config` ao cliente     | `recursos.{raioX,comparador,cenarios}` = flag ligada **e** área liberada para o usuário logado                                     |
| Flags (código)           | `src/lib/analiseAtivosConfig.ts`                                                                                                   |
| Regra por ação (dec. 1)  | `src/services/analiseAtivos/regras/conferencia/conferenciaAnual.ts` (Essencial e Raio-X usam a mesma)                              |
| Taxa de adm. (dec. 3)    | soma de 12 meses de `taxaAdmPct`; ano acima de `LIMIAR_TAXA_ADM_ANO_PCT` (3%) fica "em conferência" (ex.: XPLG11 2020)             |
| Tabela                   | `analise_cenarios` (migration aditiva `20261014000000_analise_ativos_bloco_d`; FK para `"User"` com ON DELETE CASCADE)             |
| Rate limit               | middleware: balde próprio de 30/min por IP para o Raio-X e para o Comparador                                                       |
| Cache                    | em memória, com TTL e limite de chaves (`src/lib/boundedTtlCache.ts`); some no restart                                             |
| LGPD                     | cenários salvos entram no `/api/profile/export`                                                                                    |
| Consultor agindo         | GET dos cenários = 200 com `salvo=null` e `podeSalvar=false`; PUT/DELETE = 403; a calculadora usa a posição do cliente             |
| Meta de renda → objetivo | `POST /api/planejamento-sonhos` (target = cotas × cotação; available = posição × cotação); o objetivo vira linha no Fluxo de Caixa |

Mudança de env (`ANALISE_ATIVOS_*`) exige restart.

---

## Passo 1 — Deploy com as 3 flags DESLIGADAS

O merge na `main` dispara o pipeline (`infra/deploy.sh` roda `prisma migrate deploy` antes do flip).
A migration `prisma/migrations/20261014000000_analise_ativos_bloco_d` é aditiva e idempotente: só
`CREATE TABLE/INDEX IF NOT EXISTS` e a FK num bloco `DO $$ … EXCEPTION WHEN duplicate_object`. Cria
`analise_cenarios` vazia; nenhuma coluna muda em tabela existente; sem backfill e sem job novo.

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations
          where migration_name like '%analise_ativos_bloco_d%';"
$PSQL -c "\d analise_cenarios"            # PK, unique (userId, symbol), índice (userId, updatedAt), FK → "User"
$PSQL -c "select count(*) from analise_cenarios;"    # esperado: 0
grep -E '^ANALISE_ATIVOS_(RAIOX|COMPARADOR|CENARIOS)' $ENVF   # esperado: nada, ou =false
```

Esperado: tela idêntica à de antes, salvo o Essencial da decisão 1 (abrir CBAV3 como admin: anos
2021, 2022, 2024 e 2025 com LPA/P/L/P/VP "em conferência"; 2020 e 2023, com prejuízo, continuam
visíveis). `/analise-ativos/comparador` mostra a página de não encontrado.

## Passo 2 — Dry-run read-only em prod **[OK]**

Só lê o banco (mesmos serviços das rotas, sem passar pelas flags); grava os CSVs num diretório
temporário.

```bash
rodar scripts/analise-ativos/qa-bloco-d.ts --saida=/tmp/qa-bloco-d
# ou uma lista própria: rodar scripts/analise-ativos/qa-bloco-d.ts --saida=/tmp/qa-bloco-d HGLG11 XPLG11
```

Amostra padrão: WEGE3, ITUB4, PETR4, AURE3, TGMA3, HGLG11, XPLG11, KNCR11, MXRF11, HFOF11, CBAV3,
SBSP3, GSRF11, PMRL11 (BCFF11 não existe no dev; o QA usa HFOF11). Para cada um: tempo frio e
quente, o CSV completo e as linhas a conferir. Depois, as 4 comparações do plano de QA
(4 ações; tijolo × tijolo; tijolo + papel; ação + FII → o FII sai como `outra_classe`).

Conferir:

1. **Regra 2T+4T (decisão 5)** — para HGLG11, XPLG11, KNCR11, MXRF11 e HFOF11, o "Rendimento
   distribuído (R$ mi)" de 2024 e 2025 contra a B3 (soma dos rendimentos por cota pagos no ano ×
   nº de cotas, mesma base de cotas de hoje). Tolerância **±15%**. Se algum fundo passar disso, as
   linhas "Rendimento distribuído" e "Payout do resultado" **saem** antes de ligar (decisão 5) —
   volta para o desenvolvimento.
2. Resultado por cota pela média mensal de cotas (HGLG11 2025 ≈ R$ 12,90).
3. Desdobramento do HGLG11 (VP/cota de 2017 na base de hoje ≈ R$ 112,73, não R$ 1.127,27).
4. Taxa de adm. no ano entre ~0,3% e ~1,5% nos fundos da amostra; XPLG11 2020 vazio no CSV
   (em conferência, acima de 3%).
5. CBAV3: LPA vazio em 2021, 2022, 2024 e 2025 (decisão 1); SBSP3 com a série completa.
6. ITUB4: payout "—" com a observação "A equipe confere o escopo do DMPL" (achado conhecido).
7. Tempos: frio < 300 ms por ativo e por comparação (no dev/Neon o FII chegou a 757 ms; em prod o
   Postgres é local); quente ≈ 0 ms (cache).

Se o QA de dados mostrar um problema bloqueante, não seguir: registrar e voltar ao desenvolvimento.

## Passo 3 — Ligar o Raio-X **[OK]**

```bash
echo 'ANALISE_ATIVOS_RAIOX_HABILITADO=true' | sudo tee -a $ENVF && sudo systemctl restart myfinance
```

Com o beta vazio, só admins veem. Conferir com 2 admins, no computador e no celular:
Fundamentos → seletor Essencial | Raio-X (a URL ganha `?fund=raiox` e o recarregar mantém) →
blocos/chips → "Exportar CSV" baixa `raio-x_<TICKER>_<AAAA-MM-DD>.csv` (abre direto no Excel:
`;`, vírgula decimal, BOM, CRLF). Testar o CSV no PWA do iOS (folha de compartilhar) e no Android.
Ações (WEGE3, ITUB4, CBAV3) e FIIs (HGLG11, XPLG11, KNCR11).

## Passo 4 — Ligar o Comparador **[OK]** (depois do OK do jurídico aos textos do Comparador)

```bash
echo 'ANALISE_ATIVOS_COMPARADOR_HABILITADO=true' | sudo tee -a $ENVF && sudo systemctl restart myfinance
```

Conferir: pílulas Quadro | Comparador; no Quadro, "Comparar" → caixas de 44px → bandeja → abre o
Comparador a partir de 1 ativo ("Adicione mais um ativo para ver os destaques"); botão "Comparar" no
cabeçalho do ativo; máximo 4; ação + FII recusado; tijolo + papel com aviso e P/VP sem ★; dados de
imóveis com "fonte CVM" e sem ★; payout sem ★; Resumo numérico sem placar; "Copiar link".

## Passo 5 — Ligar Meus cenários **[OK]** (depois do OK do jurídico ao rodapé literal e aos `textosCenarios`)

```bash
echo 'ANALISE_ATIVOS_CENARIOS_HABILITADO=true' | sudo tee -a $ENVF && sudo systemctl restart myfinance
```

Ponta a ponta com admin, **em conta de teste**: Valuation → Múltiplos | Meus cenários → editar
premissa → Salvar → recarregar (mantém) → "Restaurar valores do ativo" (sem confirmação) → toast
"Desfazer" por 5 s (regrava o anterior) → Meta de renda (FII) → "Criar objetivo no Planejamento" →
objetivo aparece no Planejamento e como linha no Fluxo de Caixa. `/api/profile/export` traz o
cenário. Consultor agindo pelo cliente: calcula com a posição do cliente, não vê o salvo e recebe 403
ao salvar. Apagar ao final o cenário e o objetivo de teste.

```bash
$PSQL -c "select \"userId\", symbol, \"updatedAt\" from analise_cenarios order by \"updatedAt\" desc limit 20;"
```

## Passo 6 — Beta

Segue a abertura da área (sem beta próprio do bloco D). **[OK]**

## Rollback

- Por recurso: remover a linha da flag do `$ENVF` + `sudo systemctl restart myfinance`. As rotas
  voltam a 404 e a tela volta à de hoje (o `?fund=raiox` de um link antigo cai no Essencial).
- A tabela `analise_cenarios` fica (aditiva); os cenários salvos são preservados para quando religar.
- A regra por ação do Essencial (decisão 1) não tem flag: voltar exige revert do commit da fatia A
  na parte de `conferenciaAnual` + deploy.

---

## Só DEV (Neon) — nunca em produção

- Migration aplicada no dev com
  `npx tsx --env-file=.env scripts/analise-ativos/apply-migration-bloco-d.ts --apply` (o dev tem
  drift; nada de `prisma migrate dev/deploy` lá) + `npx prisma generate` + **reiniciar o dev
  server**. Rodar de novo não muda nada. Aplicada em 08/10/2026.
- Servidor de dev com tudo ligado:
  `ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta ANALISE_ATIVOS_REPORTE_HABILITADO=true ANALISE_ATIVOS_RAIOX_HABILITADO=true ANALISE_ATIVOS_COMPARADOR_HABILITADO=true ANALISE_ATIVOS_CENARIOS_HABILITADO=true npm run dev`.
- Dry-run no dev: `npx tsx --env-file=.env scripts/analise-ativos/qa-bloco-d.ts --saida=/tmp/qa-bloco-d`.
- Usuários: `usuario.demo@finapp.local` / `123456` (no beta), `consultor.demo@finapp.local` /
  `123456`, admin de dev/CI `admin.demo@finapp.local` / `123456` (`prisma/seedAdminDev.ts`).
- e2e: no CI as 3 flags ficam ligadas no job de e2e (`.github/workflows/ci.yml`); os testes do bloco
  D leem `config.recursos` (`e2e/fixtures/analise-bloco-d.ts`) e pulam sem elas. O que grava
  (`analise-ativos-cenarios.escrita.spec.ts`) só roda com `E2E_ALLOW_WRITES=1` e desfaz o que gravou.
- Cenários salvos e objetivos criados em teste manual no dev devem ser apagados ao final.
