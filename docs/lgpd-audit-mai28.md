# Auditoria LGPD — SFC (2026-05-28)

Auditoria realizada em 4 eixos paralelos: (1) PII coletada + autenticação,
(2) direitos do titular + consentimento + transparência, (3) segurança
técnica, (4) compartilhamento com terceiros + retenção + transferência
internacional.

Plataforma SFC: Next.js 15 + Prisma + PostgreSQL (Neon) + Vercel sa-east-1.
Status atual: **em fase de testes sem usuários reais** — há janela pra
corrigir antes do release.

## Classificação executiva

- **14 itens CRÍTICOS** — bloqueiam onboarding real
- **11 ATENÇÃO** — ajustar antes de escalar
- **13 OK** — já adequados

---

## Bloco 1 — CRÍTICO (bloqueia release com usuários reais)

### Direitos do titular (Art. 18 LGPD) — 6 itens

1. **Sem Política de Privacidade nem Termos de Uso**
   Nenhuma página `/politica-de-privacidade`, `/termos-de-uso`. Spans em
   `src/components/auth/SignUpForm.tsx:189-198` mencionam textos mas sem
   `<Link href>`. Art. 9º exige consentimento informado.

2. **Sem endpoint de correção de dados**
   `/api/profile` só tem GET (`src/app/api/profile/route.ts:7-24`). Página
   `/profile` é read-only. Usuário não corrige nem o próprio nome.

3. **Sem endpoint de eliminação de conta**
   Zero `DELETE /api/profile`, `/api/user/me`. Não há fluxo "excluir minha
   conta".

4. **Sem endpoint de portabilidade**
   Zero export JSON/CSV. Dados ficam presos. Art. 18, V.

5. **Sem registro de consentimento**
   Checkbox em `SignUpForm.tsx:184-188` (`isChecked`) NUNCA é enviado ao
   backend. Sem modelo `UserConsent`/`Consent` no schema. Aceite puramente
   cosmético.

6. **Sem revogação de consentimento**
   Consequência direta do item 5. Art. 18, IX.

### Transparência e governança — 3 itens

7. **Sem contato do DPO/Encarregado** (Art. 41 LGPD obrigatório)
   Zero ocorrências de "dpo", "encarregado".

8. **Sem página de subprocessadores**
   Usuário não é informado que dados vão pra Vercel/Neon (Art. 18, VII).

9. **Sem banner/aviso de cookies**
   Resolução ANPD CD/ANPD 2/2022. Cookies atuais são estritamente
   necessários (auth+CSRF), mas aviso informativo é obrigatório.

### Auth/credenciais — 3 itens

10. **Reset de senha não funciona**
    `src/components/auth/ResetPasswordForm.tsx` é UI estática sem
    `onSubmit`. Sem rota `/api/auth/forgot-password` ou
    `/api/auth/reset-password`. Usuário que esquece senha fica sem acesso.

11. **Sem confirmação de email**
    Schema não tem `emailVerified`. Qualquer email cadastra, incluindo de
    terceiros. Risco de spoofing.

12. **Sem 2FA/MFA**
    Zero matches pra `2fa|mfa|totp|authenticator`. Plataforma financeira
    sem MFA fere Art. 46 (medidas técnicas adequadas).

### Infra/operacional — 2 itens

13. **DB em transferência internacional sem base legal documentada**
    `DATABASE_URL` aponta `us-east-1.aws.neon.tech` enquanto Vercel está em
    `gru1`. TODO dado pessoal (email, hash de senha, transações, IPs de
    impersonation, eventualmente CPF) reside nos EUA. Art. 33 LGPD exige
    cláusulas-padrão ANPD ou consentimento específico. Conhecido (CLAUDE.md
    task 5.3 — RDS sa-east-1 marcada `LOW` pendente).

14. **Sem política de gestão de incidentes (Art. 48)**
    Zero `docs/incident-response.md`, runbook de vazamento, SLA de
    comunicação à ANPD. Art. 48 exige comunicação à ANPD e titulares em
    prazo razoável.

---

## Bloco 2 — ATENÇÃO (ajustar antes de escalar)

### Auth
- **bcrypt rounds=10** em `register/route.ts:21` e `login/route.ts:19` —
  OWASP 2026 sugere ≥12.
- **JWT carrega `email` nos claims** (`login/route.ts:28-32`,
  `register/route.ts:35-39`) — PII em payload base64-decodificável. Manter
  só `id, role`.
- **JWT no register força 7d sem opção** (`register/route.ts:39`) — viola
  minimização.
- **Sem revocation de JWT** — logout só apaga cookie cliente. Token vazado
  fica válido até 7d. Sem `jti`, sem blacklist.
- **Política de senha frouxa** — `validation-schemas.ts:55` exige `min(1)`.
  Aceita senha de 1 caractere.
- **Sem captcha no registro** — zero recaptcha/hcaptcha/turnstile. Risco de
  bot abuse + spoofing de email.

### Segurança
- **Sem CSP nem HSTS no middleware** (`src/middleware.ts:74-86`) — defesa
  XSS depende só do React; SSL strip possível no primeiro acesso.
- **Rate limit in-memory por isolate** (`src/lib/rateLimit.ts:138-160` +
  `middleware.ts:11`) — em Vercel Edge, atacante distribui requests entre
  instâncias e burla. Migrar pra Upstash Redis.
- **Logger sem redaction** (`src/lib/logger.ts`) — `logger.error(error)`
  em prod pode persistir payloads com PII nos logs Vercel (US). Stack
  traces de 500 expõem bodies.

