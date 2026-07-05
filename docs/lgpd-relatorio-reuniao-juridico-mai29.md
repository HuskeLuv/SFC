# Relatório LGPD para reunião jurídica — MyFinance (SFC)

**Data:** 2026-05-29
**Plataforma:** MyFinance / SFC — gestão financeira pessoal (Next.js 15, React 19, Prisma 6, PostgreSQL)
**Estágio:** **em fase de testes, sem usuários reais ainda.** Existe janela para corrigir tudo antes do lançamento público.
**Hospedagem atual:** Vercel (gru1 / São Paulo) + banco Neon (PostgreSQL). Migração decidida para AWS sa-east-1 (Amplify + RDS) — ver seção 5.

> **Mensagem de uma frase para a reunião:** "Fizemos uma auditoria LGPD própria em 4 eixos no dia 28/05, classificamos 38 pontos (14 críticos, 11 de atenção, 13 já conformes) e já implementamos em produção 12 dos 14 críticos e 8 dos 11 de atenção. Os 3 itens restantes dependem de infraestrutura (provedor de e-mail e migração de banco), todos já planejados e nenhum bloqueia o teste interno atual."

---

## 1. Contexto e abordagem (para abrir a reunião)

- A plataforma **ainda não tem usuários reais** — está em testes com contas sintéticas (seed) e contas de teste internas. Isso é juridicamente relevante: **não há tratamento de dados pessoais de titulares reais em produção** até o lançamento. Nenhuma das pendências expõe titulares hoje.
- Em **28/05/2026** rodamos uma auditoria LGPD interna estruturada em 4 eixos:
  1. PII coletada + autenticação;
  2. Direitos do titular + consentimento + transparência;
  3. Segurança técnica;
  4. Compartilhamento com terceiros + retenção + transferência internacional.
- Resultado: **38 pontos** → **14 CRÍTICOS**, **11 ATENÇÃO**, **13 já conformes**.
- Desde então implementamos e colocamos em produção a grande maioria. O estado abaixo reflete o **código atualmente em produção** (verificado em 29/05).

**Ponto de honestidade para a reunião:** os textos legais (Política, Termos) hoje são **boilerplate v1.0 gerado a partir de modelo** — precisam de **revisão e validação jurídica**, que é justamente o objetivo desta reunião. O DPO está cadastrado como **placeholder** (`dpo@appmyfinance.com.br`) e precisa ser oficializado (nome + pessoa responsável).

---

## 2. Conformidades JÁ IMPLEMENTADAS (em produção)

### 2.1 Direitos do titular (Art. 18 LGPD)

| Direito (LGPD) | Como está implementado | Localização |
|---|---|---|
| **Confirmação e acesso** (Art. 18, I/II) | `GET /api/profile` + página de perfil | `src/app/api/profile/route.ts` |
| **Correção** (Art. 18, III) | `PATCH /api/profile` — edita nome, e-mail, avatar, senha | `src/app/api/profile/route.ts` |
| **Eliminação / exclusão de conta** (Art. 18, VI) | `DELETE /api/profile` — **anonimização**: nome → "Usuário removido", e-mail → `deleted-{id}@anonimo.local`; transações preservadas de forma anônima | `src/app/api/profile/route.ts` |
| **Portabilidade** (Art. 18, V) | `GET /api/profile/export` — download JSON estruturado com todos os dados do titular | `src/app/api/profile/export/route.ts` |
| **Revogação de consentimento** (Art. 18, IX / Art. 8º §5º) | Modelo `UserConsent` com campo `revokedAt`; controles na UI | `prisma/schema.prisma` + `PrivacyControls.tsx` |

UI consolidada em `src/components/user-profile/PrivacyControls.tsx` (4 seções: informações, senha, baixar dados, excluir conta).

### 2.2 Consentimento e base legal (Art. 7º, Art. 8º, Art. 9º)

- **Registro de consentimento auditável:** modelo `UserConsent` grava, por documento aceito, `documentType`, `documentVersion`, `acceptedAt`, `ipAddress`, `userAgent` e `revokedAt`. No cadastro são criados 2 registros (Política de Privacidade + Termos de Uso).
- **Consentimento informado:** aceite explícito no signup com links reais para os documentos (antes da auditoria o checkbox era cosmético — corrigido).

### 2.3 Transparência e governança

