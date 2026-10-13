# Análise de Ativos v2.4 — Filtros de Fundamentos · contratos e ownership (fatia 0)

Rodada: spec v2.4 do Pedro + decisões D1–D6 e 9 recomendações aprovadas em 13/10/2026
([decisoes.md](decisoes.md)). Especificação técnica: [spec-desenho.json](spec-desenho.json);
protótipo final: [prototipo.html](prototipo.html). Branch de integração `feat/analise-ativos-v2-filtros`.

## Regra de ownership

- Cada arquivo tem **um dono por fatia**. A fatia 0 (contratos) é **bloqueante** e entra antes; depois
  dela A, B, C1, C2 e D trabalham **em paralelo sem arquivo em comum**; F é sequencial (depois de A–D).
- Um arquivo listado em 0 **e** numa fatia paralela é contrato/stub criado na 0 e **preenchido** pela
  dona (ex.: `lerCriterios.ts` → A; `textosCenarios.test.ts` → C2; `textosComparador.test.ts` → D).
- `textosTela.ts`, `textos.ts` e `src/test/fixtures/analiseAtivos/respostas.ts` só mudam na **F**. Cada
  fatia usa o próprio módulo de textos (textosQuadro/B, textosAcoesCarteira/C1, textosAtivo/C2,
  textosComparador + textosEntradasComparador/D) e os compartilhados da 0 (textosCriterios,
  textosLiterais).
- Tipos: `src/types/analiseAtivosCriterios.ts` (novo) e os acréscimos **opcionais** de
  `analiseAtivosApi.ts`/`analiseAtivosBlocoD.ts` são da 0; a F torna obrigatórios os campos novos e
  remove Índice/semáforo/★. Nenhuma fatia paralela edita esses três arquivos.
- `src/constants/analiseAtivosVisual.ts`: B (paralela) e depois F (sequencial) — não é conflito.

## Contratos que atravessam fatias

| Contrato                                                                                      | Produz             | Consome                                                                                             |
| --------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `criteria_params` v1 (`criteriaParamsSchema`, `CRITERIA_PARAMS_V1`, `obterCriteriaParams`)    | 0                  | A                                                                                                   |
| `criteria_eval` + `AnaliseQuadroLinha.criterios` (`CriteriosCompactos`) e `perfilCriterios`   | A                  | B (`projetarCriteriosCompactos`)                                                                    |
| `obterCriteriosAtivo` / `obterCriteriosVarios` (`lerCriterios.ts`)                            | A                  | C2 (topo, pares), C1 (sugestões), D (comparador)                                                    |
| `LinhaQuadroApi.motivosConferencia` (= os `MotivoTela` que hoje vêm em `indice.motivos`)      | B (`linhasQuadro`) | C2 (`conferenciasAtivo`, `kpisAtivo`, `valuationMultiplos`, `baseCenarios`), D (`montarComparador`) |
| `TEXTOS_LITERAIS_OBRIGATORIOS` + `data-texto-legal`                                           | 0                  | B (rodapés), C2 (cenários), D (comparador/leitura)                                                  |
| `linguagemV2` + `varrerDom` (caso 32)                                                         | 0                  | B, C1, C2, D, F                                                                                     |
| Componentes neutros (`CelulaCriterios`, `MarcaCriterio`, `PilulasJanela`, `MiniBarrasAnuais`) | 0                  | B, C2, D                                                                                            |
| `TEXTOS_OPERACAO` (lista própria do linter)                                                   | C1                 | F (varredura global)                                                                                |
| `queryKeys.analiseAtivos.sugestoesComparar` / `comparador(…, janela?)`                        | 0                  | C1 / D                                                                                              |

Ordem de transição: B deve emitir `motivosConferencia` **junto** com a retirada de `indice`; C2 e D
leem `l.motivosConferencia ?? l.indice?.motivos` até a F remover o Índice dos tipos.

## Lacunas encontradas na fatia 0 (resolvidas aqui)

- `leitura/ativo/kpisAtivo.ts` lê `linha.indice.motivos` e não estava em nenhuma fatia → **dono C2**
  (passa a ler `motivosConferencia`).
