# Decisões — Análise de Ativos v2.4 (spec do Pedro, out/2026)

As decisões desta spec **não** são mantidas aqui. A fonte única, que PREVALECE sobre a spec do Pedro
(`especificacao-v2.*`) e sobre o HTML dele (`prototipo-pedro-v2.html`), é:

**[`docs/analise-ativos/v2-filtros/decisoes.md`](../v2-filtros/decisoes.md)**

Lá estão as decisões D1–D6 do Wellington (13/10/2026) e as 9 recomendações do desenho, todas
aprovadas ("pode seguir"):

- D1 estrutura/textos/ordem = HTML do Pedro; cores = paleta My Finance.
- D2 fundamentos da CVM/COTAHIST; "Lucro líq. ⓘ"/"Margem líq. ⓘ" com aviso (não existe "descontado").
- D3 FII: vacância/inadimplência/LTV = "sem dado" para todos; chip desabilitado; alavancagem =
  "Obrigações/PL ≤ 20%".
- D4 financeiras "n de 3" (EBITDA, Dív.líq/EBITDA e FCL "não se aplica").
- D5 fora: Ranking/votos/teses públicas, Stocks/REITs, Salvos/Criar lista/Salvar.
- D6 o banco do score fica nesta rodada; só sai da superfície (API, tela, textos).
- Recomendações 1–9: Planejar = Objetivo da Carteira (% da aba); Registrar operação = modal
  rápido sobre as rotas reais; FoF/sem tipo pela composição; âncora de meses; janela 10 em FII
  com nota; rodapé legal único PROVISÓRIO; Comparar não grava; Quadro filtrado no servidor;
  consultor pode Ver, Planejar e Registrar, com aviso.

Documentos relacionados:

- Especificação técnica final: `docs/analise-ativos/v2-filtros/spec-desenho.json`.
- Protótipo final: `docs/analise-ativos/v2-filtros/prototipo.html`.
- Ativação em produção (R1 → R2 → D6): [`ATIVACAO.md`](ATIVACAO.md).

## O que a fatia F (limpeza) fechou

- Nenhuma resposta de `/api/analise-ativos/*` tem chave de nota, Índice, semáforo, destaque,
  rating ou score (`src/app/api/analise-ativos/__tests__/contratoSemNota.test.ts`, lista branca
  vazia). Os campos de observação passaram a `observacao`/`observacoes`.
- Todos os módulos de textos da área passam pelo linguagemV2
  (`src/services/analiseAtivos/__tests__/linguagemV2Global.test.ts`); só os literais registrados em
  `textosLiterais.ts` (casamento exato) são exceção.
- Relatos antigos do indicador que saiu da tela aparecem como "indicador descontinuado".
- O pipeline do score (job `scores`, AssetScore, colunas do Índice) segue gravando até a D6.
