# Ativação em produção — Análise de Ativos v2.4 (Filtros de Fundamentos)

> Runbook **humano**, passo a passo, com `[OK]` a cada etapa (só seguir para a próxima com o OK
> anotado). Nada aqui roda sozinho: o merge na `main` faz o deploy (GitHub Actions → Lightsail,
> ~4 min) e o resto é na máquina de prod, em janela calma (fora de 10:10–10:55 UTC, quando rodam
> `scores`, `criterios`, `quadro` e `curadoria`).
>
> Fontes: `docs/analise-ativos/v2-filtros/spec-desenho.json` → `arquitetura.plano_producao` e
> `plano_remocao_score`; decisões em [`decisoes.md`](decisoes.md) (aponta para
> `docs/analise-ativos/v2-filtros/decisoes.md`); detalhes operacionais do job em
> `docs/analise-ativos/fase0/RUNBOOK.md` §5 (runner `myfinance-job.sh`) e §8 (job `criterios`).

## Estado de partida (prod, 13/10/2026)

| Item                                   | Valor                                             |
| -------------------------------------- | ------------------------------------------------- |
| `ANALISE_ATIVOS_HABILITADA`            | `true`                                            |
| `ANALISE_ATIVOS_ACESSO`                | `beta` com a lista vazia → **só admin** vê a área |
| `ANALISE_ATIVOS_RAIOX_HABILITADO`      | `true`                                            |
| `ANALISE_ATIVOS_COMPARADOR_HABILITADO` | `false` (até o OK do jurídico)                    |
| `ANALISE_ATIVOS_CENARIOS_HABILITADO`   | `false` (até o OK do jurídico)                    |
| Máquina                                | Lightsail, 1,9 GB de RAM (app + Postgres 16)      |
| Crons da área já ativos                | Fase 0 (ingestão), `scores` 10:10, `quadro` 10:40 |

**Não existe flag nova.** A troca da tela é atômica (R2): depois do deploy, a área mostra os
Filtros de Fundamentos e nenhuma API devolve nota/Índice/semáforo/destaque (garantido pelo
`src/app/api/analise-ativos/__tests__/contratoSemNota.test.ts`).

**O banco do score NÃO é apagado nesta rodada (D6).** `AssetScore`, as colunas `indice*`/semáforo
de `analise_quadro_linhas` e o `ScoringParams` continuam sendo gravados pelo job `scores` (que
também grava `asset_multiples_current` e roda a sanidade do Bloco C). Só saem da superfície.

Convenções (iguais às do RUNBOOK da Fase 0):

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 node --env-file="$ENVF" --import tsx "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

### Sobre a ordem R1 → R2 com um merge só

A branch de integração traz as fatias 0, A (R1, invisível) e B, C1, C2, D, F (R2, a tela) juntas,
então **o mesmo deploy entrega R1 e R2**. Entre o deploy e o fim do passo R1.4, o Quadro e a página
do ativo mostram "sem avaliação" nos critérios (as linhas ainda não têm a cópia compacta). Como a
área está só para admin, isso é aceitável, mas os passos R1.2 a R1.4 devem rodar **na mesma janela,
logo depois do deploy**, e o QA da R2 só começa depois do R1.5.

---

## Pré-checagens

- [ ] Backup do banco do dia confirmado (o mesmo do RUNBOOK §1). `[OK]`
- [ ] CI verde na PR (type-check, lint, test, build e **e2e com o seed efêmero** — é a primeira
      prova real do seed de `criteria_params` + `criterios` no Quadro). `[OK]`
- [ ] Memória livre antes da janela: `free -m` (precisa de ~300 MB livres para o job). `[OK]`
- [ ] Nenhum job da área rodando: `$PSQL -c "select job, status, inicio from analise_job_runs where status = 'executando';"` vazio. `[OK]`

---

## R1 — dados dos critérios (fatias 0 + A)

### R1.1 Migration (pelo pipeline)

`prisma/migrations/20261015000000_analise_ativos_filtros` é aditiva: `CREATE TABLE IF NOT EXISTS`
de `criteria_params` e `criteria_eval`, índices e `ADD COLUMN IF NOT EXISTS` (nulas, instantâneas)
de `analise_quadro_linhas.criterios` e `.perfilCriterios`. Entra no merge: o `deploy.sh` roda
`prisma migrate deploy` antes do flip, com rollback automático se falhar.

