# Ativação em produção — Análise de Ativos v2.5 (regras da spec do Pedro + camada de fontes)

> Runbook **humano**, passo a passo, com `[OK]` a cada escrita em prod (só seguir para a próxima
> etapa com o OK anotado). Nada aqui roda sozinho: o merge na `main` faz o deploy (GitHub Actions →
> Lightsail, ~4 min) e o resto é na máquina de prod, em janela calma (**fora de 10:10–10:55 UTC**,
> quando rodam `scores`, `criterios` 10:30, `quadro` 10:40 e `curadoria`).
>
> Fonte: `docs/analise-ativos/v25-regras-pedro/desenho.json` → `final.ativacao_prod`, `final.migrations`
> e `final.riscos`; decisões do Wellington de 15/10/2026 (todas = recomendação). Runbook anterior
> (v2.4): [`ATIVACAO.md`](ATIVACAO.md). Runner e jobs: `docs/analise-ativos/fase0/RUNBOOK.md` §5 e §8.

## O que muda

| Item                             | v2.4 (hoje em prod)                               | v2.5                                                                                                     |
| -------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `criteria_params` vigente        | v1                                                | **v2** (linha nova; a v1 fica no banco)                                                                  |
| Financeiras (bancos/seguradoras) | "n de 3" (EBITDA, Dív/EBITDA, FCL não se aplicam) | **"n de 6"** (`naoSeAplica` vazio, religável por params)                                                 |
| FIIs de tijolo                   | vacância inativa                                  | vacância **ativa** pela CVM (`vacancy_physical: ['cvm']`); inad/LTV ativos, "sem dado" sem provedor      |
| Lucro                            | lucro líquido                                     | **lucro descontado** com fallback para o líquido (obs no tooltip)                                        |
| Quadro, coluna Tipo              | Tijolo/Papel/FoF/Híbrido/…                        | só **Tijolo \| Papel**; FoF/Híbrido no segmento                                                          |
| Planejar na carteira             | Objetivo da aba (Watchlist)                       | alvo por ativo em `planning_asset_targets` (% da carteira **total**)                                     |
| Registrar operação               | escolhia a seção                                  | **seção automática** + linha "Na Carteira: … (dá para mover depois)"                                     |
| Fontes                           | só CVM                                            | registro de fontes (CVM + conector de exemplo bloqueado em prod); ingestão `fontes-fundamentos` sem cron |

**Nenhuma variável nova no `app.env`.** Contratar um provedor depois = conector + `ANALISE_FONTE_<ID>_*`

- `ANALISE_FONTES_INGESTAO` + nova versão de `criteria_params` — sem migration.

Convenções (iguais às do RUNBOOK da Fase 0):

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 node --env-file="$ENVF" --import tsx "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

### Janela entre o deploy e o passo 4

O código passa a usar `CRITERIA_PARAMS_CODIGO = v2` nos rótulos e chips (vacância habilitada,
financeiras em "de 6"), mas o banco continua na v1 até o passo 4. Nesse intervalo o Quadro pode
mostrar o chip de vacância sem avaliação e financeiras com critérios "sem dado". A área é só
admin, então isso é aceitável — **mas os passos 2 a 4 devem rodar na mesma janela, logo depois do
deploy**, e o QA (passo 6) só começa depois do passo 4.

---

## Pré-checagens

- [ ] Backup do banco do dia confirmado (o mesmo do RUNBOOK §1). `[OK]`
- [ ] CI verde na PR: type-check, lint, test, build e **e2e com o seed efêmero** (o seed grava
      `criteria_params` v1 e v2 e roda o job `criterios` real). `[OK]`
- [ ] Janela fora de 10:10–10:55 UTC. Memória livre: `free -m` (~300 MB livres para o job). `[OK]`
- [ ] Nenhum job da área rodando (só leitura):
      `$PSQL -c "select job, status, inicio from analise_job_runs where status = 'executando';"` vazio. `[OK]`

---

## 1. Merge na `main` (migration pelo pipeline)

