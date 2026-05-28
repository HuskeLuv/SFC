# Runbook de resposta a incidentes — MyFinance

Documento operacional para resposta a incidentes de segurança que afetem
dados pessoais, em cumprimento ao **Art. 48 da LGPD** (Lei nº 13.709/2018).

> ⚠️ Este é um documento vivo. Deve ser revisto após cada incidente
> registrado e ao menos a cada 12 meses.

## 1. Definições

**Incidente de segurança com dados pessoais**: ocorrência que possa
acarretar risco ou dano relevante aos titulares — vazamento, alteração
indevida, perda de disponibilidade, acesso não autorizado.

**Exemplos típicos**:

- Vazamento de credenciais (banco de dados, dump, repositório público)
- Acesso não autorizado à infraestrutura (RDS, conta IAM comprometida)
- Falha técnica que expõe dados (bug em endpoint, IDOR, etc.)
- Erro humano (envio de e-mail com dados de outro user, etc.)
- Comprometimento de subprocessador (AWS, BRAPI, etc.)
- Ataque ransomware com indisponibilidade prolongada

## 2. Papéis

| Papel               | Responsabilidade                                | Contato                     |
| ------------------- | ----------------------------------------------- | --------------------------- |
| **DPO/Encarregado** | Coordenação geral, comunicação ANPD e titulares | dpo@appmyfinance.com.br     |
| **Tech Lead**       | Diagnóstico técnico, contenção, recuperação     | suporte@appmyfinance.com.br |
| **Comunicação**     | Texto da notificação a titulares, redes sociais | TBD                         |

> TODO: definir Tech Lead e ponto focal de comunicação após a operação
> ser formalmente constituída.

## 3. Fluxo de resposta

### Fase 1 — Detecção (T = 0)

**Gatilhos**:

- Alerta automático (logs de auditoria, CloudWatch, etc.)
- Reporte de usuário ou pesquisador externo
- Identificação interna durante desenvolvimento/manutenção
- Notificação de subprocessador

**Ações imediatas**:

1. Registrar timestamp da detecção, descrição, fonte
2. Abrir o registro do incidente em planilha/ticket dedicado
3. Notificar o DPO em até **1 hora** após a detecção

### Fase 2 — Contenção (T + até 4h)

**Objetivo**: limitar o alcance do incidente.

**Ações típicas**:

- Revogar credenciais comprometidas (rotacionar JWT_SECRET, KMS keys,
  senhas de service accounts)
- Bloquear conta(s) afetada(s) temporariamente
- Tirar instância ou endpoint do ar se for vetor de exploração ativa
- Isolar segmento de rede afetado (Security Groups, NACLs)
- Preservar evidências (snapshots, dumps de log) antes de qualquer
  ação destrutiva

### Fase 3 — Análise (T + até 24h)

**Perguntas a responder**:

- Que dados pessoais foram potencialmente acessados/vazados/alterados?
  (escopo: PII básica, financeiro, logs, etc.)
- Quantos titulares foram afetados?
- Por quanto tempo a vulnerabilidade ficou exposta?
- Qual a causa raiz?
- Há indícios de exploração efetiva (vs. apenas exposição)?

**Saídas**:

- Relatório técnico interno (timeline, evidências, escopo)
- Avaliação do **risco** aos titulares (baixo / médio / alto)
- Plano de remediação técnica

### Fase 4 — Notificação (T + até 72h, conforme risco)

**Decisão**: comunicar ou não à ANPD e aos titulares?

**Critérios para notificar** (Art. 48 LGPD, Resolução CD/ANPD nº 15/2024):

- Dados sensíveis (mesmo que poucos titulares)
- Dados de mais de **N titulares** (limite operacional a definir; ANPD
  considera "número significativo")
- Risco concreto de dano material ou moral aos titulares
- Quando em dúvida — **notificar**

**Canal ANPD**:

- Portal: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento
- E-mail: comunicacao@anpd.gov.br
- Prazo: "razoável", interpretado como até **3 dias úteis** após a
  decisão de comunicar

**Conteúdo da notificação à ANPD** (Resolução CD/ANPD 15/2024):