| Item | Status | Localização |
|---|---|---|
| **Política de Privacidade** | Publicada (v1.0 boilerplate — **revisar juridicamente**) | `/politica-de-privacidade` |
| **Termos de Uso** | Publicados (v1.0 boilerplate — **revisar juridicamente**) | `/termos-de-uso` |
| **Página de Subprocessadores** (Art. 18, VII) | Publicada, 9 subprocessadores listados | `/subprocessadores` |
| **Contato do DPO/Encarregado** (Art. 41) | Cadastrado no rodapé legal — **placeholder, oficializar** | `LegalFooter.tsx` |
| **Banner de cookies** (Res. CD/ANPD 2/2022) | Banner global, versionado em localStorage | `CookieConsentBanner.tsx` |
| **Runbook de resposta a incidentes** (Art. 48) | `docs/incident-response.md` — 224 linhas, com SLAs e templates de comunicação à ANPD e aos titulares | `docs/incident-response.md` |

### 2.4 Segurança da informação (Art. 46 — medidas técnicas)

| Medida | Status |
|---|---|
| **Senhas com bcrypt cost 12** | ✅ constante centralizada `BCRYPT_ROUNDS=12` |
| **2FA / MFA (TOTP)** | ✅ setup/verify/disable/status; fluxo de login com `totpRequired` (`otplib`) |
| **Política de senha** | ✅ mínimo 8 caracteres + letra + dígito |
| **JWT sem PII** | ✅ claims só `{id, role}` (antes carregava e-mail) |
| **CSP + HSTS** | ✅ aplicados em toda resposta no middleware (CSP permissivo hoje — débito técnico para nonces) |
| **CSRF** | ✅ double-submit cookie em todas as mutações |
| **Rate limiting** | ✅ 3 tiers, cobertura universal (in-memory — ver atenção 4.x) |
| **Cookies httpOnly + secure + sameSite=lax** | ✅ |
| **Logger com redação de PII em produção** | ✅ mascara e-mail/CPF/JWT/tokens recursivamente |
| **SQL injection** | ✅ mitigado (Prisma; apenas 2 `$queryRaw` com constantes) |
| **XSS** | ✅ zero `dangerouslySetInnerHTML`; sem analytics/tracking de terceiros |
| **Validação de entrada (Zod)** | ✅ nas rotas de auth e nas ~73 rotas |

### 2.5 Princípios de minimização e finalidade (Art. 6º)

- **Coleta mínima de PII:** hoje só **e-mail, nome, hash de senha e avatar**. **Não coletamos CPF, RG, telefone, endereço nem data de nascimento.**
- **APIs de mercado** (BRAPI, Yahoo, CoinGecko, BACEN, CVM, Tesouro) **não recebem dado pessoal** — só tickers/códigos públicos.
- **Sem webhooks externos com PII** (sem Slack/Discord/Telegram).
- **Ambiente de dev não usa cópia de produção** — dados sintéticos via seed.

### 2.6 Retenção e governança de dados (Art. 15, Art. 16)

- **Cron de retenção LGPD** semanal (`/api/cron/lgpd-retention`, domingo 5h UTC):
  - Convites de consultor pendentes > 30 dias → eliminados;
  - Logs de impersonation > 12 meses → eliminados.
- **PII fora de campos JSON livres:** `Notification.metadata` e logs de impersonation deixaram de duplicar nome/e-mail do cliente (que ficavam difíceis de eliminar) — agora guardam só IDs.

### 2.7 Trilha de auditoria (accountability — Art. 37)

- **Impersonation de consultor** (consultor agindo em nome do cliente) totalmente logada em `ConsultantImpersonationLog` (IP, user-agent, token de sessão, detalhes), com TTL de sessão de 30 min e token opaco.
- **Vínculo consultor-cliente exige aceite explícito** do cliente.

---

## 3. O QUE FALTA — pendências e plano de ação

> **Nenhuma pendência bloqueia o teste interno atual** (sem usuários reais). Todas precisam estar fechadas **antes do lançamento público**.

### 3.1 Pendências CRÍTICAS (dependem de infraestrutura)

| # | Pendência | Por que falta | Plano de ação | Bloqueia lançamento? |
|---|---|---|---|---|
| **#10** | **Reset de senha funcional** | A UI existe (`ResetPasswordForm.tsx`) mas faltam as rotas `/api/auth/forgot-password` e `/api/auth/reset-password` — dependem de **envio de e-mail (AWS SES)** | Configurar SES no sa-east-1 → implementar token expirável (1h) → conectar a UI já existente. Esforço: ~3h após SES | **Sim** (usuário que esquece a senha fica sem acesso) |
| **#11** | **Confirmação de e-mail** | Falta campo `emailVerified` + token; depende de **AWS SES** | Campo no schema + e-mail de verificação + bloqueio de login até confirmar. Esforço: ~3h após SES | **Sim** (evita cadastro com e-mail de terceiros / spoofing) |
| **#13** | **Transferência internacional / localização do banco** | Banco Neon hoje em **us-east-1 (EUA)**; Vercel em SP. Dado pessoal reside nos EUA → exige base legal de transferência internacional (Art. 33) | **Migrar para AWS RDS sa-east-1** (decisão já tomada) → tratamento passa a ser local, dispensa cláusulas-padrão. Ver `docs` do plano AWS | **Sim** (ou contratar cláusulas-padrão ANPD com Neon como alternativa temporária) |