`prisma/migrations/20261016000000_analise_ativos_fontes_alvos/migration.sql` é **aditiva**:
`CREATE TABLE IF NOT EXISTS` de `asset_fundamentals_serie`, `fii_property_quality` e
`planning_asset_targets` (FKs para `User` e `assets` com `ON DELETE CASCADE`), índices, e
`ADD COLUMN IF NOT EXISTS "reviewedBy"` (nula) em `asset_fundamentals_period`, `fii_monthly` e
`fii_quarterly`. Nenhum DROP/RENAME/mudança de tipo. O `deploy.sh` roda `prisma migrate deploy`
antes do flip; se o deploy falhar, a release volta e o banco fica com tabelas vazias (inofensivo).

**Não** usar `scripts/analise-ativos/apply-migration-fontes-alvos.ts` em prod (é só para o DEV com drift).

- [ ] Merge feito pelo Wellington (`! gh pr merge …`) e deploy concluído. `[OK]`

Conferência (só leitura):

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations where migration_name like '%analise_ativos_fontes_alvos';"
$PSQL -c "select table_name from information_schema.tables where table_name in ('asset_fundamentals_serie','fii_property_quality','planning_asset_targets');"   # 3 linhas
$PSQL -c "select table_name from information_schema.columns where column_name = 'reviewedBy' and table_name in ('asset_fundamentals_period','fii_monthly','fii_quarterly');"   # 3 linhas
```

- [ ] Migration aplicada, 3 tabelas e 3 colunas presentes. `[OK]`

## 2. `criteria_params` v2 gravada, mas NÃO vigente

A v2 entra com `validFrom` em 2099: o cron das 10:30 e o `obterCriteriaParamsQuadro` continuam na v1
(vigente = maior `version` com `validFrom ≤ agora`).

```bash
rodar scripts/analise-ativos/seed-criteria-params.ts --versao=2 --valid-from=2099-01-01   # dry-run
```

Conferir no resumo do dry-run:

- `acao_financeira: não se aplica (nenhum: n de 6)`;
- `vac`, `inad` e `ltv` sem `[INATIVO]`; vacância com série `vacancy_physical` e fontes `['cvm']`;
- `alav` com rótulo "Alavancagem ≤ 20% do PL";
- `luc` com série `net_income_adjusted→net_income`;
- `dl` "< 3×";
- `margem com receita ≤ lucro: valor`;
- `fontes: padrão cvm` · `agregação` com `ultimo` · sanidade só nas camadas de provedor.

- [ ] Dry-run conferido. `[OK]`

```bash
rodar scripts/analise-ativos/seed-criteria-params.ts --versao=2 --valid-from=2099-01-01 --apply   # ESCRITA
$PSQL -c "select version, \"createdBy\", \"validFrom\" from criteria_params order by version;"   # v1 (passado) e v2 (2099-01-01)
```

O script é imutável: se a v2 já existir, compara com o código e só avisa.

- [ ] `--apply` gravou a v2 com `validFrom = 2099-01-01`. `[OK]`

## 3. Dry-run da v2 (nada é gravado)

```bash
cd /opt/myfinance/current && sudo -u myfinance env MALLOC_ARENA_MAX=2 \
  NODE_OPTIONS=--max-old-space-size=256 /usr/bin/time -v node --env-file=/etc/myfinance/app.env \
  --import tsx scripts/analise-ativos/rodar-job.ts criterios --sem-aplicar --versao-params=2 2>&1 | tail -25