- Descrição da natureza dos dados afetados
- Informações sobre os titulares envolvidos (quantidade, perfil)
- Indicação de medidas técnicas e de segurança utilizadas
- Riscos relacionados ao incidente
- Motivos de eventual demora na comunicação
- Medidas adotadas ou que serão adotadas para reverter/mitigar

**Comunicação aos titulares** (quando o risco for relevante):

- E-mail direto aos afetados, em linguagem clara
- Aviso no aplicativo (banner ou modal)
- Comunicado no site (se necessário)

### Fase 5 — Recuperação e prevenção (T + dias a semanas)

- Aplicar correção técnica definitiva (patch, refactor, controle adicional)
- Adicionar teste/regra de monitoramento que pegue caso similar
- Revisar políticas e treinamentos se causa foi humana
- Atualizar este runbook se a resposta revelar lacunas
- Comunicar resultado final aos titulares e à ANPD (se houve
  notificação inicial)

## 4. Templates

### Template — Notificação à ANPD

```
Assunto: Comunicação de incidente — Art. 48 LGPD — MyFinance

À Autoridade Nacional de Proteção de Dados,

Em cumprimento ao Art. 48 da Lei nº 13.709/2018 e à Resolução CD/ANPD
nº 15/2024, comunicamos:

CONTROLADOR: MyFinance (CNPJ TBD)
ENCARREGADO: [Nome do DPO] — dpo@appmyfinance.com.br

DATA DA DETECÇÃO: [DD/MM/AAAA HH:MM]
DATA ESTIMADA DO INÍCIO: [DD/MM/AAAA]

NATUREZA: [descrição técnica do incidente]
DADOS AFETADOS: [tipos: nome, e-mail, hash de senha, transações...]
TITULARES AFETADOS: [quantidade estimada e perfil]
RISCO ESTIMADO: [baixo / médio / alto, justificativa]

MEDIDAS DE SEGURANÇA EM USO: [breve descrição]
MEDIDAS DE CONTENÇÃO ADOTADAS: [lista]
MEDIDAS DE MITIGAÇÃO PLANEJADAS: [lista]

COMUNICAÇÃO AOS TITULARES: [meio + cronograma]

Permanecemos à disposição para esclarecimentos adicionais.

Atenciosamente,
[Nome] — Encarregado
```

### Template — Comunicação ao titular

```
Assunto: Comunicação importante sobre seus dados na MyFinance

Olá [nome],

Em [data] identificamos [descrição breve e clara]. Seus dados podem
ter sido afetados.

DADOS ENVOLVIDOS: [lista clara]
RISCO PARA VOCÊ: [explicação em linguagem leiga]

O QUE FIZEMOS: [contenção e medidas]
O QUE PEDIMOS QUE VOCÊ FAÇA: [trocar senha, ficar atento a phishing,
acompanhar fatura, etc.]

A Autoridade Nacional de Proteção de Dados (ANPD) foi comunicada em
[data], conforme o Art. 48 da LGPD.

Em caso de dúvidas, escreva ao nosso Encarregado em
dpo@appmyfinance.com.br.

Pedimos desculpas pelo transtorno.

Equipe MyFinance
```

## 5. Registro de incidentes (log obrigatório)

Manter planilha/ticket por incidente com:

- ID, data/hora de detecção, fonte, descrição
- Escopo final (titulares e dados afetados)
- Decisão de notificar (sim/não, justificativa)
- Datas: detecção, contenção, análise concluída, ANPD notificada,
  titulares notificados, encerramento
- Causa raiz e ação de prevenção
- Anexos: evidências, comunicações enviadas

Retenção mínima: **5 anos** após o encerramento.

## 6. Comunicação interna durante o incidente

- Canal dedicado (Slack/Discord) para o time envolvido
- Atualizações a cada 4h enquanto o incidente estiver ativo
- Status público quando indisponibilidade afetar mais de 5% dos users

## 7. Pós-mortem

Para todo incidente com classificação ≥ médio, realizar pós-mortem com:

- Timeline completa
- O que funcionou, o que não funcionou
- 3 a 5 ações concretas de prevenção, com responsável e prazo
- Atualização deste runbook se necessário

---

**Versão**: 1.0 · **Última revisão**: 2026-05-28

> Próximas revisões obrigatórias: após cada incidente registrado;
> a cada 12 meses; quando houver mudança relevante na arquitetura ou
> nos subprocessadores.
