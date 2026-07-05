# Relatório de Arquitetura de Planos, Precificação e Fluxos de Dados para Conformidade LGPD

**Revisão Técnica v2 — Junho/2026 — Escopo: sistema completo no lançamento**

## Nota desta revisão

Esta revisão foi reescrita sob uma premissa diferente da anterior: o corpo jurídico
elaborará Termos de Uso, Política de Privacidade e RIPD para o **produto completo, tal como
existirá no lançamento** — com cobrança via Stripe, planos pagos e hospedagem em **AWS
`sa-east-1` (São Paulo)** todos ativos. Por isso este documento **não** marca funcionalidades
como "ainda não implementadas" nem aponta divergência entre a hospedagem atual e a planejada:
parte-se do estado de lançamento como o estado de referência.

O foco passa a ser:
1. Garantir que as afirmações técnicas em que os documentos jurídicos vão se apoiar sejam
   **fiéis ao que será construído** (criptografia, transferência internacional, papel do Stripe).
2. **Análise nova e central:** se os dados que serão compartilhados com o Stripe são
   **necessários** e **em que momento** devem ser coletados (Seção 3).
3. Documentar a camada de conformidade LGPD **já construída**, para subsidiar o RIPD (Seção 6).

---

## 1. Arquitetura de Cobrança e o Stripe como Operador de Dados

O My Finance utilizará o Stripe como gateway de pagamento e motor de cobrança recorrente
(Stripe Billing). Sob a LGPD, o Stripe atua como **Operador de Dados** (Art. 5º, VII):

- **Tokenização de cartões:** dados de cartão e credenciais de pagamento **nunca** são
  armazenados em servidores próprios do My Finance. São capturados via Stripe Elements/SDK e
  tokenizados nos servidores do operador.
- **Dados compartilhados com o Stripe:** Nome Completo, CPF/CNPJ, E-mail, Endereço de
  Faturamento e Dados do Meio de Pagamento (ver análise de necessidade e de momento da coleta
  na Seção 3).
- **Sincronização via webhooks:** o app recebe apenas metadados de status da assinatura
  (`subscription.created`, `invoice.paid`, etc.) para ativar/desativar permissões de acesso
  (entitlements) no banco interno.
- **Natureza da relação:** é indispensável firmar o **Contrato de Operador (DPA)** do Stripe e,
  por se tratar de operador sediado no exterior, observar a transferência internacional descrita
  na Seção 7.

---

## 2. Matriz de Assinaturas, Preços e Entregas Funcionais

O controle de acesso no lançamento é por **plano pago** (entitlement sincronizado do Stripe),
além dos papéis operacionais (`user`, `consultant`, `admin`).

| Plano | Valor | Funcionalidades | Dados processados |
|---|---|---|---|
| Standard | R$ 99,00/ano (parcelável no gateway) | Fluxo de caixa manual; App celular | Perfil (nome, e-mail); receitas/despesas/categorias manuais |
| Silver | R$ 29,90/mês (fidelidade anual, parcelável) | + Carteira manual básica; Planejamento de aposentadoria; iPad/Tablet | + Dados patrimoniais inseridos manualmente |
| Gold | R$ 59,90/mês (fidelidade anual, parcelável) | + Balanço patrimonial dinâmico; Relatórios de performance; Carteira completa; Análise da carteira; Notificações; Área educacional (11+ cursos) | + Rentabilidade agregada, histórico de proventos, preferências de notificação, progresso educacional |
| Premium | R$ 99,00/mês (anual, parcelável) | + Análise fundamentalista completa; Auxílio IRPF | + Receita bruta, gastos dedutíveis, proventos fiscais (conferência) |
| Consultor | R$ 495,00/mês (anual, parcelável) | Painel master; gestão de carteiras/orçamentos de clientes; planejamento para terceiros | **PONTO CRÍTICO:** compartilhamento de dados financeiros sensíveis dos clientes finais com o consultor |

> **Nota sobre APIs externas:** a observação "consome APIs de terceiros sem cruzamento de dados
> pessoais" do plano Premium aplica-se a **todo o app**, não só à análise fundamentalista — todas
> as cotações e proventos usam fontes externas. Lista completa na Seção 7.

---

## 3. Necessidade dos Dados do Stripe e Momento da Coleta — análise (NOVA SEÇÃO)