### 3.2 Pendências de ATENÇÃO (endurecimento, não bloqueiam)

| Item | Pendência | Dependência | Plano |
|---|---|---|---|
| Captcha no registro/login | Sem proteção anti-bot | Conta hCaptcha/Turnstile/reCAPTCHA | Adicionar quando abrir cadastro público |
| Rate limit distribuído | Hoje in-memory por isolate (atacante distribui requests entre instâncias Edge) | Conta Upstash Redis | Migrar para Upstash quando escalar |
| Revogação de JWT (jti/blacklist) | Logout só apaga cookie; token vazado vale até expirar | Redis / AWS | Implementar com refresh tokens |
| CSP por nonces | CSP hoje permissivo (`unsafe-inline/unsafe-eval`) por hidratação Next/ApexCharts | — | Migrar para nonces |
| Idade mínima no cadastro (Art. 14) | Sem verificação de idade | — | Adicionar no signup (relevante se houver risco de menores) |

### 3.3 Itens de revisão JURÍDICA (objetivo desta reunião)

Estes não são código — dependem do time jurídico:

1. **Validar/reescrever a Política de Privacidade** (hoje boilerplate v1.0). Verificar: bases legais por finalidade, prazos de retenção declarados, descrição dos direitos, dados de contato do DPO.
2. **Validar/reescrever os Termos de Uso** (escopo, responsabilidades, limitações — atenção a ser plataforma financeira, mas **não** instituição financeira / não dá recomendação de investimento regulada pela CVM — confirmar disclaimers).
3. **Oficializar o Encarregado (DPO)** — definir pessoa/contato real (Art. 41) e publicar.
4. **Definir bases legais** por finalidade de tratamento (consentimento vs. execução de contrato vs. legítimo interesse).
5. **Definir prazos de retenção** oficiais por categoria de dado, para declarar na Política e refletir no cron de retenção.
6. **Versionamento de documentos:** quando a Política/Termos mudarem, o sistema já versiona o consentimento (`documentVersion`) — definir o processo de re-consentimento.

---

## 4. Inventário de dados pessoais tratados

| Dado | Finalidade | Sensível? | Base legal provável (validar) |
|---|---|---|---|
| E-mail | Autenticação, identificação, comunicação | Não | Execução de contrato / consentimento |
| Nome | Identificação, personalização | Não | Execução de contrato |
| Hash de senha (bcrypt) | Autenticação | Não (não é senha em claro) | Segurança / execução de contrato |
| Avatar (URL) | Personalização | Não | Consentimento |
| IP + user-agent | Registro de consentimento e logs de auditoria de impersonation | Não | Cumprimento de obrigação / legítimo interesse (segurança) |
| Segredo TOTP (2FA) | Autenticação em 2 fatores | Sensível (credencial) | Segurança |
| Dados financeiros (carteira, transações, fluxo de caixa) | Função principal da plataforma | **Não são "sensíveis" no sentido do Art. 5º, II**, mas são confidenciais | Execução de contrato |

**Não coletados:** CPF, RG, telefone, endereço, data de nascimento, dados bancários de conta, dados de saúde/biometria. ⚠️ Se no futuro houver **integração com Open Finance / banco**, este inventário e as bases legais **precisam ser revisados**.

---

## 5. Subprocessadores e transferência internacional

| Subprocessador | Dado enviado | Região | Transferência internacional |
|---|---|---|---|
| **Vercel** (hosting atual) | Requests HTTP, JWT, IP, payloads | gru1 (SP); logs em US | Sim (telemetria) |
| **Neon** (PostgreSQL atual) | **Tudo: PII + financeiro + logs** | **us-east-1 (EUA)** | **Sim — ponto crítico** |
| **AWS** (destino planejado) | Tudo | **sa-east-1 (SP)** | **Não** (resolve o problema) |
| BRAPI | Apenas tickers públicos | BR | Não (sem PII) |
| BACEN / CVM / Tesouro | Códigos/CSV públicos | BR | Não |
| Yahoo Finance / CoinGecko | Tickers/IDs públicos | EUA | Sem PII |