```

Referência (v2.4, 13/10): **~211 MB** de RSS e ~13 s. Anotar `Maximum resident set size` e `Elapsed`.
Acima de ~300 MB ou com `falha`/`parcial`: parar e investigar.

- [ ] RSS = **\_\_** MB, tempo = **\_\_** s, status = **\_\_**. `[OK]`

```bash
rodar scripts/analise-ativos/relatorio-criterios.ts --comparar=1,2 --saida=/tmp/relatorio-criterios-v2-prod.txt
```

Comparar com `docs/analise-ativos/v2-filtros/relatorio-criterios-prod-15out2026.txt`. Esperado:

- financeiras em "n de 6"; bancos com EBITDA/Dív.EBITDA "sem dado"; holdings de layout industrial
  (ex.: ITSA4) com EBITDA calculado;
- FIIs de tijolo com vacância avaliada pela CVM; inad/LTV em "sem dado";
- `luc` com obs de fallback (`lucro_sem_descontado`) em ~100% das ações;
- o resto igual à v1.

- [ ] Relatório conferido; diferenças só nos itens acima. `[OK]`

## 4. Ativar a v2 (logo antes da gravação, fora da janela do cron)

Único UPDATE da ativação, numa linha criada no passo 2 e ainda não usada:

```bash
$PSQL -c "update criteria_params set \"validFrom\" = now() where version = 2 and \"validFrom\" = '2099-01-01';"   # ESCRITA: UPDATE 1
$PSQL -c "select version, \"validFrom\" from criteria_params order by version;"
```

- [ ] `UPDATE 1`; v2 com `validFrom` de agora. `[OK]`

Na sequência, gravar os critérios e o Quadro com a v2:

```bash
sudo /usr/local/bin/myfinance-job.sh criterios && tail -3 /var/log/myfinance-job.log   # ESCRITA
sudo /usr/local/bin/myfinance-job.sh quadro && tail -3 /var/log/myfinance-job.log      # ESCRITA
tail -2 /var/log/myfinance-cron.log    # "job:criterios -> exit 0" e "job:quadro -> exit 0"
```

- [ ] `criterios` exit 0, status `ok`; alertas anotados: **\_\_**. `[OK]`
- [ ] `quadro` exit 0, sem alerta `quadro_sem_criterios`. `[OK]`

Conferência (só leitura):

```sql
-- todas as avaliações na v2
select "paramsVersion", janela, count(*) from criteria_eval group by 1, 2 order by 1, 2;

-- toda linha do Quadro com a cópia compacta
select classe, "noQuadro", count(*), count(criterios), count("perfilCriterios")
from analise_quadro_linhas group by 1, 2 order by 1, 2;

-- coluna gravada continua com o tipo CVM BRUTO (a tela mostra só Tijolo | Papel)
select "fiiTipo", count(*) from analise_quadro_linhas where classe = 'fii' and "noQuadro" group by 1;
```

- [ ] `paramsVersion` = 2 em tudo; `count(criterios) = count(*)`. `[OK]`

## 5. Job `fontes-fundamentos` (sem cron)

Fica no catálogo **sem cron ativo** (a linha `#20 10 * * * … fontes-fundamentos` continua comentada
em `infra/modules/lightsail/provision.sh.tftpl`). Rodado à mão, deve terminar `pulado`
(sem `ANALISE_FONTES_INGESTAO`, nenhum conector habilitado). Não grava nada.

```bash
sudo /usr/local/bin/myfinance-job.sh fontes-fundamentos && tail -3 /var/log/myfinance-job.log   # status "pulado"
```

- [ ] Status `pulado`; `select count(*) from asset_fundamentals_serie;` = 0. `[OK]`

Descomentar o cron **só** quando houver conector contratado e `ANALISE_FONTES_INGESTAO` no `app.env`.

## 6. QA do admin (conta `qa.teste.*`)

Tudo o que for gravado no QA deve ser **desfeito** ao final (alvos, operações, planejados).

- [ ] **Caso 33** (§4.5): Planejar na carteira grava o alvo em % da carteira **total**; "Remover" apaga;
      ativo só com alvo aparece como "Planejado" com o valor equivalente. `[OK]`
- [ ] Card "Na sua carteira" mostra "Objetivo na aba ‹Aba› da Carteira: X%" quando há Objetivo > 0. `[OK]`
- [ ] Registrar compra de ação nova → seção **Value**, com a linha "Na Carteira: Ações · Value (dá
      para mover depois)"; FII de papel → **TVM**; conferir em `/carteira`. Desfazer as operações. `[OK]`