**Não** usar `scripts/analise-ativos/apply-migration-filtros.ts` em prod (é só para o banco de DEV
com drift).

Conferir (só leitura):

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations where migration_name like '%analise_ativos_filtros';"
$PSQL -c "select table_name from information_schema.tables where table_name in ('criteria_params','criteria_eval');"   # 2 linhas
$PSQL -c "select column_name from information_schema.columns where table_name = 'analise_quadro_linhas' and column_name in ('criterios','perfilCriterios');"   # 2 linhas
```

- [ ] Migration aplicada, 2 tabelas e 2 colunas presentes. `[OK]`

### R1.2 `criteria_params` v1

```bash
rodar scripts/analise-ativos/seed-criteria-params.ts            # dry-run: mostra a v1 e "seria inserida"
rodar scripts/analise-ativos/seed-criteria-params.ts --apply
$PSQL -c "select version, \"createdBy\", \"validFrom\" from criteria_params order by version;"   # 1 linha, v1
```

O script é imutável: se a v1 já existir, compara com o código e só avisa (recalibrar = versão nova).

- [ ] Dry-run conferido. `[OK]`
- [ ] `--apply` gravou a v1. `[OK]`

### R1.3 Job `criterios` sem gravar, medindo RSS e tempo

```bash
cd /opt/myfinance/current && sudo -u myfinance env MALLOC_ARENA_MAX=2 \
  NODE_OPTIONS=--max-old-space-size=256 /usr/bin/time -v node --env-file=/etc/myfinance/app.env \
  --import tsx scripts/analise-ativos/rodar-job.ts criterios --sem-aplicar 2>&1 | tail -25
```

Referência do DEV (13/10/2026): **211 MB** de RSS máximo, **13 s**. Anotar o
`Maximum resident set size` e o `Elapsed`. Acima de ~300 MB ou com `falha`/`parcial` no relatório:
parar e investigar (não seguir).

- [ ] RSS = **\_\_** MB, tempo = **\_\_** s, status do relatório = **\_\_**. `[OK]`

### R1.4 Job `criterios` gravando, depois o `quadro`

```bash
sudo /usr/local/bin/myfinance-job.sh criterios && tail -3 /var/log/myfinance-job.log
sudo /usr/local/bin/myfinance-job.sh quadro && tail -3 /var/log/myfinance-job.log
tail -2 /var/log/myfinance-cron.log    # "job:criterios -> exit 0" e "job:quadro -> exit 0"
```

Referência do DEV: `criterios` 265 MB / 19 s (954 símbolos × 3 janelas = 2.862 linhas);
`quadro` 260 MB (com a cópia dos critérios).

- [ ] `criterios` exit 0, status `ok`, alertas anotados: **\_\_**. `[OK]`
- [ ] `quadro` exit 0, sem alerta `quadro_sem_criterios`. `[OK]`

### R1.5 Conferência (só leitura)

```sql
-- 3 janelas, o mesmo nº de símbolos em cada
select janela, count(*), count(distinct symbol), min("paramsVersion"), max("computedAt")
from criteria_eval group by 1 order by 1;

-- toda linha do Quadro com a cópia compacta: count(criterios) = count(*)
select classe, "noQuadro", count(*), count(criterios), count("perfilCriterios")
from analise_quadro_linhas group by 1, 2 order by 1, 2;

-- perfis (acao, acao_financeira, fii_tijolo, fii_papel)
select "perfilCriterios", count(*) from analise_quadro_linhas
where "noQuadro" group by 1 order by 1;