### Compartilhamento
- **Notification.metadata** (Json livre) grava `clientName + clientEmail`
  em `respond/route.ts:152-158` — PII duplicada em campo livre dificulta
  direito de eliminação (Art. 18).
- **ConsultantImpersonationLog sem TTL** — IP + UserAgent + sessionToken
  indefinidos. Trail é necessário pra auditoria mas precisa de política de
  retenção (LGPD não pede "para sempre").

---

## Bloco 3 — OK (já adequado)

- **CSRF** via double-submit em `src/middleware.ts:147-161` + `useCsrf.ts`.
- **Rate limiting básico ativo** (Phase 1.4) — 3 tiers, cobertura
  universal.
- **Cookies httpOnly + secure (prod) + sameSite=lax** em auth e CSRF.
- **Coleta mínima de PII** — só `email + name + password hash + avatarUrl`.
  Sem CPF/RG/telefone/endereço/data nascimento. (Quando integrar Open
  Finance/banco, revisar.)
- **Impersonation Audit Trail** completo em `ConsultantImpersonationLog`
  (`schema.prisma:536-555`) com IP/UA/sessionToken/details/index por
  consultor+cliente+data.
- **Convite consultor-cliente exige aceite explícito** —
  `respond/route.ts:104-120` cria `ClientConsultant` só após
  `action='accept'`. Validações de identidade em `:76-88`.
- **Impersonation TTL 30min + token opaco** (Phase 1.5, registrado em
  CLAUDE.md).
- **SQL injection mitigado** — só 2 usos de `$queryRaw`:
  `health/route.ts:10` (`SELECT 1`) e `backfill-names/route.ts:37-47`
  (constantes). Resto via Prisma.
- **Zero XSS via `dangerouslySetInnerHTML`** em `src/`.
- **Validação Zod** nas rotas auth (`loginSchema`, `registerSchema`) e nas
  73 rotas (Phase 1.2 done).
- **Zero analytics/tracking de terceiros** — sem GA, Mixpanel, Hotjar,
  Sentry SDK, etc.
- **Zero webhooks externos com PII** — sem Slack/Discord/Telegram egress.
- **APIs de mercado** (BRAPI/Yahoo/CoinGecko/BACEN/CVM/Tesouro) **não
  recebem PII** — só tickers públicos.
- **Sem cópia de prod no dev** — seed sintético via `prisma/seed.ts` +
  `scripts/kinvo-seed-sfc.ts`.

---

## Inventário de subprocessadores

| Subprocessador | Dado enviado | Região | Transferência internacional? |
|---|---|---|---|
| **Vercel** (hosting) | TODO request HTTP do user, JWT, IP, payloads | gru1 (SP); logs em US | SIM (telemetria) |
| **Neon** (PostgreSQL) | TUDO: PII + financeiro + audit logs | **us-east-1 (EUA)** | **SIM (crítico)** |
| BRAPI | Apenas tickers públicos | BR | Não |
| CoinGecko | IDs de moedas | EUA | Sem PII |
| Yahoo Finance | Tickers de índices | EUA | Sem PII |
| BACEN SGS | IDs de série | BR (gov) | Não |
| CVM dados abertos | Downloads CSV/ZIP públicos | BR (gov) | Não |
| Tesouro Transparente | CSV público | BR | Não |

---

## Roteiro priorizado de correção

### Sprint LGPD-1 — bloqueio de release

1. Política de Privacidade + Termos de Uso em `/politica-de-privacidade` e
   `/termos-de-uso` + links no SignUp + footer
2. Modelo `UserConsent` no schema + persistir aceite no register com
   timestamp/IP/versão da política
3. PATCH `/api/profile` (correção) + DELETE `/api/profile` com
   anonimização ou hard-delete cascata
4. GET `/api/profile/export` (portabilidade JSON estruturado)
5. Reset de senha funcional (`/api/auth/forgot-password` +
   `/api/auth/reset-password` com token expirável)
6. Confirmação de email no signup (campo `emailVerified` + token de
   verificação)
7. Página `/subprocessadores` listando Vercel, Neon, BRAPI, etc.
8. Indicar DPO + contato em footer e Política

### Sprint LGPD-2 — escalonamento

9. Migrar Neon US→RDS sa-east-1 (já é task 5.3 no CLAUDE.md) — ou contrato
   cláusulas-padrão ANPD com Neon
10. 2FA TOTP opcional pra todos, obrigatório pra consultores
11. Política de senha decente (mínimo 8, complexidade, contra lista de
    senhas vazadas)
12. CSP + HSTS no middleware
13. Rate limit em Upstash Redis (Edge-safe)
14. Logger com redaction de email/CPF/token em prod
15. Runbook de incidente (`docs/incident-response.md`) + canal ANPD

### Sprint LGPD-3 — refinamento

16. bcrypt rounds 12
17. JWT sem email nos claims + jti/blacklist + refresh token
18. TTL em ConsultantInvite, Notification.metadata redacted,
    ConsultantImpersonationLog purge policy
19. Banner de cookies informativo
20. Idade mínima no signup (Art. 14)
21. Captcha no register/login

---

## Quando aplicar

Antes de qualquer release público: **Sprint LGPD-1 inteiro**.
Quando passar de N=10 usuários reais: **Sprint LGPD-2**.
Refinamentos da Sprint LGPD-3 podem rodar incrementalmente.
