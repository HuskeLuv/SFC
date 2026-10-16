# ATIVAÇÃO — Análise de Ativos, bloco 1 (Salvos, filtros salvos, comparações, PDF e alertas) em produção (Lightsail)

> Bloco 1 = Salvos (listas com nome, Salvar no ativo e no Quadro, página `/analise-ativos/salvos`),
> Filtros salvos no Quadro, Salvar comparação + Exportar PDF no Comparador e os avisos das listas
> (job diário `alertas-salvos`, sino + push na categoria `analise`, aba Salvos › Alertas). Todo passo
> marcado **[OK]** é humano, com OK explícito do Wellington. Desenho (fonte da verdade):
> `docs/analise-ativos/bloco1-salvos/desenho.json` → `arquitetura`. Decisões: `decisoes.md`.

Convenções (iguais às do bloco D, `docs/analise-ativos/blocoD/ATIVACAO.md`):

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 node --env-file="$ENVF" --import tsx "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

## REGRA

- **Com as 3 flags novas desligadas a tela fica IDÊNTICA à de hoje**: sem pílula Salvos, sem botão
  Salvar, sem Filtros salvos, sem Exportar PDF; `/analise-ativos/salvos` dá a página de não
  encontrado; as rotas `/api/analise-ativos/{listas,salvos,filtros,comparacoes,comparacao-pdf,alertas}`
  respondem 404; o job `alertas-salvos` termina `pulado`; a linha "Análise de Ativos" não aparece em
  Perfil › Notificações (`analiseVisivel=false`).
- Tudo só vale com a área liberada (`ANALISE_ATIVOS_HABILITADA` + beta/admin).
- Dependências (aplicadas no código, `acessoAnalise.FLAG_RECURSO`): `ALERTAS` exige `SALVOS`; `PDF`
  exige `COMPARADOR`. "Salvar comparação" e "Comparações salvas" = `SALVOS && COMPARADOR` (sem flag
  própria).
- Ordem de ligar: **SALVOS → PDF → ALERTAS**, um por vez, com [OK] a cada passo. O PDF só entra
  com o COMPARADOR ligado (em prod desde 16/10/2026, sem o jurídico, junto com CENARIOS; conferir o
  `$ENVF` antes). Se estiver desligado, o R2 fica para depois e o R3 (ALERTAS) pode seguir.
- Listas, filtros, comparações e avisos são PESSOAIS: consultor agindo pelo cliente vê vazio
  (`podeSalvar=false`), mutações 403. O PDF continua liberado (não leva nome, e-mail nem posição).
- Nenhuma rota nem o job chamam terceiros: só o banco.
- **PRÉ-REQUISITO separado e anterior**: o PR de LGPD que apaga `AnaliseTese` e `AnaliseCenario` no
  `DELETE /api/profile` (a exclusão de conta anonimiza o User e o cascade não roda).

## Onde fica cada coisa

| O quê                   | Onde                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salvos + filtros salvos | `ANALISE_ATIVOS_SALVOS_HABILITADO=true` em `$ENVF` + restart                                                                                                                                                                       |
| Exportar PDF            | `ANALISE_ATIVOS_PDF_HABILITADO=true` (exige `ANALISE_ATIVOS_COMPARADOR_HABILITADO=true`) + restart                                                                                                                                 |
| Avisos das listas       | `ANALISE_ATIVOS_ALERTAS_HABILITADO=true` (exige SALVOS) + restart + linha de cron do job                                                                                                                                           |
| Flags (código)          | `src/lib/analiseAtivosConfig.ts`; `/config` devolve `recursos.{salvos,alertas,pdfComparador}`                                                                                                                                      |
| Tabelas                 | `analise_listas`, `analise_lista_itens`, `analise_filtros_salvos`, `analise_comparacoes`, `analise_alerta_envios`, `analise_alerta_marcos` + coluna `push_preferencias.analise` (migration `20261017000000_analise_ativos_salvos`) |
| Job                     | `alertas-salvos` (`src/services/analiseAtivos/alertas/executarAlertasSalvos.ts`), 11:10 UTC = 08:10 BRT, via `myfinance-job.sh`                                                                                                    |
| Avisos (dados)          | `Notification` com `type='analise_ativos_salvos_alerta'` + `analise_alerta_envios` (dedupe) + `analise_alerta_marcos` (estado global por ativo)                                                                                    |
| Push                    | categoria `analise` (`src/lib/push/contract.ts`), TTL 1 dia, corpo genérico, gate `push_preferencias.analise` (sem registro = ligado)                                                                                              |
| Limite do PDF           | 10/h por usuário em memória (`getTtlCache`): **zera no restart** (aceitável numa instância só) + balde de 10/min por IP no middleware                                                                                              |
| Retenção                | 90 dias para envios e avisos: o próprio job e o `lgpd-retention` (domingo 05:00 UTC)                                                                                                                                               |
| LGPD                    | `/api/profile/export` traz listas, itens, filtros, comparações e avisos enviados (90 dias); `DELETE /api/profile` apaga tudo + as Notification do type                                                                             |