- [ ] Export de perfil (`/api/profile/export`) traz os alvos (`planning_asset_targets`). `[OK]`
- [ ] Quadro de FIIs: chips de vacância/inad/LTV ativos; `?criterios=vac` fica na URL e filtra;
      coluna Tipo só com Tijolo | Papel. `[OK]`
- [ ] Banco (ex.: ITUB4): "n de 6"; Essencial com as 14 colunas; sem a nota antiga de 2016. `[OK]`
- [ ] Essencial de ação: "Lucro descontado" / "Margem descontada" com o ⓘ e o tooltip do fallback. `[OK]`
- [ ] Nenhum verde/vermelho nos ✓/—; textos sem palavras proibidas. `[OK]`

Consequências do literal da spec, para o Wellington decidir se religa por params (nova versão):
margem descontada de bancos > 100% (ex.: ITUB4 148,8% em 2025, `receitaMenorQueLucro: 'valor'`) e
FCL/CAPEX de bancos com números extremos (FCO inclui depósitos).

Limpeza do QA (só leitura para conferir que nada ficou):

```sql
select t.id, u.email, a.symbol, t."updatedAt"
from planning_asset_targets t join "User" u on u.id = t."userId" join assets a on a.id = t."assetId"
where u.email like 'qa.teste.%';
```

- [ ] Nenhum alvo/operação/planejado de QA sobrando. `[OK]`

## 7. Rollback

**Rápido (só dados):** voltar a v1 a ser a vigente adiando a v2 de novo e regravar.

```bash
$PSQL -c "update criteria_params set \"validFrom\" = '2099-01-01' where version = 2;"   # ESCRITA (OK)
sudo /usr/local/bin/myfinance-job.sh criterios && sudo /usr/local/bin/myfinance-job.sh quadro   # ESCRITA (OK)
$PSQL -c "select \"paramsVersion\", count(*) from criteria_eval group by 1;"   # só v1
```

O desenho prevê, como alternativa, semear uma **v3 com o conteúdo da v1** (o schema aceita as
chaves legadas pelo alias). Hoje o `seed-criteria-params.ts` só conhece as versões 1 e 2: a v3
exige um PR acrescentando-a em `VERSOES_CODIGO`. O UPDATE acima é suficiente porque a v2 nunca é
apagada nem editada além do `validFrom`.

**Código:** reverter o merge na `main` (novo deploy). As tabelas novas podem ficar (vazias ou com
alvos de usuários); a migration é aditiva e não precisa ser desfeita. Com o código antigo, os
rótulos voltam a ser os da v1 — rodar também o rollback rápido para os dados casarem.

## 8. Memória

- [ ] Registrar em `project_analise_ativos_set2026.md` e em `decisoes.md`: D2, D3 e D4 revistos
      (financeiras "n de 6", vacância pela CVM, lucro descontado com fallback); desvio protótipo >
      texto no tipo de FII (só Tijolo | Papel); escopo da camada de fontes (critérios + Essencial;
      Raio-X, Valuation e Pares precisam de PR de leitura quando houver provedor).

## Riscos conhecidos (do desenho)

- Financeiras em "n de 6" podem parecer avaliação negativa de bancos (EBITDA/Dív.EBITDA "sem dado";
  FCL contábil).
- Inad/LTV ativos sem provedor: FII de papel sempre "não atende" nesses chips; ligar o par esvazia a
  lista de papel. Correto pela spec, pode parecer bug.
- "Lucro descontado" em fallback em ~100% até haver provedor (sinal só no tooltip).
- Dois alvos para o mesmo ativo (Objetivo da aba × alvo do Planejamento na carteira total); mitigado
  pela linha informativa.
- Seção automática "value" pode classificar errado quem usa growth/risk; corrige-se pelo mover (#274).
- Watchlists "planejadas" criadas pelo Planejar antigo continuam na Carteira sem o alvo novo (sem backfill:
  as bases são diferentes).
