# ATIVAÇÃO — Análise de Ativos, Fase 1 em produção (Lightsail)

> Fase 1 = telas (Quadro + página do ativo, Ações e FIIs) sobre os dados da Fase 0, atrás de
> `ANALISE_ATIVOS_HABILITADA` e da lista do beta. Todo passo aqui é **humano**, com OK explícito
> do Wellington. Decisões: `docs/analise-ativos/fase1/decisoes.md` (prevalecem sobre a spec).
> Spec: `docs/analise-ativos/fase1/spec-desenho.json` → `arquitetura.plano_producao`.

Convenções (iguais ao RUNBOOK da Fase 0):

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 node --env-file="$ENVF" --import tsx "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

## REGRA

- **Não ligar a flag em prod antes do merge da fatia D** (ela restringe a Agenda a quem tem acesso;
  sem ela, ligar a flag mostraria datas de resultado a todo mundo).
- Ordem de merge: 0a → (0b, A, B, C, D em PRs separados, flag desligada) → QA integrado.
- O acesso é decidido pelo usuário **logado**. Admins (`User.role='admin'`) sempre entram.

## Onde fica cada coisa

| O quê                   | Onde                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Liga a área (+ Agenda)  | `ANALISE_ATIVOS_HABILITADA=true` em `/etc/myfinance/app.env` + restart                       |
| Quem entra              | `ANALISE_ATIVOS_ACESSO=beta` (padrão: lista + admins) ou `todos`                             |
| Selo NOVO no menu       | `ANALISE_ATIVOS_NOVO_ATE=AAAA-MM-DD` (padrão `2026-12-31`)                                   |
| Lista do beta           | tabela `feature_beta_users` (recurso `analise-ativos`), via `scripts/analise-ativos/beta.ts` |
| Bloqueio da página      | layout server de `/analise-ativos` (404 com a flag desligada; tela "beta fechado" fora)      |
| Bloqueio da API         | `exigirAcessoAnalise` → 404 (exceto `/api/analise-ativos/config`, que nunca dá 404)          |
| Menu (sidebar e Mais)   | `GET /api/analise-ativos/config` (`habilitada`), some no modo consultor                      |
| Agenda (resultados/AGO) | só para quem tem acesso (acesso do DONO da agenda); link para `/analise-ativos/<ticker>`     |
| Tese privada            | tabela `analise_teses` (por usuário e ticker); consultor agindo → 403; entra no export LGPD  |

O servidor guarda o acesso de cada usuário por 60 s: mudança na lista do beta vale em até 1 minuto,
sem restart. Mudança de env (`ANALISE_ATIVOS_*`) exige restart.

---

## Passo 1 — Deploy com a flag DESLIGADA

O merge na `main` dispara o pipeline (`infra/deploy.sh` roda `prisma migrate deploy` antes do flip).
A migration `prisma/migrations/20261005000000_analise_ativos_fase1` é aditiva e idempotente: cria
`analise_quadro_linhas`, `analise_teses` e `feature_beta_users` (nenhuma coluna em tabela existente).

Conferir depois do deploy:

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations
          where migration_name like '%analise_ativos_fase1%';"