Mudança de env (`ANALISE_ATIVOS_*`) exige restart.

### Os 3 avisos (neutros)

1. **Resultado entregue à CVM** (ligado por padrão): ações por `asset_eventos` (`tipo='resultado'`,
   `estimado=false`, `fetchedAt` ≤ 3 dias **e** entrega ≥ hoje − 7), 1 por companhia
   (`PETR3/PETR4: resultado do 3T26`); FIIs por informe trimestral novo em `fii_quarterly` contra o
   marco (`HGLG11: informe trimestral publicado na CVM`).
2. **Provento anunciado (data-com)** (ligado por padrão): linha nova em `asset_dividend_history`
   (`createdAt` ≤ 3 dias) com data-com real ≥ hoje. Ativo com posição na Carteira do usuário fica de
   fora (a Agenda já avisa).
3. **Mudança na contagem de critérios, 5 anos** (desligado por padrão): `criteria_eval` janela 5
   contra o marco `criterios:5`. 1ª vez, troca de `paramsVersion` e troca de aplicáveis são
   silenciosas.

Anti-spam: unique `(userId, tipo, chave)` com `createMany skipDuplicates`; mesmo ativo em 2 listas =
1 aviso; mais de 5 no dia = 1 resumo "Novidades em N ativos dos seus Salvos". Fora: aviso de preço e
"provento pago".

---

## Validado na integração (16/10/2026, banco local do Docker)

- Branch `feat/analise-ativos-bloco1-salvos` com as fatias 0, A, B, C e D: `tsc`, `npm run lint`,
  vitest dos 37 arquivos de teste tocados (466 testes), `rm -rf .next && npm run build` e
  `next start` com as 3 flags ligadas.
- API de ponta a ponta com `usuario.demo`: Salvar com 0 listas cria "Salvos", 1 lista alterna,
  `listas/[id]` por classe, PATCH dos alertas da lista, filtros, comparações, PDF (`application/pdf`
  no `next start`, ou seja, `serverExternalPackages` + TTF no bundle OK), `/alertas` e `/alertas/lidos`.
  Usuário fora do beta: 404 em todas as rotas novas.
- Tela no computador (1440) e no celular (390): marcador do Quadro, Filtros salvos, Salvar no ativo +
  "Salvo em", Salvos (listas, abas, ×), Salvos › Alertas, Salvar comparação, Comparações salvas e
  Baixar PDF (download `comparacao-acoes-WEGE3-ITUB4-<data>.pdf`). Sem erro de console nem 4xx/5xx.
- e2e: `e2e/analise-ativos-salvos.escrita.spec.ts` (grava e desfaz) cobre Quadro → ativo → Salvos →
  Alertas → Comparador; `analise-ativos-comparador.spec.ts` passou a aceitar Salvar comparação e
  Exportar PDF quando `config.recursos` os liga.
- Não validado aqui: consultor agindo por cliente na tela (coberto nos testes de rota), PDF no PWA
  iOS/Android em aparelho real (QA do Pedro) e o job `alertas-salvos` com dados reais (R3.2).

## R0 — Deploy com as flags DESLIGADAS

O merge na `main` dispara o pipeline (`infra/deploy.sh` roda `prisma migrate deploy` antes do flip).
A migration `prisma/migrations/20261017000000_analise_ativos_salvos` é aditiva e idempotente:
`CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS ... DEFAULT true` e as FKs em blocos
`DO $$ … EXCEPTION WHEN duplicate_object`. Nenhuma linha existente muda; sem backfill.

Conferência (só leitura):

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations
          where migration_name like '%analise_ativos_salvos%';"
$PSQL -c "\d analise_listas"            # unique (userId, nomeNormalizado), índice (userId, createdAt), FK → "User"
$PSQL -c "\d analise_alerta_envios"     # unique (userId, tipo, chave), índices (userId, createdAt) e (createdAt)
$PSQL -c "\d push_preferencias"         # coluna analise boolean not null default true
$PSQL -c "select (select count(*) from analise_listas) listas, (select count(*) from analise_alerta_envios) envios,
                 (select count(*) from analise_alerta_marcos) marcos;"   # esperado: 0 | 0 | 0