Esta seção responde a duas perguntas de negócio/jurídicas: **(a)** cada dado enviado ao Stripe é
realmente necessário? **(b)** devemos coletá-los já no cadastro ou apenas no momento da compra?

### 3.1. Necessidade de cada dado

Premissa: a matriz da Seção 2 oferece **parcelamento** em todos os planos e, no Brasil, o Stripe
suporta cartão, **boleto** e **Pix**. Isso determina o que é exigido.

| Dado | É necessário? | Por quê | Onde fica armazenado |
|---|---|---|---|
| **Dados do cartão** | Sim | Indispensável para cobrança em cartão | **Só no Stripe** (tokenizado); nunca em servidor próprio |
| **E-mail** | Sim | Recibos, faturas, comunicação de cobrança | Já coletado hoje (modelo `User`) |
| **Nome completo** | Sim (efetivo) | Antifraude (Stripe Radar), recibo e nota fiscal | Já coletado hoje (`name`) |
| **CPF/CNPJ** (`tax_id`) | **Sim** | Stripe **exige** `tax_id` para **boleto** e **Pix**; parcelamento de cartão no BR usualmente exige CPF; **emissão de nota fiscal** de SaaS exige CPF/CNPJ do pagador | Stripe (Customer) e, se a NF for emitida por nós, também localmente |
| **Endereço de faturamento** | Condicional | **Obrigatório para boleto** e usado em antifraude/NF; opcional se fosse exclusivamente cartão | Preferencialmente **só no Stripe** |

**Conclusão de necessidade:** todos os dados listados são justificáveis **desde que** boleto/Pix
e/ou parcelamento sejam oferecidos (e são) e que haja emissão de NF. CPF/CNPJ deixa de ser
"desejável" e passa a ser **necessário** para esses meios de pagamento e para a obrigação fiscal.
A base legal correspondente é **execução de contrato** (Art. 7º, V) para a cobrança e **cumprimento
de obrigação legal/fiscal** (Art. 7º, II) para a NF.

### 3.2. Devemos coletar já no início (no cadastro)?

**Recomendação: não.** Coletar CPF/CNPJ e endereço apenas **no momento do checkout/assinatura**,
não no cadastro. Justificativas:

- **Minimização (Art. 6º, III):** usuários em cadastro, avaliação ou plano gratuito/trial não
  geram cobrança; coletar CPF/endereço antes da compra retém dado sensível sem finalidade ativa.
- **Redução de superfície de vazamento:** quanto menos PII de pagamento residir no nosso banco,
  menor o impacto de um incidente. O ideal é que **o Stripe seja o repositório** desses dados.
- **Arquitetura recomendada:** usar Stripe Checkout/Elements + objeto **Customer** do Stripe para
  **coletar e guardar** CPF/endereço/cartão no operador. No nosso banco, persistir apenas:
  `stripeCustomerId`, `stripeSubscriptionId`, plano/entitlement e status da assinatura.
- **Exceção — nota fiscal:** se formos nós a emitir a NF, é legítimo persistir **localmente apenas
  CPF/CNPJ + nome** do assinante pagante, no ato do checkout, com retenção pela obrigação fiscal
  (encaixa na retenção de **5 anos** já existente — ver Seção 6.4). Endereço e dados de cartão
  permanecem no Stripe.

Isso preserva a postura **minimalista** do cadastro atual (Seção 4) e concentra a PII de pagamento
no operador especializado.

### 3.3. Impacto nos documentos jurídicos

- A **Política de Privacidade** deve declarar que CPF/CNPJ e endereço são coletados **na
  contratação de plano pago** (não no cadastro), com finalidade de cobrança e obrigação fiscal, e
  que o tratamento de cartão ocorre **inteiramente no Stripe**.
- Os **Termos** devem refletir que a relação de pagamento é operada pelo Stripe e que o usuário
  consente com o compartilhamento dos dados de faturamento para esse fim.

---

## 4. Dados Pessoais Coletados — cadastro minimalista + dados de faturamento no checkout

No **cadastro**, o sistema armazena (modelo `User`):

| Campo | Natureza |
|---|---|
| `email` (único) | Identificação / login |
| `name` | Nome de exibição |
| `password` | **Hash bcrypt (custo 12)** — nunca texto puro |
| `avatarUrl` | Opcional |
| `role` | `user` / `consultant` / `admin` |
| `totpSecret` / `totpEnabled` | Segredo do 2FA (ver Seção 9) |
| `createdAt` / `updatedAt` | Metadados |

