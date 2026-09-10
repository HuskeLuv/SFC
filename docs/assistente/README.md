# Assistente de IA — Fase 0 (camada de fornecedor + teste cego)

Plano completo: artifact "Plano do assistente" (03/09/2026). Decisão de 04/09: o modelo é escolhido
por **teste cego de qualidade** entre três candidatos, preço desempata. Nada no app chama um SDK
diretamente — tudo passa por `src/services/assistente/llm/`.

## Camada de fornecedor (`src/services/assistente/llm/`)

| Arquivo        | O que faz                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `types.ts`     | Interface única: `LlmRequest` (sistema, histórico, ferramentas, teto de saída, raciocínio) → `LlmResponse` |
| `pricing.ts`   | Preços por modelo (US$/1M), câmbio (`ASSISTENTE_CAMBIO_BRL`, padrão 5,39) e custo por chamada              |
| `anthropic.ts` | SDK oficial; cache do prompt de sistema; `thinking` desligado/limitado para chat curto                     |
| `openai.ts`    | Responses API via fetch; `reasoning.effort`; `prompt_cache_key` — **sem chave ainda, não exercitado**      |
| `google.ts`    | `generateContent` via fetch; `thinkingConfig` — **sem chave ainda, não exercitado**                        |
| `index.ts`     | `complete(model, request)`; descobre o fornecedor pelo id do modelo; `CANDIDATE_MODELS`                    |

Variáveis de ambiente (só no servidor, nunca no cliente): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GOOGLE_API_KEY`, `ASSISTENTE_CAMBIO_BRL` (opcional).

Regras que já valem desde o dia 1: prompt de sistema **estável** (sem data/hora/ids, para o cache
funcionar), `maxOutputTokens` baixo (300–500), `reasoning: 'none'` no chat, custo gravado por
mensagem.

## Teste cego (harness)

1. Subir o dev server (`npm run dev`) com uma conta de teste representativa (padrão: usuário demo).
2. Gerar o contexto compacto da conta:
   ```bash
   npx tsx --env-file=.env scripts/assistente/build-contexto.ts
   # HARNESS_EMAIL / HARNESS_PASSWORD / HARNESS_BASE_URL para outra conta ou prod
   ```
   Sai em `docs/assistente/contexto.json` (gitignored — dados de uma conta).
3. Rodar as perguntas contra os candidatos:
   ```bash
   npx tsx --env-file=.env scripts/assistente/harness.ts                     # 3 candidatos
   npx tsx --env-file=.env scripts/assistente/harness.ts --modelos=claude-haiku-4-5,claude-sonnet-5
   npx tsx --env-file=.env scripts/assistente/harness.ts --so=5 --repeticoes=2
   ```
   Modelos sem chave no ambiente são pulados com aviso.
4. Sai em `docs/assistente/resultados/<data>/` (gitignored):
   - `tabela-cega.md` — perguntas e respostas rotuladas A/B/C, com tabela para pontuar 0–3. **Pontuar antes de abrir o gabarito.**
   - `gabarito.json` — quem é A/B/C, custo médio por mensagem e por 90 mensagens/mês, latência, cache.
   - `resultados.json` — bruto.

`docs/assistente/perguntas.json` tem 20 perguntas **provisórias** (cobrem leitura, conceito, fluxo,
orçamento, saúde, dívidas, escrita com confirmação e dois casos de segurança). Substituir pelas 20
perguntas do Pedro quando chegarem — mesmo formato (`id`, `categoria`, `pergunta`, `esperado`).

## Fase 1 — MVP em produção (10/09/2026, modelo: Haiku 4.5)

Decisão de Wellington: começar com Haiku 4.5; outros modelos ficam para depois (o harness continua
disponível). Especificação funcional do Pedro: `especificacao-assistente-v1.1.md` (catálogo de
intenções, confirmação obrigatória, métricas, limite CVM).

**Como funciona:** toda mensagem vai para o modelo com o retrato compacto da conta no prompt
(`src/services/assistente/contexto.ts`, reaproveitando as rotas GET existentes, cache de 5 min por
usuário; a parte estável do prompt é cacheada na Anthropic). Única ferramenta: `propor_lancamento`
→ o servidor monta uma proposta assinada (HMAC, 10 min) → o app mostra um cartão → o usuário
confirma → `POST /api/assistente/confirmar` soma na célula do mês (comentário carimbado
"(assistente)", histórico `valor.editar` desfazível, recálculo de snapshots e alertas de orçamento).
Consultor agindo por cliente: só leitura.

| Peça                     | Onde                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Rotas                    | `src/app/api/assistente/route.ts` (GET status, POST mensagem), `confirmar/route.ts` |
| Prompt + ferramenta      | `src/services/assistente/prompt.ts`                                                 |
| Contexto compacto        | `src/services/assistente/contexto.ts`                                               |
| Proposta / gravação      | `src/services/assistente/lancamento.ts`                                             |
| Limite mensal + métricas | `src/services/assistente/limite.ts`, tabela `assistente_mensagens`                  |
| Intenção (só métrica)    | `src/services/assistente/intencao.ts`                                               |
| Painel flutuante         | `src/components/assistente/AssistentePanel.tsx` (montado em `AdminLayoutClient`)    |
| Rate limit               | `/api/assistente` 20 req/min por IP (`src/lib/rateLimit.ts`)                        |
| LGPD                     | `/subprocessadores` lista a Anthropic (EUA, art. 33 IX)                             |

Variáveis: `ASSISTENTE_HABILITADO=true` liga tudo (sem ela o botão não aparece e a API devolve 503);
`ASSISTENTE_MODELO`, `ASSISTENTE_LIMITE_MENSAL` (300), `ASSISTENTE_SECRET` (fallback `JWT_SECRET`).
Migração: `prisma/migrations/20260910150000_add_assistente_mensagens` (dev: `scripts/apply-assistente-migration.ts`).

**Gap com a especificação (alinhar com o Pedro):** a spec assume lançamentos individuais com conta,
cartão, fatura e vencimento; o My Finance é uma planilha mensal. Saldo de conta, fatura e vencimentos
não existem como dado — o prompt explica isso e a intenção fica registrada como `nao_suportado`.
"Criar despesa/receita" = somar na célula do mês da linha mais parecida.

**Métricas (SQL rápido):** `SELECT intencao, motor, count(*), sum("custoBrl") FROM assistente_mensagens
WHERE "createdAt" >= date_trunc('month', now()) GROUP BY 1,2;` e
`SELECT "textoUsuario" FROM assistente_mensagens WHERE intencao IN ('outro','nao_suportado','recomendacao_investimento');`

## Próximo passo

Liberar para os testers (flag em prod), medir intenções/custo por duas semanas e daí decidir a
Camada 1 (regras) e a Fase 2 da spec (análises, alertas proativos, onboarding). O teste cego com
OpenAI/Google continua disponível quando houver chaves e as 20 perguntas do Pedro.