grep -E '^ANALISE_ATIVOS_(SALVOS|ALERTAS|PDF)' $ENVF                    # esperado: nada, ou =false
```

Esperado: nada muda na tela. `/analise-ativos/salvos` mostra a página de não encontrado.

## R1 — Ligar SALVOS **[OK]**

```bash
echo 'ANALISE_ATIVOS_SALVOS_HABILITADO=true' | sudo tee -a $ENVF && sudo systemctl restart myfinance
```

QA com admin (beta vazio = só admins), no computador e no celular, **em conta de teste**:

1. Criar, renomear e apagar lista (nome repetido → erro inline; 21ª lista → aviso do limite).
2. Salvar com 0 listas (cria "Salvos" e o toast "**WEGE3** salvo em **Salvos**"), com 1 (alterna) e
   com 2+ ("Salvar em…"); Desfazer no toast.
3. "Salvo ✓" no cabeçalho do ativo e no marcador da linha/cartão do Quadro.
4. Página Salvos em Ações e FIIs; "Adicionado em"; "×" com Desfazer; "Fora do Quadro".
5. Filtros salvos (`?filtro=<id>`, "Salvar alterações" / "Salvar como novo", apagar com confirmação).
6. `/api/profile/export` traz `listas`, `filtrosSalvos` e `comparacoes`.
7. Consultor agindo: Salvos vazio com a mensagem do protótipo, botões desabilitados, mutações 403.

Desfazer o QA (apagar as listas e os filtros de teste pela tela). Conferência (só leitura):

```bash
$PSQL -c "select \"userId\", nome, \"createdAt\" from analise_listas order by \"createdAt\" desc limit 20;"
$PSQL -c "select count(*) itens, count(distinct \"userId\") usuarios from analise_lista_itens;"
$PSQL -c "select \"userId\", classe, nome from analise_filtros_salvos order by \"updatedAt\" desc limit 20;"
```

## R2 — Ligar o PDF **[OK]** (só com o COMPARADOR ligado e o OK do jurídico ao texto do PDF)

Antes do merge, já validado: `npm run build && npm run start` local gerando o PDF (o pdfkit precisa
de `serverExternalPackages` e da fonte TTF no bundle; se faltar, só falha em produção).

```bash
grep -E '^ANALISE_ATIVOS_COMPARADOR_HABILITADO=true' $ENVF || echo 'COMPARADOR desligado: pular o R2'
echo 'ANALISE_ATIVOS_PDF_HABILITADO=true' | sudo tee -a $ENVF && sudo systemctl restart myfinance
```

Conferir: "Exportar PDF" no Comparador (Ações e FIIs) baixa
`comparacao-acoes-WEGE3-BBAS3-<AAAA-MM-DD>.pdf`; aviso legal em toda página; sem nome, e-mail nem
posição; 11º PDF na mesma hora → mensagem do limite. iPhone com o app instalado: o 1º toque pode
virar "Compartilhar PDF" (o 2º toque abre a folha). "Salvar comparação" e "Comparações salvas"
(SALVOS && COMPARADOR) reabrem a comparação e recalculam com os dados do dia.

```bash
$PSQL -c "select \"userId\", nome, classe, tickers, janela from analise_comparacoes order by \"updatedAt\" desc limit 20;"
```

Lembrete: o limite de 10 PDFs/h por usuário fica em memória e **zera no restart**.

## R3 — Ligar os ALERTAS **[OK]**

### R3.1 — Linha de cron (backup antes)

O template (`infra/modules/lightsail/provision.sh.tftpl`) só vale para provisionamento novo: em
produção a linha vai à mão.

```bash
sudo cp /etc/cron.d/myfinance /root/myfinance.cron.bak.$(date +%F)
echo '# Análise de Ativos (bloco 1) — avisos das listas dos Salvos (08:10 BRT), depois da curadoria
10 11 * * * root /usr/local/bin/myfinance-job.sh alertas-salvos' | sudo tee -a /etc/cron.d/myfinance
sudo grep -n 'alertas-salvos' /etc/cron.d/myfinance
```

Com a flag ainda desligada, a rodada das 11:10 fecha como `pulado` (sem gravar nada).

### R3.2 — Dry-run read-only **[OK]**

`--sem-aplicar` lê o banco e relata, sem gravar avisos, envios nem marcos. Precisa da flag no
processo (não no app): passar só para este comando.

```bash
cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=256 MALLOC_ARENA_MAX=2 \
  ANALISE_ATIVOS_SALVOS_HABILITADO=true ANALISE_ATIVOS_ALERTAS_HABILITADO=true \
  nice -n 10 node --env-file="$ENVF" --import tsx scripts/analise-ativos/rodar-job.ts alertas-salvos --sem-aplicar
$PSQL -c "select inicio, status, \"duracaoMs\", \"rssPicoMb\", detalhes from analise_job_runs
          where job = 'alertas-salvos' order by inicio desc limit 3;"