O cadastro **não** coleta CPF, CNPJ, endereço, telefone ou data de nascimento. Os dados
financeiros/patrimoniais (carteira, transações, fluxo de caixa, planejamento) são **inseridos
manualmente pelo próprio titular**. CPF/CNPJ (e endereço, no Stripe) só entram **no checkout do
plano pago**, conforme a Seção 3. Esta postura minimalista é favorável à conformidade e deve ser
destacada nos Termos/Política.

---

## 5. Módulos Internos e Natureza Jurídica dos Dados

- **Módulo de Fluxo de Caixa e Orçamento:** dados financeiros comuns. Finalidade: monitorar a
  saúde financeira corrente. Base legal: execução de contrato.
- **Módulo de Investimentos e Carteira:** dados patrimoniais. Proteção: criptografia em trânsito
  (HTTPS/TLS) e em repouso na infraestrutura gerenciada (AWS `sa-east-1`).
- **Módulo de Auxílio Fiscal (IRPF):** dados de alta sensibilidade fiscal (receita bruta, gastos
  dedutíveis, proventos). Finalidade: facilitar o cumprimento de obrigações tributárias. Base
  legal: execução de contrato, com alta expectativa de sigilo.

> **Compromisso técnico sobre criptografia:** a Política poderá afirmar **AES-256 em repouso**
> desde que esse seja o padrão efetivamente entregue no lançamento. Há dois níveis a alinhar:
> (a) criptografia de **disco/repouso** fornecida pela infraestrutura gerenciada (padrão do
> provedor), e (b) criptografia **em nível de campo** na aplicação para os dados de mais alta
> sensibilidade (consolidação de IR). Recomenda-se que o texto jurídico descreva exatamente o
> nível que será entregue, para que a afirmação seja verdadeira no lançamento. A decisão de
> aplicar criptografia de campo aos dados de IR está na Seção 9.

---

## 6. Medidas Técnicas e Organizacionais Já Implementadas (para o RIPD)

Controles de LGPD **já construídos**, relevantes para o RIPD e para a Política.

