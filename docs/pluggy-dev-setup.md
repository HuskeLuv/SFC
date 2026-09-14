# Pluggy no ambiente de dev — receita de preparação (set/2026)

> Estado em 14/09/2026: o esqueleto está no código (branch `feat/pluggy-prep`), **desligado por
> padrão**. Nada de modelo de dados ainda: isso é a Fase 2 de `docs/analise-pluggy-set2026.md`.
> Este arquivo é o passo a passo para o dev-server receber a integração.

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

## Passo a passo

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
   Nunca `NEXT_PUBLIC_`. Nunca exportar no shell. Em produção vão para `/etc/myfinance/app.env` na
   Lightsail (mesmo caminho do `ANTHROPIC_API_KEY`) + restart — **não agora**.
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
- Ao excluir conta/usuário, `deleteItem` no Pluggy (LGPD). Adicionar o Pluggy em `/subprocessadores`
  antes de qualquer conexão real de cliente.
- Nada de produção até o parecer jurídico (parceria art. 36, consultor × repasse) — decisão de 02/09.

## Referências

- Autenticação e connect token: https://docs.pluggy.ai/docs/authentication
- Webhooks: https://docs.pluggy.ai/docs/webhooks · sandbox: https://docs.pluggy.ai/docs/sandbox
- SDK Node: https://github.com/pluggyai/pluggy-node · widget: https://github.com/pluggyai/pluggy-connect
- Análise e custos: `docs/analise-pluggy-set2026.md` · público-alvo: `docs/analise-pierre-vs-myfinance-set2026.md`