grep -cE '^(VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|WEB_PUSH_HABILITADO=true)' $ENVF   # esperado: 3
```

Conferir em `detalhes`: `usuarios`, `pulados` (sem acesso), `fatos`, `avisos`, `resumos`. Na 1ª
rodada `marcos` é grande (todo o Quadro) e os avisos de critérios/informe de FII são 0 (1ª vez é
silenciosa). Medido no banco local (16/10/2026): 1.000 usuários × 50 ativos, 3.000 avisos, **2,8 s**
(4,0 s com heap de 256 MB), pico de RSS 334 MB; segunda rodada sem avisos novos, 2,7 s. Volume
real de proventos/dia: medir no DEV quando o Neon voltar.

### R3.3 — Ligar

```bash
echo 'ANALISE_ATIVOS_ALERTAS_HABILITADO=true' | sudo tee -a $ENVF && sudo systemctl restart myfinance
```

Acompanhar **2 rodadas** (dois dias seguidos):

```bash
$PSQL -c "select inicio, status, \"duracaoMs\", \"rssPicoMb\", detalhes from analise_job_runs
          where job = 'alertas-salvos' order by inicio desc limit 5;"
$PSQL -c "select tipo, count(*) from analise_alerta_envios where \"createdAt\" > now() - interval '1 day' group by tipo;"
$PSQL -c "select tipo, count(*) from analise_alerta_marcos group by tipo;"
$PSQL -c "select date_trunc('day', \"createdAt\") dia, count(*), count(\"readAt\") lidos
          from \"Notification\" where type = 'analise_ativos_salvos_alerta' group by 1 order by 1 desc limit 7;"
# a 2ª rodada no mesmo dia não pode duplicar: nenhuma chave repetida
$PSQL -c "select \"userId\", tipo, chave, count(*) from analise_alerta_envios group by 1,2,3 having count(*) > 1;"
```

QA na tela (admin): sino com o aviso (toque abre a página do ativo); Salvos › Alertas com o dia,
as abas Ações · FIIs, "Marcar todos como lidos"; "Alertas da lista" (3 interruptores; critérios
desligado por padrão); Perfil › Notificações com a linha "Análise de Ativos: avisos das suas
listas"; push num aparelho real (título + "Toque para ver os detalhes na Análise de Ativos.", sem
valores). Desligar a linha no Perfil → o aviso seguinte chega só no sino e na aba. Consultor agindo:
aba vazia, sem "Marcar todos".

Disparo manual (fora do horário), se precisar: `curl -m 300 -H "Authorization: Bearer $CRON_SECRET"
https://<host>/api/cron/analise-ativos/alertas-salvos` (mesma lógica, roda no processo do app).

## Rollback

- Por recurso: remover a linha da flag do `$ENVF` + `sudo systemctl restart myfinance`. A UI volta à
  de hoje e as APIs dão 404. ALERTAS desligado: o job passa a fechar `pulado`.
- Cron: comentar a linha `alertas-salvos` em `/etc/cron.d/myfinance` (ou restaurar
  `/root/myfinance.cron.bak.<data>`).
- As tabelas ficam (migration aditiva): listas, filtros, comparações e avisos do usuário são
  preservados para quando religar. Os avisos já entregues seguem no sino até a retenção de 90 dias.
- Desligar só o push dos avisos sem tirar o sino: não há flag própria; o usuário desliga a linha
  "Análise de Ativos" no Perfil. Em último caso, desligar ALERTAS.

Registrar cada passo feito em produção na memória (regra do projeto).

---

## Só DEV / local — nunca em produção

- O Neon do DEV está sem cota (16/10/2026): validação no Postgres local do Docker
  (`DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sfc_test?schema=public"`), com
  `npx prisma migrate deploy` + `npx prisma generate` + reiniciar o dev server.
- Dev server com tudo ligado: `ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_ACESSO=beta
ANALISE_ATIVOS_COMPARADOR_HABILITADO=true ANALISE_ATIVOS_SALVOS_HABILITADO=true
ANALISE_ATIVOS_ALERTAS_HABILITADO=true ANALISE_ATIVOS_PDF_HABILITADO=true npx next dev`.
- Job no banco local: `DATABASE_URL=… ANALISE_ATIVOS_HABILITADA=true ANALISE_ATIVOS_SALVOS_HABILITADO=true
ANALISE_ATIVOS_ALERTAS_HABILITADO=true npx tsx scripts/analise-ativos/rodar-job.ts alertas-salvos
[--sem-aplicar]`. Para gerar avisos de teste: um `asset_eventos` real e recente, uma linha nova em
  `asset_dividend_history` com data-com futura e um marco "de ontem" em `analise_alerta_marcos`;
  apagar tudo ao final (listas, envios, Notification do type, marcos, as linhas inseridas e os runs).
- e2e: no CI as flags ficam ligadas no job de e2e (`.github/workflows/ci.yml`). O que grava vai em
  `*.escrita.spec.ts` e desfaz o que gravou.
- Usuários: `admin.demo@finapp.local`, `usuario.demo@finapp.local` (no beta),
  `consultor.demo@finapp.local` — senha `123456`.