- `leitura/ativo/frescorBlocos.ts` tem a fonte do bloco `indice` e não estava em nenhuma fatia →
  **dono C2** (frescor do bloco `criterios_fundamentos`); a F remove o `indice`.
- Para manter o type-check verde com `indice`/`semaforo`/`i`/`e`/`efeitoIndice`/`destaque` opcionais, a
  fatia 0 pôs só guardas `?.` (sem mudança de tela) em arquivos de B, C1, C2 e D — as donas partem
  desse estado.
- `textosTela.ts` recebeu na 0 só os 2 rótulos exigidos pelo `satisfies Record<BlocoReporte|CampoReporte>`
  (bloco `criterios_fundamentos`, campo `criterioFundamento`).

## Tabela de ownership (gerada de spec-desenho.json + lacunas acima)

| Arquivo                                                                                 | Fatia (tipo)                          |
| --------------------------------------------------------------------------------------- | ------------------------------------- |
| `docs/analise-ativos/fase0/RUNBOOK.md`                                                  | A (alterados)                         |
| `docs/analise-ativos/spec-v2-pedro-out2026/ATIVACAO.md`                                 | F (novos)                             |
| `docs/analise-ativos/spec-v2-pedro-out2026/decisoes.md`                                 | F (novos)                             |
| `infra/modules/lightsail/provision.sh.tftpl`                                            | A (alterados)                         |
| `prisma/__tests__/seedAnaliseAtivos.test.ts`                                            | A (alterados)                         |
| `prisma/migrations/20261015000000_analise_ativos_filtros/migration.sql`                 | 0 (novos)                             |
| `prisma/schema.prisma`                                                                  | 0 (alterados)                         |
| `prisma/seedAnaliseAtivos.ts`                                                           | A (alterados)                         |
| `scripts/analise-ativos/__tests__/apply-migration-filtros.test.ts`                      | 0 (novos)                             |
| `scripts/analise-ativos/apply-migration-filtros.ts`                                     | 0 (novos)                             |
| `scripts/analise-ativos/exportar-fixtures-criterios.ts`                                 | A (novos)                             |
| `scripts/analise-ativos/relatorio-criterios.ts`                                         | A (novos)                             |
| `scripts/analise-ativos/seed-criteria-params.ts`                                        | 0 (novos)                             |
| `src/app/(admin)/(others-pages)/analise-ativos/comparador/page.tsx`                     | D (alterados)                         |
| `src/app/(admin)/(others-pages)/analise-ativos/page.tsx`                                | B (alterados)                         |
| `src/app/api/analise-ativos/__tests__/contratoSemNota.test.ts`                          | F (novos)                             |
| `src/app/api/analise-ativos/ativos/[ticker]/__tests__/route.test.ts`                    | C2 (alterados)                        |
| `src/app/api/analise-ativos/ativos/[ticker]/comparar-sugestoes/__tests__/route.test.ts` | C1 (novos)                            |
| `src/app/api/analise-ativos/ativos/[ticker]/comparar-sugestoes/route.ts`                | C1 (novos)                            |
| `src/app/api/analise-ativos/ativos/[ticker]/route.ts`                                   | C2 (alterados)                        |
| `src/app/api/analise-ativos/busca/__tests__/route.test.ts`                              | B (alterados)                         |
| `src/app/api/analise-ativos/busca/route.ts`                                             | B (alterados)                         |
| `src/app/api/analise-ativos/cenarios/[ticker]/__tests__/route.test.ts`                  | C2 (alterados)                        |
| `src/app/api/analise-ativos/cenarios/[ticker]/route.ts`                                 | C2 (alterados)                        |
| `src/app/api/analise-ativos/comparador/__tests__/route.test.ts`                         | D (alterados)                         |
| `src/app/api/analise-ativos/comparador/route.ts`                                        | D (alterados)                         |
| `src/app/api/analise-ativos/quadro/__tests__/route.test.ts`                             | B (alterados)                         |
| `src/app/api/analise-ativos/quadro/route.ts`                                            | B (alterados)                         |
| `src/app/api/cron/analise-ativos/criterios/__tests__/route.test.ts`                     | A (novos)                             |
| `src/app/api/cron/analise-ativos/criterios/route.ts`                                    | A (novos)                             |
| `src/components/admin/curadoria/marcasCaso.tsx`                                         | F (alterados)                         |
| `src/components/analiseAtivos/ativo/acoes/BarraAcoesAtivo.tsx`                          | C1 (novos)                            |
| `src/components/analiseAtivos/ativo/acoes/ModalAnalise.tsx`                             | C1 (novos)                            |
| `src/components/analiseAtivos/ativo/acoes/ModalComparar.tsx`                            | C1 (novos)                            |
| `src/components/analiseAtivos/ativo/acoes/ModalPlanejar.tsx`                            | C1 (novos)                            |
| `src/components/analiseAtivos/ativo/acoes/ModalRegistrarOperacao.tsx`                   | C1 (novos)                            |
| `src/components/analiseAtivos/ativo/acoes/ModalVerNaCarteira.tsx`                       | C1 (novos)                            |
| `src/components/analiseAtivos/ativo/acoes/__tests__/modais.test.tsx`                    | C1 (novos)                            |
| `src/components/analiseAtivos/ativo/analise/BlocoFundamentosEssencial.tsx`              | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/analise/BlocoPares.tsx`                             | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/analise/BlocoValuationMultiplos.tsx`                | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/analise/TabelaRaioX.tsx`                            | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/analise/__tests__/analise.test.tsx`                 | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/cenarios/BarraSalvamento.tsx`                       | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/cenarios/BlocoMetaRenda.tsx`                        | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/cenarios/FormPremissas.tsx`                         | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/cenarios/MeusCenarios.tsx`                          | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/cenarios/TabelaMetodos.tsx`                         | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/cenarios/__tests__/BlocoValuationCenarios.test.tsx` | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/cenarios/__tests__/useEstadoCenario.test.ts`        | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/cenarios/useEstadoCenario.ts`                       | C2 (alterados)                        |
| `src/components/analiseAtivos/ativo/criterios/CardCriterios.tsx`                        | C2 (novos)                            |
| `src/components/analiseAtivos/ativo/criterios/ItemCriterio.tsx`                         | C2 (novos)                            |
| `src/components/analiseAtivos/ativo/criterios/__tests__/CardCriterios.test.tsx`         | C2 (novos)                            |
| `src/components/analiseAtivos/ativo/topo/BlocoIndiceSemaforo.tsx`                       | F (removidos)                         |
| `src/components/analiseAtivos/ativo/topo/BotaoComparar.tsx`                             | C1 (alterados)                        |
| `src/components/analiseAtivos/ativo/topo/CabecalhoAtivo.tsx`                            | C1 (alterados)                        |
| `src/components/analiseAtivos/ativo/topo/__tests__/topo.test.tsx`                       | C1 (alterados)                        |
| `src/components/analiseAtivos/ativo/usuario/AcoesCarteiraAtivo.tsx`                     | C1 (alterados)                        |
| `src/components/analiseAtivos/ativo/usuario/BarraPesoAlvo.tsx`                          | C1 (alterados)                        |
| `src/components/analiseAtivos/ativo/usuario/BlocoNaCarteira.tsx`                        | C1 (alterados)                        |
| `src/components/analiseAtivos/ativo/usuario/__tests__/usuario.test.tsx`                 | C1 (alterados)                        |
| `src/components/analiseAtivos/ativo/usuario/useNaCarteiraAtivo.ts`                      | C1 (alterados)                        |
| `src/components/analiseAtivos/busca/BuscaAtivos.tsx`                                    | B (alterados)                         |
| `src/components/analiseAtivos/busca/__tests__/BuscaAtivos.test.tsx`                     | B (alterados)                         |
| `src/components/analiseAtivos/comparador/AlertaMisto.tsx`                               | D (alterados)                         |
| `src/components/analiseAtivos/comparador/BlocoCriteriosComparador.tsx`                  | D (novos)                             |
| `src/components/analiseAtivos/comparador/CartoesComparador.tsx`                         | D (alterados)                         |
| `src/components/analiseAtivos/comparador/CelulaComparador.tsx`                          | D (alterados)                         |
| `src/components/analiseAtivos/comparador/Comparador.tsx`                                | D (alterados)                         |
| `src/components/analiseAtivos/comparador/LeituraDosDados.tsx`                           | D (novos)                             |
| `src/components/analiseAtivos/comparador/MiniGraficosComparador.tsx`                    | D (alterados)                         |
| `src/components/analiseAtivos/comparador/ResumoNumerico.tsx`                            | F (removidos)                         |
| `src/components/analiseAtivos/comparador/SeletorTipoFii.tsx`                            | D (novos)                             |
| `src/components/analiseAtivos/comparador/SlotAdicionar.tsx`                             | D (alterados)                         |
| `src/components/analiseAtivos/comparador/SlotsComparador.tsx`                           | D (alterados)                         |
| `src/components/analiseAtivos/comparador/TabelaComparador.tsx`                          | D (alterados)                         |
| `src/components/analiseAtivos/comparador/__tests__/comparadorIsonomico.test.tsx`        | D (novos)                             |
| `src/components/analiseAtivos/comparador/useEstadoComparadorUrl.ts`                     | D (alterados)                         |
| `src/components/analiseAtivos/comum/AnelIndice.tsx`                                     | F (removidos)                         |
| `src/components/analiseAtivos/comum/BadgeCriterio.tsx`                                  | F (removidos)                         |
| `src/components/analiseAtivos/comum/CelulaCriterios.tsx`                                | 0 (novos)                             |
| `src/components/analiseAtivos/comum/MarcaCriterio.tsx`                                  | 0 (novos)                             |
| `src/components/analiseAtivos/comum/MiniBarrasAnuais.tsx`                               | 0 (novos)                             |
| `src/components/analiseAtivos/comum/PilulasJanela.tsx`                                  | 0 (novos)                             |
| `src/components/analiseAtivos/comum/PorQueConferencia.tsx`                              | C2 (alterados)                        |
| `src/components/analiseAtivos/comum/__tests__/ChipConferencia.test.tsx`                 | C2 (alterados)                        |
| `src/components/analiseAtivos/comum/__tests__/criteriosComum.test.tsx`                  | 0 (novos)                             |
| `src/components/analiseAtivos/pagina/PaginaAtivo.tsx`                                   | C2 (alterados)                        |
| `src/components/analiseAtivos/pagina/__tests__/varreduraPagina.test.tsx`                | C2 (novos)                            |
| `src/components/analiseAtivos/quadro/BandejaComparar.tsx`                               | B (alterados)                         |
| `src/components/analiseAtivos/quadro/BarraFiltrosCriterios.tsx`                         | B (novos)                             |
| `src/components/analiseAtivos/quadro/CabecalhoOrdenavel.tsx`                            | B (alterados)                         |
| `src/components/analiseAtivos/quadro/CartoesQuadro.tsx`                                 | B (alterados)                         |
| `src/components/analiseAtivos/quadro/FiltrosQuadro.tsx`                                 | B (alterados)                         |
| `src/components/analiseAtivos/quadro/QuadroAnalise.tsx`                                 | B (alterados)                         |
| `src/components/analiseAtivos/quadro/RodapeCriterios.tsx`                               | B (novos)                             |
| `src/components/analiseAtivos/quadro/RodapeFormula.tsx`                                 | F (removidos)                         |
| `src/components/analiseAtivos/quadro/SheetOrdem.tsx`                                    | B (alterados)                         |
| `src/components/analiseAtivos/quadro/TabelaQuadro.tsx`                                  | B (alterados)                         |
| `src/components/analiseAtivos/quadro/__tests__/QuadroAnalise.test.tsx`                  | B (alterados)                         |
| `src/components/analiseAtivos/quadro/__tests__/filtrosCriterios.test.tsx`               | B (novos)                             |
| `src/components/analiseAtivos/quadro/__tests__/useSelecaoComparar.test.ts`              | B (alterados)                         |
| `src/components/analiseAtivos/quadro/useEstadoQuadroUrl.ts`                             | B (alterados)                         |
| `src/components/analiseAtivos/quadro/useSelecaoComparar.ts`                             | B (alterados)                         |
| `src/components/analiseAtivos/reporte/MenuBlocoAtivo.tsx`                               | F (alterados)                         |
| `src/components/analiseAtivos/shell/AnaliseAtivosShell.tsx`                             | B (alterados)                         |
| `src/components/analiseAtivos/shell/BannerNovidade.tsx`                                 | B (alterados)                         |
| `src/components/analiseAtivos/shell/RodapeLegal.tsx`                                    | B (alterados)                         |
| `src/components/analiseAtivos/shell/__tests__/shell.test.tsx`                           | B (alterados)                         |
| `src/constants/analiseAtivosVisual.ts`                                                  | B (alterados) · F (alterados)         |
| `src/hooks/__tests__/useAcoesCarteiraAnalise.test.ts`                                   | C1 (novos)                            |
| `src/hooks/__tests__/useAnaliseAtivosBlocoD.test.ts`                                    | D (alterados)                         |
| `src/hooks/useAcoesCarteiraAnalise.ts`                                                  | C1 (novos)                            |
| `src/hooks/useAnaliseAtivos.ts`                                                         | B (alterados)                         |
| `src/hooks/useAnaliseAtivosBlocoD.ts`                                                   | D (alterados)                         |
| `src/lib/queryKeys.ts`                                                                  | 0 (alterados)                         |
| `src/services/analiseAtivos/__tests__/linguagemV2Global.test.ts`                        | F (novos)                             |
| `src/services/analiseAtivos/__tests__/textos.test.ts`                                   | F (alterados)                         |
| `src/services/analiseAtivos/__tests__/textosAcoesCarteira.test.ts`                      | C1 (novos)                            |
| `src/services/analiseAtivos/__tests__/textosAtivo.test.ts`                              | C2 (novos)                            |
| `src/services/analiseAtivos/__tests__/textosBlocoD.test.ts`                             | 0 (removidos)                         |
| `src/services/analiseAtivos/__tests__/textosCenarios.test.ts`                           | 0 (novos) · C2 (alterados)            |
| `src/services/analiseAtivos/__tests__/textosComparador.test.ts`                         | 0 (novos) · D (alterados)             |
| `src/services/analiseAtivos/__tests__/textosCriterios.test.ts`                          | 0 (novos)                             |
| `src/services/analiseAtivos/__tests__/textosLiterais.test.ts`                           | 0 (novos)                             |
| `src/services/analiseAtivos/__tests__/textosQuadro.test.ts`                             | B (novos)                             |
| `src/services/analiseAtivos/__tests__/textosRaioX.test.ts`                              | 0 (novos)                             |
| `src/services/analiseAtivos/__tests__/textosTela.test.ts`                               | F (alterados)                         |
| `src/services/analiseAtivos/calculo/__tests__/executarCriterios.test.ts`                | A (novos)                             |
| `src/services/analiseAtivos/calculo/executarCriterios.ts`                               | A (novos)                             |
| `src/services/analiseAtivos/cenarios/cenarioService.ts`                                 | C2 (alterados)                        |
| `src/services/analiseAtivos/cenarios/contrato.ts`                                       | C2 (alterados)                        |
| `src/services/analiseAtivos/curadoria/contrato.ts`                                      | 0 (alterados)                         |
| `src/services/analiseAtivos/curadoria/filaCuradoria.ts`                                 | F (alterados)                         |
| `src/services/analiseAtivos/curadoria/registrarReporte.ts`                              | F (alterados)                         |
| `src/services/analiseAtivos/jobs/catalogoJobs.ts`                                       | A (alterados)                         |
| `src/services/analiseAtivos/jobs/nomesJobs.ts`                                          | A (alterados)                         |
| `src/services/analiseAtivos/leitura/__tests__/linhasQuadro.test.ts`                     | B (alterados)                         |
| `src/services/analiseAtivos/leitura/__tests__/matrizConsistencia.test.ts`               | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/__tests__/montarComparador.test.ts`                 | D (alterados)                         |
| `src/services/analiseAtivos/leitura/__tests__/overlayCarteira.test.ts`                  | C1 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/__tests__/fundamentosEssencial.test.ts`       | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/__tests__/montarTopoAtivo.test.ts`            | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/__tests__/semaforoTela.test.ts`               | F (removidos)                         |
| `src/services/analiseAtivos/leitura/ativo/__tests__/sugestoesComparar.test.ts`          | C1 (novos)                            |
| `src/services/analiseAtivos/leitura/ativo/__tests__/valuationMultiplos.test.ts`         | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/baseCenarios.ts`                              | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/conferenciasAtivo.ts`                         | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/frescorBlocos.ts`                             | C2 (alterados (atribuído na fatia 0)) |
| `src/services/analiseAtivos/leitura/ativo/fundamentosEssencial.ts`                      | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/kpisAtivo.ts`                                 | C2 (alterados (atribuído na fatia 0)) |
| `src/services/analiseAtivos/leitura/ativo/montarTopoAtivo.ts`                           | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/paresAtivo.ts`                                | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/ativo/semaforoTela.ts`                              | F (removidos)                         |
| `src/services/analiseAtivos/leitura/ativo/sugestoesComparar.ts`                         | C1 (novos)                            |
| `src/services/analiseAtivos/leitura/ativo/valuationMultiplos.ts`                        | C2 (alterados)                        |
| `src/services/analiseAtivos/leitura/comparador/montarComparador.ts`                     | D (alterados)                         |
| `src/services/analiseAtivos/leitura/criterios/lerCriterios.ts`                          | 0 (novos) · A (alterados)             |
| `src/services/analiseAtivos/leitura/linhasQuadro.ts`                                    | B (alterados)                         |
| `src/services/analiseAtivos/leitura/overlayCarteira.ts`                                 | C1 (alterados)                        |
| `src/services/analiseAtivos/params/__tests__/criteriaParams.test.ts`                    | 0 (novos)                             |
| `src/services/analiseAtivos/params/criteriaParamsSchema.ts`                             | 0 (novos)                             |
| `src/services/analiseAtivos/params/criteriaParamsV1.ts`                                 | 0 (novos)                             |
| `src/services/analiseAtivos/params/obterCriteriaParams.ts`                              | 0 (novos)                             |
| `src/services/analiseAtivos/quadro/__tests__/caso30.test.ts`                            | B (novos)                             |
| `src/services/analiseAtivos/quadro/__tests__/consultaQuadro.test.ts`                    | B (alterados)                         |
| `src/services/analiseAtivos/quadro/__tests__/gerarQuadro.test.ts`                       | A (alterados)                         |
| `src/services/analiseAtivos/quadro/__tests__/indiceBusca.test.ts`                       | B (alterados)                         |
| `src/services/analiseAtivos/quadro/__tests__/montarLinhasQuadro.test.ts`                | A (alterados)                         |
| `src/services/analiseAtivos/quadro/consultaQuadro.ts`                                   | B (alterados)                         |
| `src/services/analiseAtivos/quadro/gerarQuadro.ts`                                      | A (alterados)                         |
| `src/services/analiseAtivos/quadro/indiceBusca.ts`                                      | B (alterados)                         |
| `src/services/analiseAtivos/quadro/montarLinhasQuadro.ts`                               | A (alterados)                         |
| `src/services/analiseAtivos/regras/carteira/__tests__/caso33.test.ts`                   | C1 (novos)                            |
| `src/services/analiseAtivos/regras/carteira/__tests__/secaoOperacao.test.ts`            | C1 (novos)                            |
| `src/services/analiseAtivos/regras/carteira/desvioAlvo.ts`                              | C1 (novos)                            |
| `src/services/analiseAtivos/regras/carteira/registroOperacao.ts`                        | C1 (novos)                            |
| `src/services/analiseAtivos/regras/carteira/secaoOperacao.ts`                           | C1 (novos)                            |
| `src/services/analiseAtivos/regras/comparador/__tests__/destaque.test.ts`               | F (removidos)                         |
| `src/services/analiseAtivos/regras/comparador/__tests__/indicadores.test.ts`            | D (alterados)                         |
| `src/services/analiseAtivos/regras/comparador/__tests__/resumo.test.ts`                 | D (alterados)                         |
| `src/services/analiseAtivos/regras/comparador/destaque.ts`                              | F (removidos)                         |
| `src/services/analiseAtivos/regras/comparador/indicadores.ts`                           | D (alterados)                         |
| `src/services/analiseAtivos/regras/comparador/resumo.ts`                                | D (alterados)                         |
| `src/services/analiseAtivos/regras/comum/__tests__/linguagemV2.test.ts`                 | 0 (novos)                             |
| `src/services/analiseAtivos/regras/comum/conferencia.ts`                                | 0 (alterados)                         |
| `src/services/analiseAtivos/regras/comum/linguagemV2.ts`                                | 0 (novos)                             |
| `src/services/analiseAtivos/regras/conferencia/conferenciaAnual.ts`                     | C2 (alterados)                        |
| `src/services/analiseAtivos/regras/criterios/__tests__/avaliarCriterio.test.ts`         | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/__tests__/casos45.test.ts`                 | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/__tests__/fixtures/dev-2026-10-13.json`    | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/__tests__/mesesJanela.test.ts`             | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/__tests__/perfilCriterios.test.ts`         | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/__tests__/series.test.ts`                  | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/ancoraJanela.ts`                           | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/avaliarAtivo.ts`                           | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/avaliarCriterio.ts`                        | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/mesesJanela.ts`                            | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/perfilCriterios.ts`                        | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/seriesAcao.ts`                             | A (novos)                             |
| `src/services/analiseAtivos/regras/criterios/seriesFii.ts`                              | A (novos)                             |
| `src/services/analiseAtivos/regras/valuation/__tests__/casos46.test.ts`                 | C2 (alterados)                        |
| `src/services/analiseAtivos/regras/valuation/__tests__/limites.test.ts`                 | C2 (alterados)                        |
| `src/services/analiseAtivos/regras/valuation/__tests__/montarCenarios.test.ts`          | C2 (alterados)                        |
| `src/services/analiseAtivos/regras/valuation/cenario.ts`                                | C2 (alterados)                        |
| `src/services/analiseAtivos/regras/valuation/metaRenda.ts`                              | C2 (alterados)                        |
| `src/services/analiseAtivos/regras/valuation/montarCenarios.ts`                         | C2 (alterados)                        |
| `src/services/analiseAtivos/repositorio/criterios.ts`                                   | A (novos)                             |
| `src/services/analiseAtivos/textos.ts`                                                  | F (alterados)                         |
| `src/services/analiseAtivos/textosAcoesCarteira.ts`                                     | C1 (novos)                            |
| `src/services/analiseAtivos/textosAtivo.ts`                                             | C2 (novos)                            |
| `src/services/analiseAtivos/textosCenarios.ts`                                          | C2 (alterados)                        |
| `src/services/analiseAtivos/textosComparador.ts`                                        | D (alterados)                         |
| `src/services/analiseAtivos/textosCriterios.ts`                                         | 0 (novos)                             |
| `src/services/analiseAtivos/textosEntradasComparador.ts`                                | D (alterados)                         |
| `src/services/analiseAtivos/textosLiterais.ts`                                          | 0 (novos)                             |
| `src/services/analiseAtivos/textosQuadro.ts`                                            | B (novos)                             |
| `src/services/analiseAtivos/textosTela.ts`                                              | F (alterados)                         |
| `src/services/analiseAtivos/tipos.ts`                                                   | 0 (alterados)                         |
| `src/test/fixtures/analiseAtivos/criterios.ts`                                          | 0 (novos)                             |
| `src/test/fixtures/analiseAtivos/linhasDb.ts`                                           | 0 (alterados)                         |
| `src/test/fixtures/analiseAtivos/respostas.ts`                                          | F (alterados)                         |
| `src/test/utils/varrerDom.ts`                                                           | 0 (novos)                             |
| `src/types/analiseAtivosApi.ts`                                                         | 0 (alterados) · F (alterados)         |
| `src/types/analiseAtivosBlocoD.ts`                                                      | 0 (alterados) · F (alterados)         |
| `src/types/analiseAtivosCriterios.ts`                                                   | 0 (novos)                             |
| `src/types/analiseAtivosCuradoria.ts`                                                   | F (alterados)                         |
