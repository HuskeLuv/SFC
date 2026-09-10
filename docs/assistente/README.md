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

## Próximo passo

Com as três chaves e as perguntas do Pedro: rodar o harness, pontuar, escolher o modelo (e, se
fizer sentido, um segundo modelo mais forte só para propostas de escrita). Depois Fase 1: rota
`/api/assistente` com ferramentas de leitura, limite mensal e log de custo por usuário.