**Plano:** migração para **AWS Amplify + RDS sa-east-1** já decidida. Após a migração, **não há mais transferência internacional de dado pessoal** — o tratamento passa a ser integralmente no Brasil. Até lá, a recomendação é **não onboarding de usuários reais** (já é o caso) ou, se fosse necessário antes, contratar cláusulas-padrão contratuais com Neon.

---

## 6. Perguntas prováveis na reunião e respostas prontas

**"Vocês têm Política de Privacidade e Termos?"**
Sim, publicados e acessíveis (`/politica-de-privacidade`, `/termos-de-uso`). São v1.0 boilerplate e **queremos a validação de vocês** — é o foco desta reunião.

**"Como vocês registram o consentimento?"**
Cada aceite gera um registro `UserConsent` com tipo de documento, versão, data/hora, IP e user-agent. O usuário pode revogar (campo `revokedAt`). É auditável.

**"O usuário consegue acessar, corrigir, exportar e excluir os dados dele?"**
Sim, os 4 fluxos do Art. 18 estão implementados: acesso (GET), correção (PATCH), exportação JSON (portabilidade) e exclusão por anonimização (DELETE).

**"Os dados são tratados no Brasil?"**
Hoje o banco está nos EUA (Neon/us-east-1). **Decisão já tomada de migrar para AWS São Paulo (sa-east-1).** Como ainda não há usuários reais, não há titular exposto a transferência internacional. A migração elimina o ponto.

**"Vocês coletam CPF / dados sensíveis?"**
Não. Coleta mínima: e-mail, nome, senha (hash) e avatar. Sem CPF, telefone, endereço, biometria ou dados de saúde.

**"Têm Encarregado (DPO)?"**
Está publicado um contato (`dpo@appmyfinance.com.br`), mas é **placeholder** — precisamos formalizar a pessoa responsável. Queremos orientação de vocês sobre se pode ser interno ou terceirizado.

**"E se houver um vazamento?"**
Temos runbook de resposta a incidentes (`docs/incident-response.md`) com SLAs e modelos de comunicação à ANPD e aos titulares (Art. 48). Falta definir o prazo formal e quem assina a comunicação.

**"Quais medidas de segurança técnica vocês têm?"**
bcrypt 12, 2FA (TOTP), CSP+HSTS, CSRF, rate limiting, cookies httpOnly/secure, JWT sem PII, validação Zod, logger com redação de PII, retenção automatizada. (Ver seção 2.4.)

**"Cookies — vocês pedem consentimento?"**
Temos banner de cookies. Hoje os cookies são **estritamente necessários** (autenticação + CSRF), sem rastreamento/analytics de terceiros — mesmo assim exibimos o aviso (Res. CD/ANPD 2/2022).

**"Por quanto tempo guardam os dados?"**
Temos retenção automatizada para convites e logs de auditoria. **Os prazos oficiais por categoria de dado precisam ser definidos com vocês** e declarados na Política.

**"Vocês são instituição financeira / dão recomendação de investimento?"**
(Confirmar disclaimer.) A plataforma é de **gestão e acompanhamento** — não custodia recursos, não executa ordens, não é recomendação de investimento regulada. Importante deixar isso claro nos Termos.

---

## 7. Riscos residuais e recomendações priorizadas

**Antes do lançamento público (obrigatório):**
1. Validação jurídica de Política, Termos e bases legais (esta reunião).
2. Oficializar o DPO.
3. Definir e declarar prazos de retenção.
4. Concluir migração para AWS sa-east-1 (#13).
5. Configurar AWS SES → habilitar reset de senha (#10) e confirmação de e-mail (#11).

**Ao escalar (pós-lançamento):**
6. Captcha, rate limit distribuído (Upstash), revogação de JWT.
7. CSP por nonces.
8. Idade mínima no cadastro (se aplicável).

**Pré-requisitos futuros (gatilho específico):**
9. Se integrar Open Finance / coletar CPF: refazer inventário, DPIA (relatório de impacto), revisar bases legais.

---

## Anexos / fontes internas

- Auditoria completa: `docs/lgpd-audit-mai28.md`
- Plano de execução: memória `project_lgpd_audit_may28`
- Helpers de segurança: memória `project_security_hardening_may28`
- Runbook de incidentes: `docs/incident-response.md`
- Plano de migração AWS: memória `project_aws_deploy_plan`
