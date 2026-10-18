# Auditoria dos ramos binários de classe (fatia 0 · Stocks e REITs)

Gerada na fatia 0 (17–18/10/2026) a partir de `grep` por `classe === 'fii'` / `classe === 'acao'` (e negações) em `src/` (sem testes). Com `ClasseQuadro` = `acao | fii | stock | reit`, um ramo binário trata stock como ação (ramo `acao`) ou como FII (ramo `fii`) sem aviso do TypeScript. Cada arquivo tem UMA fatia dona para revisar o ramo quando a classe EUA passar por ele. Ferramenta de decisão: `familiaDados`, `ehClasseEua`, `ehClasseImobiliaria`, `moedaDaClasse` (src/types/analiseAtivosEua.ts).

Legenda: **A–D** = dono pelo desenho (final.fatias[].arquivos); _sugerido_ = arquivo fora das listas do desenho, dono proposto pela área; **—** = só Brasil (stock/reit não chegam: o job/rota é BR ou o recurso não existe para EUA no MVP).

| Arquivo                                                                    | Linhas                      | Dono                                                   |
| -------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| `src/app/api/analise-ativos/cenarios/[ticker]/route.ts`                    | 68,83                       | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/components/analiseAtivos/ativo/acoes/BarraAcoesAtivo.tsx`             | 87,90,211                   | D                                                      |
| `src/components/analiseAtivos/ativo/acoes/ModalComparar.tsx`               | 63,94                       | D (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/ativo/acoes/ModalPlanejar.tsx`               | 86                          | D                                                      |
| `src/components/analiseAtivos/ativo/analise/BlocoPares.tsx`                | 100,170,185                 | C (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/ativo/analise/TabelaRaioX.tsx`               | 137,236                     | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/components/analiseAtivos/ativo/cenarios/FormPremissas.tsx`            | 71,90                       | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/components/analiseAtivos/ativo/cenarios/LinhaSuaPosicao.tsx`          | 39                          | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/components/analiseAtivos/ativo/cenarios/MeusCenarios.tsx`             | 59,167,220                  | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/components/analiseAtivos/ativo/cenarios/useEstadoCenario.ts`          | 73,210                      | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/components/analiseAtivos/ativo/criterios/CardCriterios.tsx`           | 68                          | C (ramo revisto na 0: EUA usa a fonte SEC)             |
| `src/components/analiseAtivos/ativo/topo/BlocoDividendos.tsx`              | 46,89,90,248                | C                                                      |
| `src/components/analiseAtivos/ativo/topo/BlocoEventos.tsx`                 | 29                          | C                                                      |
| `src/components/analiseAtivos/ativo/topo/BlocoKpis.tsx`                    | 62                          | C                                                      |
| `src/components/analiseAtivos/ativo/topo/GraficoLucroCotacao.tsx`          | 297                         | C                                                      |
| `src/components/analiseAtivos/comparador/BotaoSalvarComparacao.tsx`        | 157                         | C (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/comparador/Comparador.tsx`                   | 129,246,338,345             | C                                                      |
| `src/components/analiseAtivos/comparador/ModalExportarPdf.tsx`             | 104,171                     | C (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/comparador/SlotAdicionar.tsx`                | 34,159,160,166              | C (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/comparador/useEstadoComparadorUrl.ts`        | 57                          | C (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/quadro/BandejaComparar.tsx`                  | 45                          | C (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/quadro/CartoesQuadro.tsx`                    | 187,243,245                 | C                                                      |
| `src/components/analiseAtivos/quadro/CelulaNaCarteira.tsx`                 | 106,135                     | D                                                      |
| `src/components/analiseAtivos/quadro/FiltrosQuadro.tsx`                    | 45                          | C (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/quadro/FiltrosSalvos.tsx`                    | 108                         | 0 (feito nesta fatia: valor final ou ramo revisto)     |
| `src/components/analiseAtivos/quadro/ModalSalvarFiltro.tsx`                | 204                         | 0 (feito nesta fatia: valor final ou ramo revisto)     |
| `src/components/analiseAtivos/quadro/QuadroAnalise.tsx`                    | 307,456                     | C                                                      |
| `src/components/analiseAtivos/quadro/TabelaQuadro.tsx`                     | 112                         | C                                                      |
| `src/components/analiseAtivos/quadro/useEstadoQuadroUrl.ts`                | 96,116                      | C                                                      |
| `src/components/analiseAtivos/quadro/useSelecaoComparar.ts`                | 37                          | C (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/salvos/AbaAlertas.tsx`                       | 451                         | D (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/salvos/PaginaSalvos.tsx`                     | 105,382,412,437             | D (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/salvos/TabelaSalvos.tsx`                     | 246                         | D (sugerido: fora da lista do desenho)                 |
| `src/components/analiseAtivos/shell/PilulasArea.tsx`                       | 98                          | C (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/alertas/avisosDoUsuario.ts`                    | 46                          | D (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/alertas/executarAlertasSalvos.ts`              | 241,319                     | D (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/alertas/textosDoAviso.ts`                      | 80,88                       | D (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/calculo/recalcularScores.ts`                   | 1405,1406,1414,1444         | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/cenarios/cenarioService.ts`                    | 99                          | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/curadoria/filaCuradoria.ts`                    | 422                         | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/curadoria/registrarReporte.ts`                 | 198                         | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/fontes/fundamentos/fonteCvm.ts`                | 184,185                     | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/fontes/fundamentos/fonteExemplo.ts`            | 52                          | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/fontes/fundamentos/ingerirFontes.ts`           | 277,343,344                 | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/leitura/ativo/baseCenarios.ts`                 | 169,252                     | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/leitura/ativo/dividendosAnuais.ts`             | 55,94                       | C (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/leitura/ativo/eventosAtivo.ts`                 | 65,90                       | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/leitura/ativo/frescorAtivo.ts`                 | 59,69                       | 0 (feito nesta fatia: valor final ou ramo revisto)     |
| `src/services/analiseAtivos/leitura/ativo/frescorBlocos.ts`                | 209                         | C (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/leitura/ativo/fundamentosEssencial.ts`         | 1051                        | C (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/leitura/ativo/kpisAtivo.ts`                    | 401                         | C                                                      |
| `src/services/analiseAtivos/leitura/ativo/montarTopoAtivo.ts`              | 190,213,219                 | C                                                      |
| `src/services/analiseAtivos/leitura/ativo/paresAtivo.ts`                   | 57,78,86                    | C                                                      |
| `src/services/analiseAtivos/leitura/ativo/raioX.ts`                        | 335                         | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/leitura/ativo/sugestoesComparar.ts`            | 54,63,86,110,113,117,125    | C (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/leitura/ativo/valuationMultiplos.ts`           | 231,260,781,833,986         | C (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/leitura/comparador/montarComparador.ts`        | 131,236,278,297,299,382,518 | C                                                      |
| `src/services/analiseAtivos/leitura/criterios/lerCriterios.ts`             | 170,226                     | C                                                      |
| `src/services/analiseAtivos/leitura/linhasQuadro.ts`                       | 432                         | 0 (feito nesta fatia: valor final ou ramo revisto)     |
| `src/services/analiseAtivos/pdf/montarDocumentoComparacao.ts`              | 167                         | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/quadro/consultaQuadro.ts`                      | 130,180,204,207,270,271     | C                                                      |
| `src/services/analiseAtivos/quadro/indiceBusca.ts`                         | 37                          | C                                                      |
| `src/services/analiseAtivos/quadro/montarLinhasQuadro.ts`                  | 297,346,535,536,562         | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/quadro/tipoFiiExibido.ts`                      | 50                          | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/regras/calculo/multiplos.ts`                   | 255,303                     | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/regras/calculo/plausibilidadeProventos.ts`     | 93,100,113                  | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/regras/calculo/proventos.ts`                   | 255,287,450,514             | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/regras/calculo/sanidade/aplicarConferencia.ts` | 268,294                     | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/regras/calculo/sanidade/precoEsporadico.ts`    | 86,90                       | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/regras/carteira/registroOperacao.ts`           | 68,78                       | D                                                      |
| `src/services/analiseAtivos/regras/carteira/secaoOperacao.ts`              | 38,112,121                  | 0 (feito nesta fatia: valor final ou ramo revisto)     |
| `src/services/analiseAtivos/regras/comparador/indicadores.ts`              | 99,377                      | C                                                      |
| `src/services/analiseAtivos/regras/criterios/perfilCriterios.ts`           | 24,59                       | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/regras/valuation/montarCenarios.ts`            | 398,426,459,503             | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/repositorio/universo.ts`                       | 119                         | — (só Brasil: stock/reit não chegam aqui; job/rota BR) |
| `src/services/analiseAtivos/salvos/contrato.ts`                            | 119,271,419                 | D                                                      |
| `src/services/analiseAtivos/salvos/linhasDaLista.ts`                       | 97                          | D (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/salvos/listasService.ts`                       | 112,548                     | D (sugerido: fora da lista do desenho)                 |
| `src/services/analiseAtivos/textosCriterios.ts`                            | 316                         | 0 (feito nesta fatia: valor final ou ramo revisto)     |