### 6.1. Direitos do titular (Art. 18) — operacionais
- **Acesso/confirmação (I–II):** leitura do perfil do titular.
- **Retificação (III):** edição de nome, e-mail e senha pelo próprio titular.
- **Eliminação/anonimização (IV):** exclusão de conta por **anonimização** (nome → "Usuário
  removido", e-mail anonimizado, senha randomizada). Registros transacionais preservados por
  **5 anos** por obrigação legal/fiscal.
- **Portabilidade (V):** exportação de todos os dados em **JSON** (perfil, carteira, transações,
  fluxo de caixa, planejamento, consentimentos, notificações).

### 6.2. Registro de consentimento (Art. 8º, §1º)
Modelo `UserConsent` registra: tipo de documento (política/termos), **versão**, data/hora, **IP**,
**user-agent** e data de **revogação**. Capturado no cadastro; revogação preservada.

### 6.3. Trilha de auditoria do consultor (multilocação)
Modelo `ConsultantImpersonationLog` registra cada acesso do consultor: ID do consultor, ID do
cliente, ação, detalhes, IP, user-agent, token de sessão e timestamp. Segregação lógica entre
clientes de consultores diferentes garantida no nível de acesso.

### 6.4. Retenção automatizada
Rotina agendada: convites pendentes expiram em **30 dias**; logs de auditoria do consultor
eliminados após **365 dias**; contas excluídas são anonimizadas; dados transacionais (e fiscais,
incl. CPF para NF) retidos por **5 anos**.

### 6.5. Segurança de autenticação e aplicação
- **JWT em cookie httpOnly** + proteção **CSRF** (double-submit).
- **2FA TOTP** disponível.
- **bcrypt custo 12**; política de senha (mín. 8 caracteres, com letra e dígito).
- **Rate limiting** em rotas sensíveis (login/registro).
- Cabeçalhos **CSP** e **HSTS**.
- **Redação de PII** nos logs de produção.

### 6.6. Encarregado (DPO) e canais
- Encarregado/canal: **dpo@appmyfinance.com.br**.
- Prazo de resposta ao titular: **15 dias**.

### 6.7. Páginas legais e cookies
Publicadas: **Política de Privacidade**, **Termos de Uso**, **Subprocessadores** e **banner de
cookies**. (Política versão 1.0.)

---

## 7. Subprocessadores e Transferência Internacional (NOVA SEÇÃO — Art. 33)

### 7.1. Infraestrutura no lançamento
- **Hospedagem:** AWS **`sa-east-1` (São Paulo, Brasil)**.
- **Banco de dados:** PostgreSQL gerenciado, mesma região.

### 7.2. Subprocessadores e fontes externas

| Subprocessador / Fonte | Dado trafegado | Região | Transferência internacional |
|---|---|---|---|
| Hospedagem (AWS sa-east-1) | Tráfego, cookies de sessão, payloads | São Paulo (BR) | Não |
| Banco de dados gerenciado (PostgreSQL) | Base completa (perfil, carteira, transações, logs) | São Paulo (BR) | Não |
| **Stripe** (operador de pagamento) | **PII de faturamento: nome, CPF/CNPJ, e-mail, endereço, dados de cartão** | EUA / global | **Sim — transferência de dados pessoais** |
| BRAPI | Apenas tickers/símbolos (sem PII) | Brasil | Não |
| BACEN (SGS) | IDs de séries econômicas (sem PII) | Brasil | Não |
| B3 (COTAHIST) | Tickers + datas (sem PII) | Brasil | Não |
| CVM (Dados Abertos) | CNPJs de fundos + metadados (sem PII) | Brasil | Não |
| Tesouro Direto / Transparente | Preços de títulos (sem PII) | Brasil | Não |
| **Yahoo Finance** | Tickers + intervalos de data (sem PII) | EUA | Sim (sem PII) |
| **CoinGecko** | IDs de cripto (sem PII) | Global | Sim (sem PII) |

> **Ponto jurídico relevante (omitido no relatório original):** o **Stripe** caracteriza
> **transferência internacional de dados pessoais** (Art. 33), pois nome, CPF/CNPJ, e-mail e
> endereço do titular trafegam para um operador sediado no exterior. Isso exige base adequada —
> tipicamente **execução de contrato** (Art. 33, VI / Art. 7º, V) e/ou **cláusulas contratuais
> específicas** no DPA do Stripe — e menção expressa na Política. Já Yahoo Finance e CoinGecko são
> internacionais mas **não recebem PII** (apenas consultas públicas de cotação); cabe ao advogado
> decidir se ainda assim merecem menção.

---

## 8. Alertas Jurídicos de Alto Impacto

### 8.1. Plano para Consultores (multilocação e compartilhamento)
- **Consentimento explícito e revogável:** o cliente final deve autorizar o acesso do consultor.
  O fluxo de convite/aceite (`ConsultantInvite`) já existe; recomenda-se validar com o jurídico o
  texto do opt-in apresentado ao cliente.
- **Segregação lógica:** já implementada (um consultor não acessa clientes de outro).
- **Trilha de auditoria:** já implementada (ver 6.3).

### 8.2. Módulo de Imposto de Renda (sigilo fiscal)
- **Responsabilidade do titular:** estipular nos Termos que o app é ferramenta de **conferência,
  consolidação e auxílio**; a responsabilidade pela veracidade e envio da declaração é
  exclusivamente do usuário. O cliente preenche os valores; o app apenas consolida. O app se
  isenta de erros de preenchimento do usuário ou de dados incorretos vindos de APIs externas.
- **Sigilo fiscal:** dados consolidados para IR gozam de alta expectativa de sigilo; sujeitos às
  medidas da Seção 6.5 e à decisão de criptografia de campo da Seção 9.

---

## 9. Pendências técnicas antes do lançamento

1. **Criptografia de campo para dados de IR** — decidir e implementar criptografia em nível de
   aplicação para os dados de mais alta sensibilidade (consolidação fiscal), de modo que o nível
   declarado na Política seja entregue de fato (ver Seção 5).
2. **Gestão de segredos do 2FA** — o `totpSecret` deve ser armazenado de forma criptografada
   (ex.: AWS KMS), não em texto puro.
3. **DPA do Stripe e transferência internacional** — firmar o Contrato de Operador do Stripe e
   refletir a transferência internacional de PII na Política (Seção 7.2).
4. **Coleta de faturamento no checkout** — implementar a coleta de CPF/CNPJ/endereço **no momento
   da assinatura**, com o Stripe como repositório e armazenamento local mínimo (apenas CPF+nome se
   houver emissão de NF própria) — conforme Seção 3.2.
5. **Texto do opt-in do cliente final do consultor** — validar redação com o jurídico (Seção 8.1).
