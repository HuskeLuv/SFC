# Relatório — Deploy Seguro (Jun/2026)

> Contexto: em 08/06/2026 a rota `/analises` foi pra produção **quebrada**
> (crash de runtime React), e o CI passou mesmo assim. A investigação revelou
> que o gate de CI estava cego pra esse tipo de erro **e** vermelho havia dias.
> Este relatório documenta o que foi feito, **como o novo fluxo funciona** e
> **quais melhorias** de segurança/boas práticas seguem em aberto.

---

## 1. O incidente e a causa-raiz

- **Sintoma:** `/analises` mostrava "Algo deu errado" (ErrorBoundary) pra todos.
- **Causa imediata:** a rota dedicada renderizava `CarteiraAnalise` **fora** do
  `CarteiraResumoProvider`; `RentabilidadeGeral` chamava `useCarteiraResumoContext()`
  sem provider → throw em render. (A mesma tela funciona via `/carteira → aba
  Análise`, que tem o provider — por isso ninguém notou.)
- **Por que o CI não pegou:** `type-check`, `lint` e `build` **não renderizam**
  páginas client protegidas. O crash só aparece executando a página num browser.
- **Causa sistêmica (pior):** o job `quality` estava **vermelho na `main` há dias**
  e ninguém bloqueava. O `tsc --noEmit` rodava no CI **sem** o `next-env.d.ts`
  (gitignored, gerado só pelo `next build`/`dev`), e sem ele os imports de SVG
  (SVGR) perdiam o tipo de componente → falsos erros de `className`. Resultado:
  o "gate" não significava nada; deploys iam por cima via SSM manual.

---

## 2. O que foi entregue (4 camadas)

| Camada | Entrega | Estado |
|---|---|---|
| 1. Smoke de render no CI | Job `e2e` abre cada rota autenticada num browser real e falha se cair no ErrorBoundary/pageerror | ✅ em `main` |
| 2. Deploy atômico + rollback | Releases versionadas + symlink + health-gate + rollback automático | ✅ em prod |
| 3. Staging | Ambiente intermediário antes de prod | ⏳ pendente (precisa DNS) |
| Higiene | branch → PR → CI verde → merge | ✅ adotado |

Correções de base no caminho: `next-env.d.ts` gerado antes do type-check no CI;
teste e2e de login desatualizado reescrito; **vitest removido do gate** (a suíte
pendura >30min no runner — decisão consciente, roda só local).

---

## 3. Como o novo fluxo funciona

### 3.1 Da mudança ao merge (Higiene + CI)

```
branch  →  push  →  PR  →  CI (quality + e2e)  →  verde?  →  merge na main
```

**Job `quality`** (`.github/workflows/ci.yml`): `npm ci` → gera `next-env.d.ts`
→ `type-check` → `lint` → `build`. Pega erros de tipo, lint e compilação.

**Job `e2e`** (o diferencial): sobe um **Postgres efêmero**, roda
`migrate deploy` + `seed`, faz `build`, sobe o app e — com Playwright num
**Chromium real** — visita cada rota autenticada (`e2e/smoke-routes.spec.ts`),
**falhando se a página cair no ErrorBoundary** ("Algo deu errado") ou disparar
um `pageerror`. É exatamente o que teria barrado a `/analises`.

> Regra de processo: não commitar direto na `main`; todo merge passa pelo gate.

### 3.2 Do merge ao prod (Camada 2 — deploy atômico)

Layout em produção (EC2 `i-09099b2b041adcdb6`, sa-east-1):

```
/opt/myfinance/
  releases/<timestamp>-<sha>/   ← cada deploy clona e builda aqui
  current  ->  releases/<...>   ← symlink; o systemd aponta pra cá
```

Disparo: um `aws ssm send-command` roda `infra/bootstrap-deploy.sh` na box, que
chama `infra/deploy.sh`. Passos (a release **antiga continua servindo** até o flip):

```
1. clona main numa release nova            releases/<ts>-<sha>
2. npm ci + prisma generate + BUILD        (na release nova; prod intocada)
3. sobe a release nova na PORTA 3001
   e checa /api/health  ───────────────►  falhou? ABORTA sem tocar em current
4. prisma migrate deploy
5. flip ATÔMICO do symlink current ──►  releases/<nova>   + systemctl restart
6. checa /api/health na porta 3000  ───►  falhou? ROLLBACK automático
                                           (symlink volta pra release anterior + restart)
7. prune: mantém as últimas 5 releases
```

**Garantias que isso dá** (que o fluxo antigo não tinha):
- **Sem downtime no build:** o `rm -rf $APP` foi eliminado; a versão atual serve
  o tempo todo, a troca é instantânea (um `ln -sfn`).
- **Não promove build quebrado:** o health-check na porta 3001 valida que a
  release **sobe** antes de qualquer troca.
