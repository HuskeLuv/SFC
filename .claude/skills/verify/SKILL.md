---
name: verify
description: Receita de verificação runtime deste repo — subir o dev server, autenticar como usuário demo via API (cookies + CSRF) e dirigir páginas com Playwright em WSL.
---

# Verificação runtime (MyFinance)

## Subir e autenticar

```bash
npm run dev &            # ready em ~3s; health: curl localhost:3000/api/health
# login demo → jar de cookies
curl -s -c cookies.txt -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"usuario.demo@finapp.local","password":"123456"}'
# o cookie csrf-token só é setado pelo middleware num GET de PÁGINA (não de API):
curl -s -b cookies.txt -c cookies.txt -o /dev/null localhost:3000/fluxodecaixa
```

Gotchas de autenticação:

- No jar do curl o JWT vem como linha `#HttpOnly_localhost` — parsers que pulam `#` perdem o cookie e todo request dá 307 → /signin.
- TODO método state-changing (PUT/PATCH/POST/**DELETE sem body também!**) exige header `x-csrf-token` = valor do cookie `csrf-token`, senão 403.
- Enums de domínio: sonhos usam `priority` ∈ Alta|Moderado|Baixa (não "Média").

## Dirigir APIs

Requests via python3 + urllib lendo cookies.txt funcionam bem (evita brigas de quoting do zsh com JSON inline). Endpoints úteis: `GET /api/cashflow?year=N`, `PUT /api/cashflow/batch-update`, `GET /api/cashflow/anos`, `GET /api/cashflow/investimentos?year=N`, `POST/PATCH/DELETE /api/planejamento-sonhos[/id]`.

## Dirigir o browser (WSL sem sudo)

`npx playwright install` falha ("does not support ubuntu26.04") e as libs de sistema faltam, mas dá para rodar assim:

```bash
# usar o chromium já em ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome
# baixar libs faltantes SEM sudo e extrair local:
apt-get download libnspr4 libnss3 libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 \
  libcups2t64 libxkbcommon0 libatspi2.0-0t64 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2
for f in *.deb; do dpkg -x "$f" extracted/; done
LD_LIBRARY_PATH=$PWD/extracted/usr/lib/x86_64-linux-gnu node script.mjs
```

No script: `chromium.launch({ executablePath: '<caminho acima>' })`, importar de `/home/huske/dev/front/node_modules/playwright/index.mjs`, injetar os cookies do jar (incluindo os `#HttpOnly_`). A página /fluxodecaixa rola num container interno — `window.scrollTo` no body não rola a tabela; usar `locator.scrollIntoViewIfNeeded()`. Fechar o banner de cookies (botão "Entendi") antes de screenshots.

## Fluxos que valem dirigir

- Fluxo de caixa: editar valor via batch-update 2× seguidas (a 2ª exercita o caminho pós-personalização) e re-GET para conferir persistência + `item.groupId === group.id` em toda a árvore.
- Sonhos ↔ caixa: criar sonho (Em espera → sem projeção), PATCH Iniciado (12 meses projetados), PATCH Pausado (projeção some), DELETE (linha-espelho some).
- `npm run seed` recria os dados do usuário demo (anos = anterior + corrente).