$PSQL -c "\dt (analise_quadro_linhas|analise_teses|feature_beta_users)"
grep -E '^ANALISE_ATIVOS_' $ENVF        # esperado: nada, ou HABILITADA=false
```

Esperado com a flag desligada: menu sem o item; `/analise-ativos` = 404 do app; qualquer
`/api/analise-ativos/*` = 404 (exceto `/config`, que responde `habilitada:false`); Agenda igual.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/analise-ativos/quadro   # 307 (sem sessão → signin); logado: 404
```

## Passo 2 — Job `quadro` (fatia A)

A máquina atual não recebe mudanças de `user_data` (`ignore_changes`): a linha do cron é manual.

```bash
sudo cp /etc/cron.d/myfinance /root/myfinance.cron.bak.$(date +%F)
echo '40 10 * * * root /usr/local/bin/myfinance-job.sh quadro' | sudo tee -a /etc/cron.d/myfinance
sudo chmod 644 /etc/cron.d/myfinance
sudo /usr/local/bin/myfinance-job.sh quadro && tail -3 /var/log/myfinance-job.log   # 1ª vez à mão
```

Conferir:

```sql
select classe, "noQuadro", "estadoIndice", count(*) from analise_quadro_linhas group by 1,2,3 order by 1,2,3;
select max("geradoEm") from analise_quadro_linhas;                     -- de hoje
select job, status, "duracaoMs", "rssPicoMb", inicio from analise_job_runs
where job = 'quadro' order by inicio desc limit 3;                     -- status ok, RSS < 250 MB
```

## Passo 3 — Conferência de dados em PROD (antes de qualquer usuário)

Símbolos: WEGE3, PETR4, ITUB4, BBAS3, KLBN11, TGMA3, AURE3, HGLG11, XPLG11, KNCR11, MXRF11, HFOF11, HCTR11.

```sql
-- linha do Quadro de cada um: estado do Índice, flags e motivos
select symbol, classe, "noQuadro", "estadoIndice", "indiceMf", flags, "motivosIncompleto",
       "componentesZeroRegra", "precoData", "dy12mPct"
from analise_quadro_linhas
where symbol in ('WEGE3','PETR4','ITUB4','BBAS3','KLBN11','TGMA3','AURE3',
                 'HGLG11','XPLG11','KNCR11','MXRF11','HFOF11','HCTR11')
order by classe, symbol;

-- DPA por ano: provento suspeito (> 2× o ano anterior) tem de aparecer como 'em conferência'
select symbol, "anoFiscal", "dpaDataCom", "dpaAjHoje",
       "dpaAjHoje" / nullif(lag("dpaAjHoje") over (partition by symbol order by "anoFiscal"), 0) as razao
from asset_per_share_yearly
where symbol in ('WEGE3','PETR4','ITUB4','BBAS3','KLBN11','TGMA3','AURE3')
  and "anoFiscal" >= extract(year from now())::int - 4
order by symbol, "anoFiscal";
select symbol, flags from analise_quadro_linhas where 'provento_suspeito' = any(flags) order by 1;

-- datas absurdas (futuro / antes de 1990)
select symbol, "precoData", "dataRef" from analise_quadro_linhas
where "precoData" > current_date or "precoData" < date '1990-01-01'
   or "dataRef" > current_date;

-- contagens do Quadro (ações e FIIs no Quadro × só na busca)
select classe, "noQuadro", "foraDoQuadroMotivo", count(*) from analise_quadro_linhas
group by 1,2,3 order by 1,2,3;
```

Anotar qualquer divergência e decidir com o Wellington antes do Passo 4 (decisão 5: corrigir as
parcelas repetidas da fonte antes de abrir o beta).

## Passo 4 — Admins + flag ligada

1. Lista do beta (opcional nesta etapa — admins já entram):

   ```bash
   rodar scripts/analise-ativos/beta.ts --listar
   rodar scripts/analise-ativos/beta.ts --adicionar pessoa@exemplo.com --motivo interno --por wellington          # dry-run
   rodar scripts/analise-ativos/beta.ts --adicionar pessoa@exemplo.com --motivo interno --por wellington --apply
   ```

2. Flag (backup do env antes):

   ```bash
   sudo cp $ENVF /root/app.env.bak.$(date +%F-%H%M)
   sudo sed -i '/^ANALISE_ATIVOS_HABILITADA=/d;/^ANALISE_ATIVOS_ACESSO=/d' $ENVF
   printf 'ANALISE_ATIVOS_HABILITADA=true\nANALISE_ATIVOS_ACESSO=beta\n' | sudo tee -a $ENVF >/dev/null
   sudo systemctl restart myfinance && systemctl is-active myfinance
   ```

3. Smoke (logado como admin):
   - menu com "Análise de Ativos" + selo NOVO logo abaixo de Carteira; no celular, no painel Mais;
   - `/analise-ativos` e `/analise-ativos/WEGE3` abrem; `Server-Timing` das rotas da área;
     Lighthouse em Slow 4G;
   - varredura de linguagem (nada de "comprar", "recomendação", "nota");
   - **"Na sua carteira" = Carteira**: para um ativo que o admin tem, conferir valor, % da aba,
     objetivo e classe × alvo contra a aba da Carteira (devem ser idênticos);
   - tese: escrever, recarregar, apagar;
   - usuário fora do beta: sem item no menu, sem datas de resultado na Agenda, link direto mostra
     "Área em beta fechado", `/api/analise-ativos/quadro` = 404.

## Passo 5 — Beta interno

~10 usuários internos por 2–3 dias (`beta.ts --adicionar` ou `--arquivo`).

## Passo 6 — Beta fechado

Lista do Wellington (~100 usuários), por 2 semanas:

```bash
rodar scripts/analise-ativos/beta.ts --arquivo /tmp/beta-analise.txt --motivo beta-fechado --por wellington          # dry-run
rodar scripts/analise-ativos/beta.ts --arquivo /tmp/beta-analise.txt --motivo beta-fechado --por wellington --apply
```

Monitorar:

```sql
select job, status, inicio, "rssPicoMb" from analise_job_runs where inicio > now() - interval '2 days' order by inicio desc;
select count(*) teses, count(distinct "userId") autores from analise_teses;
select count(*) from feature_beta_users where recurso = 'analise-ativos';
```

```bash
sudo journalctl -u myfinance --since today | grep -E '/api/analise-ativos/.*(5[0-9][0-9]|429)'
```

## Passo 7 — Público

Só após o parecer jurídico dos textos (`src/services/analiseAtivos/textosTela.ts`):

```bash
sudo sed -i 's/^ANALISE_ATIVOS_ACESSO=.*/ANALISE_ATIVOS_ACESSO=todos/' $ENVF
sudo systemctl restart myfinance
```

O selo NOVO some sozinho depois de `ANALISE_ATIVOS_NOVO_ATE`. A tese continua privada.

---

## Rollback

1. **Imediato, sem perda de dados**: `ANALISE_ATIVOS_HABILITADA=false` (ou apagar a linha) em
   `$ENVF` + `sudo systemctl restart myfinance`. Menu, página, API e Agenda voltam ao estado do
   Passo 1. Teses e lista do beta ficam guardadas.
2. Comentar a linha `quadro` do `/etc/cron.d/myfinance` (ou restaurar `/root/myfinance.cron.bak.*`).
3. Remoção total (só com OK, depois de backup manual — `sudo /usr/local/bin/myfinance-pg-backup.sh`):

   ```sql
   begin;
   drop table if exists analise_teses, feature_beta_users, analise_quadro_linhas;
   delete from _prisma_migrations where migration_name = '20261005000000_analise_ativos_fase1';
   commit;
   ```

   Antes do drop, se houver teses de usuários, exportar (`\copy analise_teses to '/root/teses.csv' csv header`).

## LGPD

- `GET /api/profile/export` inclui `analiseAtivos.teses` do usuário.
- Exclusão de conta: `analise_teses` e `feature_beta_users` têm FK com `ON DELETE CASCADE` para `User`.
- Consultor agindo pelo cliente não lê nem grava tese (API 403); o acesso dele ao overlay da carteira
  do cliente fica registrado (`logSensitiveEndpointAccess`).
