# ATIVAÇÃO — Análise de Ativos, bloco C em produção (Lightsail)

> Bloco C = (1) "Reportar dado incorreto" (relato do usuário, Meus relatos, fila do curador em
> `/admin/curadoria`, notificações) e (2) regras de sanidade "em conferência" em todos os
> indicadores (generalizam a trava de proventos). Todo passo marcado **[OK]** é humano, com OK
> explícito do Wellington. Decisões: `docs/analise-ativos/blocoC/decisoes.md` (prevalecem sobre a
> spec e o protótipo). Spec: `docs/analise-ativos/blocoC/spec-desenho.json` →
> `arquitetura.plano_producao`.

Convenções (iguais às da Fase 1, `docs/analise-ativos/fase1/ATIVACAO.md`):

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 node --env-file="$ENVF" --import tsx "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

## REGRA

- **Com a ScoringParams v1 ativa (a de prod hoje) NADA muda na tela nem nos números.** A v1 não
  grava `conf:`/`rev:`/`info:` (`sanidade.conferencia.ligada=false`, o default que a v1 gravada no
  banco também lê). As regras novas só valem com a v2.
- Ordem de merge: fatia 0 (contratos) → A, B, C, D (flags desligadas, v1 ativa) → QA integrado.
- Curadores = admins (`User.role='admin'`). Não existe "conferência manual" pelo curador nesta
  fase (decisão 16): o curador só decide status/resolução e pode **liberar** o valor
  (`rejeitado` + `dado_confirmado` + "liberar o valor", que vale no próximo cálculo diário).

## Onde fica cada coisa

| O quê                   | Onde                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão / APIs de relato  | `ANALISE_ATIVOS_REPORTE_HABILITADO=true` em `$ENVF` + restart (desligada: item escondido e APIs 404)                                                                              |
| Área inteira            | continua atrás de `ANALISE_ATIVOS_HABILITADA` + beta (`docs/analise-ativos/fase1/ATIVACAO.md`)                                                                                    |
| `/config` ao cliente    | `reporteHabilitado` = flag ligada **e** área liberada para o usuário logado                                                                                                       |
| Regras "em conferência" | `ScoringParams.sanidade.conferencia.ligada` (v1 = false; v2 = true)                                                                                                               |
| Contrato das regras     | `src/services/analiseAtivos/regras/comum/conferencia.ts` (grupos, escopo, ocultar/selo, flags)                                                                                    |
| Contrato da curadoria   | `src/services/analiseAtivos/curadoria/contrato.ts` (estados, limites, prazo, saneador, notificações)                                                                              |
| Tabelas                 | `analise_casos_dado`, `analise_data_reports`, `analise_casos_eventos` (migration aditiva)                                                                                         |
| Fila do curador         | `/admin/curadoria` e `/admin/curadoria/[id]` (`requireAdmin`)                                                                                                                     |
| Job da fila             | `curadoria` (catálogo de jobs; cron 10:55 UTC, depois do `quadro`)                                                                                                                |
| Limites                 | 5 relatos/24 h por usuário, 3/h por usuário × ativo, 1 aberto por usuário × ativo × dado (duplicado = 409 e leva ao existente), 300/24 h no total, 10/min por IP na rota de envio |
| Prazo                   | 5 dias úteis (calendário B3) desde o 1º relato; caso só de regra não tem prazo                                                                                                    |
| Retenção (LGPD)         | texto livre anonimizado 12 meses após o fechamento (`lgpd-retention`); relatos no `/api/profile/export`; exclusão de conta limpa mensagem e fonte                                 |

Mudança de env (`ANALISE_ATIVOS_*`) exige restart.

---

## Passo 1 — Deploy com as flags DESLIGADAS e a v1 ativa

O merge na `main` dispara o pipeline (`infra/deploy.sh` roda `prisma migrate deploy` antes do flip).
A migration `prisma/migrations/20261010000000_analise_ativos_bloco_c` é aditiva e idempotente: só
`CREATE TABLE/INDEX IF NOT EXISTS` (3 tabelas vazias; nenhuma coluna em tabela existente).

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations
          where migration_name like '%analise_ativos_bloco_c%';"