-- últimas execuções
select job, status, inicio, "duracaoMs", "rssPicoMb", alertas
from analise_job_runs where job in ('criterios','quadro') order by inicio desc limit 4;
```

E o relatório de distribuição para o Pedro (os números para ele saem **só** daqui):

```bash
rodar scripts/analise-ativos/relatorio-criterios.ts --saida=/tmp/relatorio-criterios-prod.txt
```

- [ ] Janelas e cópia no Quadro conferidas. `[OK]`
- [ ] Relatório gerado e guardado para o Pedro. `[OK]`

### R1.6 Cron (entre `scores` 10:10 e `quadro` 10:40)

A linha já está no template (`infra/modules/lightsail/provision.sh.tftpl`), mas o `user_data` tem
`ignore_changes`: copiar à mão para o arquivo ATIVO.

```bash
sudo cp /etc/cron.d/myfinance /root/myfinance.cron.bak.$(date +%F)
sudo tee -a /etc/cron.d/myfinance >/dev/null <<'EOF'
# Análise de Ativos (v2.4) — Filtros de Fundamentos (criteria_eval), entre o scores e o quadro
30 10 * * * root /usr/local/bin/myfinance-job.sh criterios
EOF
sudo chmod 644 /etc/cron.d/myfinance
grep -n "myfinance-job.sh" /etc/cron.d/myfinance    # scores 10:10, criterios 10:30, quadro 10:40
```

Comportamento: com o `scores` ainda rodando às 10:30, o `criterios` termina `pulado` (alerta
`criterios_scores_em_execucao`) e o `quadro` usa a avaliação anterior. `criteria_params` ausente =
`falha` (alerta `criteria_params_ausente`, nada gravado). Cobertura das ações não financeiras abaixo
de 90% em algum critério (janela 5) = alerta `criterios_cobertura_baixa`.

- [ ] Linha instalada. `[OK]`
- [ ] No dia seguinte: `criterios` 10:30 e `quadro` 10:40 com status `ok` em `analise_job_runs`. `[OK]`

---

## R2 — a tela (fatias B, C1, C2, D e F)

### R2.1 Deploy

O mesmo merge da R1 (ver "Sobre a ordem"). Depois do flip, conferir que nenhuma API da área expõe
nota — como admin logado no navegador (DevTools → Network), ou por `curl` com o cookie do admin:

```bash
# na sua máquina, com o cookie da sessão do admin em $COOKIE
for p in 'quadro?classe=acao' 'quadro?classe=fii' busca ativos/WEGE3 ativos/WEGE3/fundamentos \
         ativos/WEGE3/valuation ativos/HGLG11 'ativos/WEGE3/comparar-sugestoes?janela=5'; do
  curl -s -H "Cookie: $COOKIE" "https://<dominio>/api/analise-ativos/$p" \
    | grep -oiE '"[^"]*(indice|semaforo|destaque|nota|rating|score)[^"]*":' | sort -u | sed "s|^|$p: |"