- **Rollback em segundos:** `infra/rollback.sh` (ou o automático) reaponta o
  symlink pra release anterior e reinicia.

### 3.3 Migração one-time (já executada)

`WorkingDirectory` do systemd passou de `/opt/myfinance/app` →
`/opt/myfinance/current`. O `/opt/myfinance/app` antigo (sha `6d75041`) ficou no
disco como rede de segurança manual. Prod hoje roda `a55253b` via o layout novo.

---

## 4. Melhorias recomendadas (segurança e boas práticas)

Ordenadas por relação custo/benefício.

### Alto valor

1. **Staging antes de prod (Camada 3).** Promover o **mesmo artefato** validado
   em staging pra prod elimina a classe "passou no CI mas quebra com dados reais".
   *Pré-req: DNS `staging.appmyfinance.com.br`.*
2. **Branch protection no GitHub.** Hoje a disciplina branch→PR é manual.
   Tornar `main` protegida (exigir PR + checks `quality` e `e2e` verdes, proibir
   push direto) torna o gate **inescapável**, não opcional.
3. **Smoke pós-deploy automático em prod.** Hoje o deploy valida `/api/health`.
   Estender pra rodar o mesmo smoke de rotas (autenticado) contra prod logo após
   o flip, com rollback automático se alguma rota crashar — fecha o gap entre
   "health ok" e "páginas renderizam".
4. **Resolver o débito do vitest.** A suíte pendura (handle aberto) e está fora
   do gate. Caçar o handle (provável timer/efeito sem cleanup), corrigir o teste
   falho (`SonhosObjetivoInlineForm`) e reintroduzir os testes — idealmente com
   `pool: forks` + `testTimeout` + um `timeout-minutes` no job pra nunca pendurar.

### Segurança

5. **Build no CI + artefato imutável (OIDC, sem chaves longas).** Hoje a box
   builda e **clona com um PAT** vindo do SSM. Mover o build pro GitHub Actions
   e publicar um artefato (S3) que a box só baixa: (a) tira o build da t4g.micro,
   (b) garante que prod == exatamente o que passou no CI, (c) permite **assinar**
   o artefato. Usar **GitHub OIDC** pra autenticar CI→AWS (role temporária) em vez
   de access keys.
6. **Reduzir o alcance do GITHUB_TOKEN.** Confirmar que o PAT no SSM é
   fine-grained, **read-only**, só neste repo, com expiração curta e rotação.
   Com o build no CI (item 5), a box deixa de precisar do token pra clonar.
7. **Migrations expand/contract obrigatórias.** O `migrate deploy` roda antes do
   flip, mas o health-check é raso. Padronizar migrations compatíveis com a
   release anterior (adiciona coluna nullable → backfill → usa → remove depois)
   evita quebra durante a janela de troca e viabiliza rollback sem perder dados.
8. **Segredos só via systemd `EnvironmentFile`** (já é o caso) e **nunca**
   `source` do `app.env` em script (a `DATABASE_URL` tem `&`). Garantir que
   nenhum script use `set -x` ao manusear o token (já documentado no runbook).
9. **Backup/PITR do RDS verificado** antes de migrations destrutivas, e um
   runbook de restauração testado (não só "tem backup").

### Operação / observabilidade

10. **Alertas de health.** Um check externo (UptimeRobot/CloudWatch) batendo em
    `/api/health` + alerta (e-mail/Telegram) — hoje a quebra é descoberta por
    acaso. Idealmente alertar também por taxa de 5xx/ErrorBoundary.
11. **Logs estruturados + retenção.** Centralizar logs do `myfinance.service`
    (journald → CloudWatch) pra diagnosticar incidentes sem SSM ao vivo.
12. **`deploy.sh` parametrizável (prod|staging)** e idempotente — pré-requisito
    da Camada 3; também reduz divergência entre ambientes.
13. **Nit do `readlink`:** no 1º deploy de um ambiente, `readlink -f current`
    (inexistente) retorna o próprio path → `PREV` inválido. Tratar
    explicitamente (checar se é symlink válido) pra robustez do rollback.

### Processo

14. **CHANGELOG/registro de deploys** (qual sha foi quando, por quem) — hoje fica
    implícito no nome da release. Um `releases/<ts>-<sha>` já ajuda; um log
    central fecha.
15. **Smoke ampliado:** incluir rotas dinâmicas representativas (`/ativos/[id]`)
    e o fluxo de consultor, além das estáticas atuais.

---

## 5. Estado atual (08/06/2026)

- Prod: `a55253b` via deploy atômico; `/analises` removida; health ok.
- CI: `quality` + `e2e` verdes e bloqueando (na prática; falta branch protection
  formal — item 2).
- Próximo passo: **Camada 3 (staging)** — aguardando DNS do usuário.
