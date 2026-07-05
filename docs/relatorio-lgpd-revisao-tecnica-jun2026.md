# Relatório de Arquitetura de Planos, Precificação e Fluxos de Dados para Conformidade LGPD

**Revisão Técnica — Junho/2026**

Este documento é uma revisão técnica do relatório original entregue ao corpo jurídico. Ele
mantém a estrutura comercial e funcional descrita anteriormente, mas foi confrontado com o
estado real do código-fonte do aplicativo My Finance para: (1) corrigir uma afirmação técnica
imprecisa, (2) separar claramente o que **já está implementado** do que está **planejado para o
lançamento**, e (3) documentar a camada de conformidade LGPD que já foi construída e não constava
do relatório original.

> **Legenda de status**
> - ✅ **Implementado** — existe e está em funcionamento no código atual.
> - 🔜 **Planejado** — descrito no produto, mas ainda não implementado (será entregue antes do lançamento).
> - ⚠️ **Pendência** — item que exige correção/decisão jurídica ou técnica antes do lançamento.

---

## 0. Resumo executivo das mudanças desta revisão

1. **Correção técnica:** o sistema **não** possui criptografia AES-256 em nível de campo no banco.
   A criptografia em repouso é fornecida apenas pela infraestrutura de banco gerenciado. (Seção 4)
2. **Cobrança e planos (Stripe):** ainda **não implementados**. As Seções 1 e 2 descrevem o
   modelo comercial planejado, não o estado atual. (🔜)
3. **Dados coletados hoje são minimalistas:** o app **não coleta** CPF, CNPJ, endereço, telefone
   ou data de nascimento. Apenas e-mail e nome. (Seção 3)
4. **Conformidade já construída:** direitos do titular (Art. 18), consentimento versionado,
   trilha de auditoria do consultor, retenção automatizada, 2FA, encarregado (DPO) e páginas
   legais **já existem** e foram adicionados como Seção 5.
5. **Transferência internacional e subprocessadores:** tema obrigatório que estava ausente,
   incluído como Seção 6.

---

## 1. Arquitetura de Cobrança e Operador de Dados (Stripe) — 🔜 Planejado

> **Status:** não implementado. Não há dependência do Stripe, endpoint de webhook, modelo de
> assinatura ou fluxo de pagamento no código atual. Esta seção descreve o modelo comercial
> pretendido para o lançamento.

O My Finance utilizará a infraestrutura do Stripe como gateway de pagamento e motor de cobrança
recorrente (Stripe Billing). Sob a ótica da LGPD, o Stripe atuará como **Operador de Dados**:

- **Tokenização de cartões:** o app jamais armazenará dados de cartão ou credenciais de pagamento
  em servidores próprios. Os dados sensíveis serão capturados via Stripe Elements/SDK e
  tokenizados nos servidores do operador.
- **Dados a serem compartilhados com o Stripe:** Nome Completo, CPF/CNPJ, E-mail, Endereço de
  Faturamento e Dados do Meio de Pagamento. **Observação importante:** esses dados (CPF/CNPJ,
  endereço) **só passarão a ser coletados quando o billing for integrado**. Hoje não são
  coletados (ver Seção 3).
- **Sincronização via webhooks:** o app receberá apenas metadados de status da assinatura
  (`subscription.created`, `invoice.paid`, etc.) para ativar/desativar permissões de acesso.

---

## 2. Matriz de Assinaturas, Preços e Entregas Funcionais — 🔜 Planejado

> **Status:** a precificação e os planos pagos (Standard / Silver / Gold / Premium / Consultor)
> ainda **não existem no código**. Não há enum de plano, gating por assinatura nem cobrança. O
> controle de acesso atual é por **papel** (`user`, `consultant`, `admin`), não por plano pago.
> A matriz abaixo descreve o produto comercial planejado.

