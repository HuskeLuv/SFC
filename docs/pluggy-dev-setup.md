# Pluggy — receita de dev e de produção (set/2026)

> **Estado em 25/09/2026: LIGADO EM PRODUÇÃO** (contratação feita, textos legais aprovados; ver
> [Produção](#produção-ligado-em-25092026)). Em dev continua desligado por padrão e usa a aplicação
> de desenvolvimento/sandbox. As seções por fase abaixo registram como a integração foi montada.

## O que já existe no código

| Peça                | Onde                                      | Comportamento                                                                                                                                                                              |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Config (Edge-safe)  | `src/lib/pluggyConfig.ts`                 | lê `PLUGGY_*`; `pluggyHabilitado()` exige flag + as duas credenciais                                                                                                                       |
| Cliente do SDK      | `src/lib/pluggy.ts`                       | singleton de `pluggy-sdk` (API key de 2 h renovada pelo SDK); só em rotas Node                                                                                                             |
| Receptor de webhook | `POST /api/webhooks/pluggy`               | 404 desligado; exige header `X-Webhook-Secret` = `PLUGGY_WEBHOOK_SECRET`; em produção exige origem `52.67.145.81`; valida JSON e **só registra no log** (gravação em tabela vem na Fase 2) |
| Status              | `GET /api/pluggy/status` (admin)          | mostra flag/credenciais/segredo e valida as credenciais listando conectores                                                                                                                |
| Middleware          | `src/middleware.ts`                       | `/api/webhooks/*` fora do JWT e do CSRF; hosts do Pluggy Connect na CSP **só quando ligado**                                                                                               |
| Variáveis           | `.env.example`, `.env` (local, desligado) | ver abaixo                                                                                                                                                                                 |

Pacote instalado: `pluggy-sdk@0.90.0` (Node ≥ 12, `got` + `jsonwebtoken`). O widget
(`react-pluggy-connect` 2.12 + `pluggy-connect-sdk` 2.14) **não** foi instalado ainda; entra com a
tela de Conexões.

## Fase 2a — ledger, fila e API (branch `feat/pluggy-fase2-ledger`, 14/09/2026)

| Peça                                                              | Onde                                                                                                                                                                                      | Comportamento                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelo                                                            | `prisma/schema.prisma` → `bank_connections`, `bank_accounts`, `bank_transactions`, `pluggy_webhook_events`                                                                                | migration `20260914180000_add_pluggy_bank_ledger`; no dev (drift) aplicar com `npx tsx --env-file=.env scripts/apply-pluggy-migration.ts`; em prod o deploy roda `prisma migrate deploy`                                                                                                                                   |
| Sync                                                              | `src/services/pluggy/sync.ts`                                                                                                                                                             | `registrarConexao` (recusa item de outro `clientUserId`), `sincronizarConexao` (12 meses na 1ª carga, depois janela de 7 dias; cursor; reconciliação marca `deletedAt`), `atualizarManualmente` (PATCH com cooldown 6 h), `excluirConexao` (apaga no Pluggy + cascade), `processarEventosPendentes`, `reconciliarConexoes` |
| Webhook                                                           | `POST /api/webhooks/pluggy`                                                                                                                                                               | agora **enfileira** em `pluggy_webhook_events` e responde                                                                                                                                                                                                                                                                  |
| Cron                                                              | `GET /api/cron/pluggy-sync` (a cada 5 min) e `?diario=1` (08:30)                                                                                                                          | processa a fila (20 por rodada, 3 tentativas) e reconcilia conexões sem sync há 20 h. Linhas em `provision.sh.tftpl`; **na Lightsail aplicar à mão** em `/etc/cron.d/myfinance` (user_data tem `ignore_changes`)                                                                                                           |
| API (só o próprio usuário; consultor por impersonação recebe 403) | `POST /api/pluggy/connect-token` · `GET/POST /api/pluggy/connections` · `DELETE /api/pluggy/connections/[id]` · `POST /api/pluggy/connections/[id]/sync` · `GET /api/pluggy/transactions` | connect token amarrado ao `clientUserId` = id do usuário                                                                                                                                                                                                                                                                   |

Validado em 14/09 contra o sandbox: item `user-ok` registrado para o admin de dev em 4,3 s (2 contas, 41 transações, categorias em inglês), 2ª rodada via fila sem duplicar.

**Gotchas do SDK 0.90.0:** `fetchTransactions` por página devolve **410** para contas criadas após jun/2026 → usar `fetchTransactionsCursor`/`fetchAllTransactions` (sem `pageSize`); datas chegam como `Date`; `fetchBills` não existe (REST `GET /bills?accountId=`); `GET /v2/items` é opt-in (desligado por padrão) — não dá para listar itens da conta.

## Fase 2c — Caixa de entrada → Fluxo de Caixa (branch `feat/pluggy-fase2-fluxo`, 14/09/2026)

| Peça               | Onde                                                                                                                                                                          | Comportamento                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapa de categorias | `src/services/pluggy/categorias.ts`                                                                                                                                           | categoria do Pluggy (inglês) → caminho + item do template FLC; `transferencia` (conta própria/fatura) e `investimento` (Carteira é a fonte) sugerem ignorar; `Transfer - PIX`/`Other` ficam sem sugestão. **Validar com o Pedro.**                                                            |
| Serviço            | `src/services/pluggy/caixaEntrada.ts`                                                                                                                                         | `listarPendentes` (sugestão resolvida na árvore do usuário), `aplicar` (personaliza template → override, recusa grupo Investimentos), `desaplicar`, `ignorar`, `recomputarCelula` (célula = Σ \|valor\| das transações aplicadas no mês UTC; zero apaga a célula; cor/comentário preservados) |
| Modelo             | `bank_transactions.cashflowItemId` (FK SetNull) + `appliedAt` — migration `20260914200000_bank_transaction_cashflow_link` (script `apply-pluggy-migration.ts` aplica as duas) |
| API                | `GET /api/pluggy/caixa-entrada` · `POST …/aplicar {aplicacoes:[{id,itemId}]}` · `POST …/ignorar {ids}` · `POST …/desaplicar {ids}`                                            | tudo com histórico (`banco.aplicar/ignorar/desaplicar`) e **desfazer** (`undo/handlers/bancoImportacao.ts`)                                                                                                                                                                                   |
| Tela               | seção "Caixa de entrada" em `/conexoes-bancarias` (`CaixaEntrada.tsx`)                                                                                                        | seletor pré-preenchido com a sugestão, "Lançar sugeridas", "Ignorar transferências", marcação em lote; extrato mostra "no fluxo · tirar"                                                                                                                                                      |

Validado em 14/09 no Neon com o sandbox: 41 pendentes → 35 com sugestão resolvida, 4 transferências, 2 sem sugestão; aplicar criou 30 células (ex.: Salário set/2026 = 8.500; Netflix + Spotify somados em Lazer › Outros); desaplicar zerou tudo. O template do fluxo (22 grupos, 134 itens) é idêntico em dev e prod.

Regras conhecidas/limitações: mês de competência = data da transação (fatura por vencimento fica para depois); a célula vira "propriedade" da conta conectada — digitação manual no mesmo mês é sobrescrita no próximo recomputo.

## Fase 3 — investimentos e empréstimos entram sozinhos (branch `feat/pluggy-fase3-investimentos-dividas`, 14/09/2026)

| Peça          | Onde                                                                                                                                   | Comportamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Espelho       | `bank_investments`, `bank_loans` (migration `20260915100000_bank_investments_loans`)                                                   | posição como o provedor devolve + vínculo (`assetId/portfolioId/fixedIncomeAssetId`, `dividaId`) + `importStatus` (pendente / importado / vinculado / ignorado / sem-suporte / erro). Sumiu no banco → `ativo=false` (vínculo fica)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Sync          | `sincronizarPosicoes` em `sync.ts` (best-effort, não derruba contas) → `importarPendentes` + `atualizarImportados`                     | roda em todo sync (registro, webhook, reconciliação)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Importação    | `src/services/pluggy/importarCarteira.ts`                                                                                              | **ação/FII/ETF/BDR** pelo ticker no catálogo (já tem na Carteira → só vincula) com compra + `recalculatePortfolioFromTransactions`; **RF bancária** (CDB/LCI/LCA/RDB/LC/LF/CRI/CRA/LIG) → Asset `bond` `source=pluggy` + FixedIncomeAsset na curva (tipo por subtipo + indexador; % do CDI em `indexerPercent`; IPCA = híbrido; LCI/LCA/CRI/CRA/LIG isentos; vencimento inválido → +10 anos); **fundo/previdência** pelo CNPJ no catálogo CVM, senão ativo manual (`fund`/`previdencia`) cujo `currentPrice` segue o saldo do banco a cada sync; **empréstimo** → `Divida` financiamento (tipo pelo `type`, taxa a.a.→a.m., prazo por parcelas ou datas, SAC/PRICE, indexador, 1º vencimento) + linha-espelho no fluxo; saldo zero → quitada. COE/Tesouro/ticker fora do catálogo → `sem-suporte` |
| Consentimento | `connect-token`                                                                                                                        | produtos agora incluem INVESTMENTS, INVESTMENTS_TRANSACTIONS e LOANS (conexões antigas precisam reconectar para liberar)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| API/Tela      | `GET /api/pluggy/carteira`, `POST …/importar`, `POST …/ignorar`; seção "Investimentos e empréstimos do banco" em `/conexoes-bancarias` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Validado no Neon com o sandbox: 8 investimentos → 7 importados (ETF ISUS11, FII GGRC11, CDB 150% CDI, 2 fundos, 2 previdências), 1 ignorado (BOVA11 encerrado); consignado → dívida SAC 120 parcelas com 120 células no fluxo; 2ª rodada não duplica.

Limitações: sem entradas no Histórico/desfazer para as importações (follow-up); movimentações (compra/venda/dividendos) do provedor ainda não viram transações — a posição entra como uma compra na data da posição.

## Banco conectado duas vezes — proteção em três camadas (14/09/2026)

| Camada        | Onde                  | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro      | `registrarConexao`    | compara as contas do item novo com as do usuário no mesmo banco por `chaveConta` (banco + nº mascarado; fallback tipo+nome). **Todas repetidas** → reconexão: a conexão existente passa a apontar para o item novo, as contas trocam só o id do provedor, o item antigo é apagado no Pluggy; resposta 200 com `reaproveitada:true`. **Parte repetida** → conexão nova, contas repetidas entram `ativa=false` (sem importar transações). |
| Sincronização | `sincronizarConexao`  | id trocado no provedor: a linha com o mesmo `dedupHash` (conta local + data + valor + descrição) **adota** o id novo (nada de cópia + removida). Transação com o mesmo `globalHash` (usuário + chave da conta + data + valor + descrição) já existente em **outra conta** do usuário entra com `duplicadaDe` = original e fica fora da Caixa de entrada e das células. Conta `ativa=false` não busca transações.                        |
| Tela          | `/conexoes-bancarias` | aviso após conectar ("banco já estava conectado…" / "N contas ficaram desativadas"), conta "desativada" no card, "duplicada" no extrato, texto orientando a usar Reconectar.                                                                                                                                                                                                                                                            |

Migration `20260914220000_bank_transaction_dedup` (`globalHash`, `duplicadaDe`). Linhas antigas sem `globalHash` são preenchidas no próximo sync.

## Produção (ligado em 25/09/2026)

Pré-requisitos cumpridos: contrato com o Pluggy, Termos de Uso e Aviso de Privacidade dos
advogados publicados (PR #246), textos das telas aprovados (termo v3), migrations já aplicadas
pelo deploy e crons já no servidor (`/etc/cron.d/myfinance`: `/api/cron/pluggy-sync` a cada 5 min
e `?diario=1` às 08:30).

1. **Aplicação de produção no dashboard** — separada da de desenvolvimento. Em _Connect_
   personalizar nome **My Finance**, logo e cores (`#0079F2` = 0,121,242; secundária `#314666` =
   49,70,102). Sem isso o widget mostra "Aplicação demo. Proibido o uso comercial".
2. **Variáveis no servidor** — `ssh -i ~/.ssh/myfinance-lightsail ubuntu@56.125.206.95`,
   `sudo nano /etc/myfinance/app.env`, no formato das demais linhas (sem aspas):
   ```
   PLUGGY_HABILITADO=true
   PLUGGY_CLIENT_ID=<produção>
   PLUGGY_CLIENT_SECRET=<produção>
   PLUGGY_WEBHOOK_SECRET=<openssl rand -hex 32>
   ```
   **Sem** `PLUGGY_INCLUI_SANDBOX`. Depois `sudo systemctl restart myfinance`. A flag é global: o card
   "Conectar banco" aparece para todos os usuários (menos consultor agindo por cliente).
3. **Conferir** — `https://appmyfinance.com.br/api/pluggy/status` logado como admin
   (`habilitado:true`, `credenciaisOk:true`, `incluiSandbox:false`); a CSP de qualquer página passa a
   incluir `connect.pluggy.ai`; `POST /api/webhooks/pluggy` sem o header responde 401.
4. **Webhook** — pela API (o dashboard não aceita header customizado), rodando **no servidor** para
   o segredo não sair de lá:
   ```bash
   set -a; . <(sudo grep '^PLUGGY_' /etc/myfinance/app.env); set +a
   KEY=$(curl -s https://api.pluggy.ai/auth -H 'content-type: application/json' \
     -d "{\"clientId\":\"$PLUGGY_CLIENT_ID\",\"clientSecret\":\"$PLUGGY_CLIENT_SECRET\"}" | jq -r .apiKey)
   curl -s https://api.pluggy.ai/webhooks -H "X-API-KEY: $KEY" -H 'content-type: application/json' \
     -d "{\"event\":\"all\",\"url\":\"https://appmyfinance.com.br/api/webhooks/pluggy\",\"headers\":{\"X-Webhook-Secret\":\"$PLUGGY_WEBHOOK_SECRET\"}}"
   curl -s https://api.pluggy.ai/webhooks -H "X-API-KEY: $KEY"   # conferir: 1 webhook, event=all
   ```
   Cadastrado em 25/09/2026: id `5ea13539-c86b-41e3-98bf-15764643fcf7`. Trocou o
   `PLUGGY_WEBHOOK_SECRET`? Atualizar o header do webhook (`PATCH /webhooks/{id}`) — senão tudo vira 401.
   O Caddy sobrescreve `X-Forwarded-For`, então a trava de IP (`52.67.145.81`) vê a origem real.
5. **Primeira conexão** — conectar uma conta própria e conferir no banco de prod (leitura):
   `open_finance_consentimentos` (status `ativo`, versão atual, marcos com IP), `bank_connections`
   (`UPDATED`/`SUCCESS`), `bank_accounts`/`bank_transactions` e `pluggy_webhook_events` (`done`).
   Validado em 25/09/2026 com o C6 Bank: 118 transações = exatamente o que o Pluggy tinha.

Gotchas vistos na ativação:

- Para comparar com o Pluggy, use `GET /v2/transactions?accountId=…&dateFrom=AAAA-MM-DD` (cursor em
  `next`); o `/transactions` antigo responde **410 deprecated**, e o v2 recusa `from`/`to`/`pageSize`.
- O histórico vem até onde a instituição compartilha (no C6, a última movimentação disponível era
  de dois meses antes) — não é falha do sync.
- `item/deleted` de uma conexão já desconectada fica `pending` e é ignorado sozinho após as
  tentativas; não precisa limpar.
- `consentExpiresAt` pode vir `null` do Pluggy mesmo em conexão Open Finance.

## Passo a passo (dev)

1. **Conta e aplicação no dashboard** — https://dashboard.pluggy.ai → criar a organização → _Applications_ →
   criar uma aplicação **de desenvolvimento** (o dashboard separa dev/prod, inclusive webhooks, desde
   jul/2026). Copiar `Client ID` e `Client Secret`. O trial de 14 dias libera produção real sem cartão;
   depois dele as conexões pausam e os dados ficam 30 dias.
2. **Variáveis no `.env` local** (já há placeholders no fim do arquivo):
   ```
   PLUGGY_HABILITADO="true"
   PLUGGY_CLIENT_ID="..."
   PLUGGY_CLIENT_SECRET="..."
   PLUGGY_WEBHOOK_SECRET="$(openssl rand -hex 32)"
   PLUGGY_INCLUI_SANDBOX="true"
   ```
   Nunca `NEXT_PUBLIC_`. Nunca exportar no shell. No `.env` local vão **só** as credenciais da
   aplicação de desenvolvimento — as de produção ficam apenas no servidor (ver [Produção](#produção-ligado-em-25092026)).
3. **Conferir**: `npm run dev`, logar como `admin@appmyfinance.com.br` e abrir
   `http://localhost:3000/api/pluggy/status`. Esperado:
   `{"habilitado":true,"incluiSandbox":true,"webhookSecretConfigurado":true,"credenciaisOk":true,"conectores":N}`.
   `credenciaisOk:false` com `motivo` "401" = credencial errada; `motivo` com "ENOTFOUND" = sem rede.
4. **Sandbox** — no widget ou via API com `sandbox: true`, o conector _Pluggy Bank_ aceita
   `user-ok` / `password-ok` e MFA `123456`. Outros usuários simulam falhas: `user-locked`,
   `user-unavailable`, `user-connection-error`, `user-error`. Itens de sandbox sem atualização por
   30 dias são apagados.
5. **Webhook local** — o Pluggy só entrega em HTTPS público (localhost não é aceito). Túnel:
   - Cloudflare (sem conta): instalar `cloudflared` (https://pkg.cloudflare.com, pacote `.deb`) e rodar
     `cloudflared tunnel --url http://localhost:3000`; a URL `https://*.trycloudflare.com` muda a
     cada execução.
   - Alternativa sem instalar nada: `npx localtunnel --port 3000` (menos estável).
     Criar o webhook **pela API** (o dashboard não aceita header customizado):
   ```bash
   # API key (2 h)
   KEY=$(curl -s https://api.pluggy.ai/auth -H 'content-type: application/json' \
     -d "{\"clientId\":\"$PLUGGY_CLIENT_ID\",\"clientSecret\":\"$PLUGGY_CLIENT_SECRET\"}" | jq -r .apiKey)
   curl -s https://api.pluggy.ai/webhooks -H "X-API-KEY: $KEY" -H 'content-type: application/json' \
     -d "{\"event\":\"all\",\"url\":\"https://<tunel>/api/webhooks/pluggy\",\"headers\":{\"X-Webhook-Secret\":\"$PLUGGY_WEBHOOK_SECRET\"}}"
   ```
   Teste manual sem o Pluggy:
   ```bash
   curl -s -X POST http://localhost:3000/api/webhooks/pluggy \
     -H 'content-type: application/json' -H "X-Webhook-Secret: $PLUGGY_WEBHOOK_SECRET" \
     -d '{"event":"item/updated","itemId":"teste"}'     # → {"ok":true} e uma linha no log do dev server
   ```
6. **Widget (quando chegar a Fase 2)** — `npm i react-pluggy-connect`; connect token gerado no
   servidor com `getPluggyClient().createConnectToken(undefined, { clientUserId, webhookUrl })`
   (30 min de validade, um por abertura do widget); carregar o componente com `next/dynamic`
   só na tela de Conexões. Se o console acusar bloqueio de CSP, conferir os hosts em
   `PLUGGY_CONNECT_HOSTS` (`src/lib/pluggyConfig.ts`) — mesma prática usada com a VTurb.

## Regras que valem desde já

- **Um item por CPF × instituição** e nunca `PATCH /items` em lote (20/min e proibido pelo Pluggy).
  Os limites mensais do Open Finance (4 listagens de conta, 240 transações recentes, 30 faturas por
  mês por CPF+instituição) são consumidos por item.
- O webhook responde e sai; processamento fica para um cron por minuto (Fase 2), como os demais
  crons em `/etc/cron.d/myfinance`.
- Ao excluir conta/usuário, `deleteItem` no Pluggy (LGPD). O Pluggy aparece em `/subprocessadores`
  com a flag ligada.
- Mudou texto da jornada (`src/lib/openFinanceConsentimento.ts`)? **Versão nova**, nunca editar uma
  publicada: o aceite grava versão + hash (inclusive o selo `provisorio`).

## Referências

- Autenticação e connect token: https://docs.pluggy.ai/docs/authentication
- Webhooks: https://docs.pluggy.ai/docs/webhooks · sandbox: https://docs.pluggy.ai/docs/sandbox
- SDK Node: https://github.com/pluggyai/pluggy-node · widget: https://github.com/pluggyai/pluggy-connect
- Análise e custos: `docs/analise-pluggy-set2026.md` · público-alvo: `docs/analise-pierre-vs-myfinance-set2026.md`