$PSQL -c "\dt analise_casos*"
$PSQL -c "\dt analise_data_reports"
$PSQL -c "select version, \"validFrom\" from scoring_params order by version;"   # esperado: só v1
grep -E '^ANALISE_ATIVOS_REPORTE' $ENVF        # esperado: nada, ou =false
```

Esperado: tela e números idênticos aos de antes (regressão v1). Menu ⋯ dos blocos não aparece
(sem flag e com a v1, não há item a mostrar).

## Passo 2 — Dry-run da v2 em prod (sem gravar a v2) **[OK]**

```bash
rodar scripts/analise-ativos/recalcular-analise.ts --etapas=derivados,scores --tudo --versao-params=2
```

Comparar o relatório por regra com `regras_sanidade` da spec (medição do dev). Atenção a R4
(preço esporádico, piso de P/VP 0,25 + 2º sinal) e ao CACR11 (só existe em prod). Se uma regra
bloqueante passar de 3% do Quadro de uma classe, **recalibrar** (nova versão do código da v2) antes
de seguir.

R2 (`historico:escala_ano`) usa como régua os anos com P/VP ≥ `pvpMin` quando a série mistura anos
plausíveis e anos com P/VP ∈ (0; `pvpMin`): no dev (03/10) isso muda só CBAV3 (marca 2021/2024/2025,
não mais 2022/2023) e LAND3 (marca 2022–2025, não mais 2021) — 28 → 32 linhas anuais marcadas.

## Passo 3 — Gravar a v2 **[OK]**

```bash
rodar scripts/analise-ativos/seed-scoring-params.ts --versao=2            # dry-run
rodar scripts/analise-ativos/seed-scoring-params.ts --versao=2 --apply    # validFrom = agora → ATIVA
```

O seed nunca altera versão existente. `--valido-a-partir=AAAA-MM-DD` grava com validFrom futuro
(fica inativa até a data).

## Passo 4 — Recalcular e conferir

```bash
cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=384 \
  node --env-file="$ENVF" --import tsx scripts/analise-ativos/recalcular-analise.ts \
  --etapas=derivados,scores --tudo --apply
sudo /usr/local/bin/myfinance-job.sh quadro
sudo /usr/local/bin/myfinance-job.sh curadoria
$PSQL -c "select classe, \"estadoIndice\", count(*) from analise_quadro_linhas
          where \"noQuadro\" group by 1,2 order by 1,2;"
```

Telas (como admin): SBSP3, CBAV3, HAPV3, VAMO3, GSRF11, APXU11, WEGE3, PETR4, ITUB4, HGLG11, XPLG11,
KNCR11 e MXRF11. Conferir que o DY em conferência por proventos CONTINUA visível com selo.

## Passo 5 — Cron da curadoria

```bash
echo '55 10 * * * root /usr/local/bin/myfinance-job.sh curadoria' | sudo tee -a /etc/cron.d/myfinance
```

(e no template `infra/modules/lightsail/provision.sh.tftpl`, fatia C). O `lgpd-retention` já roda
semanalmente.

## Passo 6 — Ligar o botão de relato **[OK]**

```bash
echo 'ANALISE_ATIVOS_REPORTE_HABILITADO=true' | sudo tee -a $ENVF && sudo systemctl restart myfinance
```

Com o beta vazio, só admins veem. Teste ponta a ponta com 2 admins: relato → sino → assumir →
decidir → sino/push do autor → Meus relatos. Abertura ao beta junto com a revisão dos textos pelo
jurídico **[OK]**.

## Rollback

- Regras: v3 = v2 com `ligada=false`, depois
  `recalcular-analise --etapas=derivados,scores --tudo --apply` + `myfinance-job.sh quadro`. A etapa
  **derivados** é obrigatória: as flags `conf:historico:escala_ano@<ano>` moram em
  `asset_multiples_yearly` e só são regravadas (sem `conf:`) por ela — só com `scores` os chips dos
  anos históricos continuariam na página. Conferir depois:
  `select count(*) from asset_multiples_yearly where exists (select 1 from unnest(flags) f where f like 'conf:%')`
  = 0. O job `curadoria` já ignora as flags anuais com a conferência desligada.
- Botão: remover `ANALISE_ATIVOS_REPORTE_HABILITADO` do `$ENVF` + restart.
- Tabelas ficam (aditivas).

---

## Só DEV (Neon) — nunca em produção

- Migration aplicada no dev com `npx tsx --env-file=.env scripts/analise-ativos/apply-migration-bloco-c.ts --apply`
  (o dev tem drift; nada de `prisma migrate dev/deploy` lá) + `npx prisma generate`. Rodar de novo
  não muda nada.
- Servidor de dev com a área e o relato ligados:
  `ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta ANALISE_ATIVOS_REPORTE_HABILITADO=true npm run dev`.
- Usuários: `usuario.demo@finapp.local` / `123456` (no beta) e `consultor.demo@finapp.local` /
  `123456`. Admin: o banco de dev já tem `admin@appmyfinance.com.br` (senha com o Wellington).
- **Admin de dev/CI (SÓ DEV/CI):** `admin.demo@finapp.local` / `123456`, criado por
  `prisma/seedAdminDev.ts` — no CI pelo seed (`SEED_ADMIN_DEV=1` no job de e2e) e no dev, se
  precisar, com `npx tsx --env-file=.env prisma/seedAdminDev.ts --apply`. O script recusa qualquer
  banco que não seja o Neon de dev ou o `sfc_test` do CI.
- A v2 **não** é gravada no dev por padrão (a v1 continua a ativa). Para testar as regras sem gravar:
  `--versao-params=2` no `recalcular-analise` (fatia A).
- Relatos e casos criados em teste manual no dev devem ser apagados ao final.