done    # nenhuma linha
```

- [ ] Deploy concluído, health 200. `[OK]`
- [ ] Nenhuma chave proibida nas respostas. `[OK]`

### R2.2 QA como admin em prod

Em **390, 1080 e 1440 px**, **claro e escuro**, conferir contra o protótipo final
(`docs/analise-ativos/v2-filtros/prototipo.html`):

- Quadro (Ações e FIIs): ordem A–Z, coluna "Critérios" com "n de 6" (financeiras "n de 3"), chips
  dos critérios (Vacância/Inadimplência desabilitados em FII), janela 3 | 5 | 10, contador
  "X de N", rodapé literal, cartões no celular; nada de Índice/nota/semáforo/★.
- Página do ativo: card "Critérios de fundamentos" (✓/— neutros, nunca verde/vermelho; dado
  ausente = "não atende · sem dado nas demonstrações"), Essencial em R$ bi, Valuation, pares,
  ações da Carteira (Planejar, Registrar, Ver na carteira, Comparar).
- Registrar operação e Planejar: **não gravar em conta real**; se precisar testar a escrita, usar
  um usuário QA (`qa.teste.*`) e desfazer depois.
- Raio-X (flag já ligada) e o CSV (aviso legal = RODAPE_LEGAL_V2).
- Meus relatos: relato antigo do Índice aparece como "indicador descontinuado".

- [ ] 390 claro/escuro. `[OK]`
- [ ] 1080 claro/escuro. `[OK]`
- [ ] 1440 claro/escuro. `[OK]`

### R2.3 Recursos, na ordem

1. Raio-X — já ligado. `[OK]`
2. Comparador — **só depois do OK do jurídico** à "Leitura dos dados" (literal
   `leitura-dos-dados`): `ANALISE_ATIVOS_COMPARADOR_HABILITADO=true` no `app.env` + restart.
   `[OK jurídico]` `[OK]`
3. Meus cenários — **só depois do OK do jurídico** ao rodapé e às premissas em branco:
   `ANALISE_ATIVOS_CENARIOS_HABILITADO=true` + restart. `[OK jurídico]` `[OK]`

Troca de flag (mesmo procedimento das outras flags do `app.env`; registrar na memória do projeto):

```bash
sudo -e /etc/myfinance/app.env      # editar a linha da flag
sudo systemctl restart myfinance && curl -sf http://localhost:3000/api/health
```

### R2.4 Beta (abrir para além do admin) — só depois de TODOS:

- [ ] Pedro validou o `criteria_params` v1 (limites; ver o relatório da R1.5). `[OK]`
- [ ] Jurídico aprovou os textos provisórios de `TEXTOS_LITERAIS_OBRIGATORIOS`
      (`src/services/analiseAtivos/textosLiterais.ts`: aviso legal v2 e selo, rodapé do Quadro,
      instruções do Comparador, Leitura dos dados, rodapé dos cenários, aviso do banner). `[OK]`
- [ ] D6 concluída **ou** aceita como pendência pelo jurídico (o Índice segue no banco). `[OK]`

---

## D6 — tirar o score do banco (etapa separada, NÃO faz parte deste deploy)

Só depois de **2 ciclos estáveis** da R2, em PRs próprios (`plano_remocao_score` da spec):

- **D6-a (código, sem DDL):** desacoplar o Bloco C do AssetScore (`motivosIncompleto` →
  `motivosConferencia` gravado pelo derivados; tirar componentes/critérios do semáforo de
  `conferencia.ts`); separar o job `scores` em `derivados` (eventos, proventos, per-share,
  múltiplos e sanidade, com alias por 1 ciclo); `quadro` com `dataRef` de
  `AssetQuoteResumo.ultimoPregao`; `analise_params` v3 (ScoringParams sem índice, componentes,
  semáforo, fof, plNaoPositivo, régua e premissasPadrao) com script v2 → v3 em dry-run + diff;
  apagar o código e os testes do score.
- **D6-b (banco, migration SEPARADA, com OK do Wellington):** `pg_dump` das 6 tabelas para o S3;
  fechar casos de curadoria com campo `indiceMf`/`criterioSemaforo` como "indicador descontinuado";
  UPDATEs de limpeza dos JSONs (`analise_job_runs.detalhes`, `analise_data_reports.contextoServidor`,
  `analise_casos_dado.contexto`); DROPs; `scoring_params` cai só depois de 1 ciclo do
  `analise_params`; varredura do `information_schema`.

- [ ] D6-a mergeada e 2 ciclos estáveis. `[OK]`
- [ ] Backup das 6 tabelas no S3. `[OK]`
- [ ] D6-b com OK do Wellington. `[OK]`

---

## Rollback

| Etapa                         | Como voltar                                                                                                                                                                                    | Efeito                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| R1 (job/cron)                 | Tirar a linha `30 10 … criterios` do `/etc/cron.d/myfinance` (restaurar `/root/myfinance.cron.bak.*`). Se preciso, `delete from criteria_eval;` — o `quadro` seguinte zera a cópia nas linhas. | O Quadro mostra "sem avaliação" nos critérios. Nada da Fase 0/score muda. |
| R1 (params)                   | Não apagar a v1; recalibrar = versão nova pelo `seed-criteria-params`.                                                                                                                         | —                                                                         |
| R2 (tela)                     | Redeploy da versão anterior (`infra/rollback.sh`, ver `infra/DEPLOY.md`). As colunas antigas do score continuam preenchidas pelo `scores` até a D6, então a tela antiga volta inteira.         | As tabelas/colunas da v2.4 ficam (aditivas, inofensivas).                 |
| Recurso (Comparador/Cenários) | Flag `false` no `app.env` + restart.                                                                                                                                                           | Rotas do recurso respondem 404; o resto da área segue.                    |
| D6-b                          | Restaurar o `pg_dump` do S3 (só se a D6-b já tiver rodado).                                                                                                                                    | —                                                                         |

Toda alteração em prod (flag, cron, job manual) vai para a memória do projeto
(`feedback_log_prod_aws_changes`).