| Plano | Valor | Funcionalidades | Dados processados |
|---|---|---|---|
| Standard | R$ 99,00/ano | Fluxo de caixa manual; App celular | Perfil (nome, e-mail); receitas/despesas/categorias manuais |
| Silver | R$ 29,90/mês (fidelidade anual) | + Carteira manual básica; Planejamento de aposentadoria; iPad/Tablet | + Dados patrimoniais inseridos manualmente |
| Gold | R$ 59,90/mês (fidelidade anual) | + Balanço patrimonial dinâmico; Relatórios de performance; Carteira completa; Análise da carteira; Notificações; Área educacional | + Rentabilidade agregada, histórico de proventos, preferências de notificação, progresso educacional |
| Premium | R$ 99,00/mês (anual) | + Análise fundamentalista completa; Auxílio IRPF | + Receita bruta, gastos dedutíveis, proventos fiscais (conferência) |
| Consultor | R$ 495,00/mês (anual) | Painel master; gestão de carteiras/orçamentos de clientes; planejamento para terceiros | **PONTO CRÍTICO:** compartilhamento de dados financeiros sensíveis dos clientes finais com o consultor |

> **Nota sobre APIs externas:** a observação do plano Premium ("consome APIs de terceiros sem
> cruzamento de dados pessoais") aplica-se a **todo o app**, não apenas à análise fundamentalista —
> todas as cotações e proventos usam fontes externas. A lista completa está na Seção 6.

---

## 3. Dados Pessoais Efetivamente Coletados Hoje — ✅ Estado atual

Para subsidiar a análise de **minimização de dados** (Art. 6º, III), segue o que o sistema
realmente armazena no cadastro de usuário hoje (modelo `User`):

| Campo | Natureza |
|---|---|
| `email` (único) | Identificação / login |
| `name` | Nome de exibição (campo único, não estruturado) |
| `password` | **Hash bcrypt (custo 12)** — nunca texto puro |
| `avatarUrl` | Opcional |
| `role` | `user` / `consultant` / `admin` |
| `totpSecret` / `totpEnabled` | Segredo do 2FA (ver ⚠️ pendência na Seção 9) |
| `createdAt` / `updatedAt` | Metadados |

**O sistema NÃO coleta hoje:** CPF, CNPJ, endereço, telefone, data de nascimento. Os dados
financeiros/patrimoniais (carteira, transações, fluxo de caixa, planejamento) são **inseridos
manualmente pelo próprio titular**. Esta postura minimalista é favorável à conformidade e deve
ser destacada nos Termos/Política. A coleta de CPF/CNPJ/endereço só ocorrerá com a integração do
billing (Seção 1).

---

## 4. Módulos Internos e Natureza Jurídica dos Dados — ✅ com correção técnica

- **Módulo de Fluxo de Caixa e Orçamento:** dados financeiros comuns. Finalidade: monitorar a
  saúde financeira corrente. Base legal: execução de contrato.
- **Módulo de Investimentos e Carteira:** dados patrimoniais. **Proteção real:** criptografia em
  trânsito (HTTPS/TLS) e criptografia em repouso **fornecida pela infraestrutura de banco de dados
  gerenciado**.
  > ⚠️ **Correção em relação ao relatório original:** não há criptografia AES-256 em **nível de
  > campo** na aplicação. A criptografia em repouso é a do provedor de banco (disco), não
  > campo-a-campo. Recomenda-se redigir a Política como "criptografia em repouso fornecida pela
  > infraestrutura gerenciada", evitando declarar AES-256 aplicativo que não existe.
- **Módulo de Auxílio Fiscal (IRPF):** dados de alta sensibilidade fiscal (receita bruta, gastos
  dedutíveis, proventos). Finalidade: facilitar o cumprimento de obrigações tributárias. Base
  legal: execução de contrato, com alta expectativa de sigilo.

---

## 5. Medidas Técnicas e Organizacionais Já Implementadas — ✅ (NOVA SEÇÃO)

Esta seção não constava do relatório original. Documenta os controles de LGPD **já construídos**,
relevantes para o RIPD (medidas de segurança) e para a Política de Privacidade.

### 5.1. Direitos do titular (Art. 18) — já operacionais
- **Acesso / confirmação (Art. 18, I–II):** endpoint de leitura do perfil do titular.
- **Retificação (Art. 18, III):** edição de nome, e-mail e senha pelo próprio titular.
- **Eliminação / anonimização (Art. 18, IV):** exclusão de conta por **anonimização** — nome vira
  "Usuário removido", e-mail é anonimizado e a senha é randomizada. Registros transacionais são
  preservados por **5 anos** para cumprimento de obrigação legal/fiscal (justifica por que a
  exclusão não é total e imediata).
- **Portabilidade (Art. 18, V):** exportação de todos os dados do titular em **JSON** (perfil,
  carteira, transações, fluxo de caixa, planejamento, consentimentos, notificações), acessível
  pela própria interface.

### 5.2. Registro de consentimento (Art. 8º, §1º)
Modelo `UserConsent` registra, de forma rastreável: tipo do documento (política/termos),
**versão** do documento aceito, data/hora, **IP**, **user-agent** e data de **revogação**. O
consentimento é capturado no cadastro e a revogação é preservada (sem exclusão do histórico).

### 5.3. Trilha de auditoria do consultor (multilocação)
Modelo `ConsultantImpersonationLog` registra **cada acesso** do consultor aos dados do cliente:
ID do consultor, ID do cliente, ação, detalhes, IP, user-agent, token de sessão e timestamp. A
segregação lógica entre clientes de consultores diferentes é garantida no nível de acesso.

### 5.4. Retenção automatizada
Rotina agendada (semanal) que aplica: convites pendentes expiram em **30 dias**; logs de auditoria
do consultor são eliminados após **365 dias**; contas excluídas são anonimizadas; dados
transacionais retidos por **5 anos** (obrigação fiscal).

### 5.5. Segurança de autenticação e aplicação
- Autenticação por **JWT em cookie httpOnly** + proteção **CSRF** (double-submit).
- **2FA TOTP** (autenticador) disponível.
- Senhas com **bcrypt custo 12**; política de senha (mínimo 8 caracteres, com letra e dígito).
- **Rate limiting** em rotas sensíveis (login/registro).
- Cabeçalhos de segurança **CSP** e **HSTS**.
- **Redação de PII** nos logs de produção (dados pessoais não são gravados em texto livre).

### 5.6. Encarregado (DPO) e canais
- Encarregado/canal de privacidade: **dpo@appmyfinance.com.br**.
- Prazo de resposta às solicitações do titular: **15 dias**.

### 5.7. Páginas legais e cookies
Já publicadas no aplicativo: **Política de Privacidade**, **Termos de Uso**, página de
**Subprocessadores** e **banner de consentimento de cookies**. (Política versão 1.0.)

---

## 6. Subprocessadores e Transferência Internacional — ✅/⚠️ (NOVA SEÇÃO)

Tema obrigatório (Art. 33) que estava ausente no relatório original.

### 6.1. Localização da infraestrutura
- **Hospedagem atual:** Vercel, região **`gru1` (São Paulo, Brasil)**.
- **Banco de dados:** PostgreSQL gerenciado.
- **Plano de migração:** AWS **sa-east-1 (São Paulo)**.

> ⚠️ **Divergência a resolver antes do lançamento:** a Política de Privacidade já publicada
> afirma que a infraestrutura opera em "AWS sa-east-1, sem transferência internacional", mas a
> hospedagem **atual** é a Vercel. É preciso alinhar: ou concluir a migração para AWS antes do
> lançamento, ou ajustar o texto da Política para refletir o provedor atual.

### 6.2. Subprocessadores e fontes de dados externas

| Subprocessador / Fonte | Dado trafegado | Região | Transferência internacional |
|---|---|---|---|
| Provedor de hospedagem (Vercel hoje / AWS planejado) | Tráfego, cookies de sessão, payloads | São Paulo (BR) | Não |
| Banco de dados gerenciado (PostgreSQL) | Base completa (perfil, carteira, transações, logs) | São Paulo (BR) | Não |
| BRAPI | Apenas tickers/símbolos (sem PII) | Brasil | Não |
| BACEN (SGS) | IDs de séries econômicas (sem PII) | Brasil | Não |
| B3 (COTAHIST) | Tickers + datas (sem PII) | Brasil | Não |
| CVM (Dados Abertos) | CNPJs de fundos + metadados (sem PII) | Brasil | Não |
| Tesouro Direto / Transparente | Preços de títulos (sem PII) | Brasil | Não |
| **Yahoo Finance** | Tickers + intervalos de data (sem PII) | **EUA** | **Sim (sem PII)** |
| **CoinGecko** | IDs de cripto (sem PII) | **Global** | **Sim (sem PII)** |

> **Observação jurídica:** Yahoo Finance e CoinGecko são serviços internacionais. Embora **não
> recebam dados pessoais** (apenas consultas públicas de cotação), o advogado deve avaliar se cabe
> menção à transferência internacional na Política, dado que há comunicação com servidores no
> exterior.

---

## 7. Alertas Jurídicos de Alto Impacto — ✅ atualizado

### 7.1. Plano para Consultores (multilocação e compartilhamento)
- **Consentimento explícito e revogável:** o cliente final deve autorizar o acesso do consultor.
  O fluxo de convite/aceite (`ConsultantInvite`) já existe; recomenda-se confirmar com o jurídico
  o texto do opt-in apresentado ao cliente.
- **Segregação lógica:** já implementada (um consultor não acessa clientes de outro consultor).
- **Trilha de auditoria:** já implementada (ver 5.3) — não é mais um item futuro.

### 7.2. Módulo de Imposto de Renda (sigilo fiscal)
- **Responsabilidade do titular:** recomenda-se estipular nos Termos que o app é ferramenta de
  **conferência, consolidação e auxílio**; a responsabilidade pela veracidade e envio da
  declaração é exclusivamente do usuário. O cliente preenche os valores; o app apenas consolida e
  organiza. O app se isenta de erros de preenchimento do usuário ou de dados incorretos vindos de
  APIs externas.
- **Sigilo fiscal:** os dados consolidados para IR gozam de alta expectativa de sigilo. Tecnicamente
  estão sujeitos às mesmas medidas de segurança da Seção 5.5.

---

## 8. Considerações Finais para os Termos de Uso

Recomenda-se que o advogado estipule: regras de rescisão antecipada e multas por cancelamento de
contratos anuais parcelados; e as políticas de exclusão/anonimização dos dados após o
encerramento da conta (Art. 18) — observando que o mecanismo de exclusão/anonimização e a
exportação **já estão implementados** (Seção 5.1) e que dados transacionais são retidos por 5
anos por obrigação fiscal. Deve-se ratificar que o app é ferramenta de gestão e educação e **não**
presta assessoria financeira, contábil ou fiscal.

---

## 9. Pendências antes do lançamento — ⚠️

1. **Segredo do 2FA (`totpSecret`) em texto puro no banco** — débito técnico documentado; migrar
   para armazenamento criptografado (KMS) antes do lançamento.
2. **Alinhar Política × hospedagem real** — concluir migração para AWS sa-east-1 **ou** ajustar o
   texto que hoje afirma AWS (Seção 6.1).
3. **Decisão sobre criptografia de campo** — definir se dados de alta sensibilidade (consolidação
   IR) receberão criptografia aplicativa adicional, conforme sugerido no relatório original.
4. **Integração Stripe** — ao integrar, atualizar a Política para refletir a coleta de
   CPF/CNPJ/endereço e o papel do Stripe como operador (Seções 1 e 3).
5. **Texto do opt-in do cliente final do consultor** — validar redação com o jurídico (Seção 7.1).
