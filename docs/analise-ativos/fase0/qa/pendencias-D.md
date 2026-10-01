# Pendências da fatia D (cálculo) — 30/09/2026

Itens que a fatia D não podia resolver sem mexer em arquivos de outra fatia (ou que dependem de decisão).

1. **tipos.ts (fatia 0):** `EstadoComponente` com `zero_regra` só aceita `'prejuizo' | 'pl_nao_positivo'`; a regra da
   revisão (EBITDA ≤ 0 com dívida líquida > 0 ⇒ C_dívida 0) precisa de `'ebitda_nao_positivo'`. A D usa o tipo local
   `EstadoComponenteCalc` (regras/calculo/indiceMf.ts). Sugestão: acrescentar o motivo em tipos.ts.
2. **Eventos `emissao_recompra` ajustam série.** A spec da D diz "só confirmado", mas a Fase A manteve esses eventos
   (acoes-cvm.md §2: "não batem e houve emissão/recompra — mantidos") e sem isso o LPA histórico da MGLU3 sai 10×
   errado (grupamento 10:1 de 2024 + follow-on no mesmo ano). Implementado como na Fase A; confirmar.
3. **Fatia A — DMPL zerada no escopo individual de banco:** BBAS3 2024/2025 com `dmplDeclarado = 0` e proventos
   declarados. A D marca `dmpl_zero_com_proventos` e deixa o payout DMPL ausente (436 anos no dev).
4. **Fatia B — desdobramentos descartados pela razão de cotas:** ALZR11 2025-05 ×10 e VINO11 2024-01 ×10 ficaram
   `descartado` (cotas do informe não mudaram entre o mês anterior e o do evento). Conferir se o informe já veio na
   base nova (HGLG11 e HFOF11 confirmam normalmente).
5. **Base de proventos do dev parada em jun/2026:** com dataRef 29/09/2026, "meses com rendimento" = 0 em todos os
   FIIs (regra de calendário) e o C_lucro de FII sai 0 no dev. Em prod a base é diária.
6. **Anos com buraco na base de proventos:** só o 1º ano parcial de FII vira ausente (HGLG11 2017); anos do meio com
   meses faltando (HGLG11 jan–abr/2018) somam parcial. 822 anos de ações com `auditoria_proventos` no dev pedem
   triagem (lacunas da base no dev; prod não medido).
7. **ROIC** usa alíquota fixa de 34% (constante documentada em regras/calculo/multiplos.ts); levar para o
   ScoringParams numa v2 se o Pedro quiser.
8. **Arquivo fora da lista `cria`:** `src/services/analiseAtivos/calculo/universo.ts` (carga do universo e dos dados
   compartilhados pelas etapas, para evitar import circular entre os recalcular\*).
9. **Caso 22 (salvar cenário):** só a parte pura; persistência em user_scenarios é da Fase 2.
10. **Linha de cron `10 10 * * * .../analise-ativos/scores`:** entra no template pela fatia E.

## Correção pós-QA (30/09/2026)

11. **Decisão 2 (item 2 acima) ganhou guarda:** `emissao_recompra` só com UM evento pendente no ano, do mesmo lado de
    1 que a razão de ações da CVM e razão ÷ fator em `sanidade.eventos.emissaoRecompraRazaoFator` [0,5; 2]; senão
    `nao_validavel` (não ajusta). Sem a guarda, LIGT3 2021 (×10/×0,01 no mesmo dia), CALI3 2022 (×400), IFCM3 2025
    (2× ×0,05 com ações ×3,5) e AZUL3 2026 distorciam LPA/VPA/DPA na base de hoje. MGLU3 2024 segue mantido.
12. **Parâmetros novos no ScoringParams, com default = valor da v1 no schema:** `sanidade.eventos`
    (`emissaoRecompraRazaoFator`, `convencaoData` {BRAPI: com, YAHOO: ex}, `fontePreferidaData`,
    `confirmacaoEstritaTolPct`) e `sanidade.proventos.frescor`. A linha v1 já gravada no `scoring_params` do dev não
    tem essas chaves: o zod completa com os mesmos valores (comportamento idêntico), mas o
    `seed-scoring-params.ts` passa a dizer "DIVERGE". Decidir: regravar a v1 do dev (ainda não existe em prod) ou
    publicar como v2.
13. **Contagens de ações do ITR já gravadas no dev NÃO foram reprocessadas.** A regra nova (escala conferida contra
    o DFP) só roda para documento pendente, e o documento é "gravado" pelo fundamento. No dev há 185 contagens de
    ITR com salto fora de [0,4; 2,5] contra o último DFP e 54 com `lpa_escala_corrigida` (PSSA3, BEES3, RAPT4…);
    os fundamentos desses documentos também guardam o LPA "corrigido". Os múltiplos do dia já não usam essas
    contagens (regra 13 ⇒ sem nº de ações + `acoes:salto_sem_evento`). Para regravar: apagar as linhas
    FY/YTD/3M de `asset_fundamentals_period` (docTipo ITR) dos emissores afetados e rodar
    `backfill-cvm-cias.ts --docs=itr --anos=2024-2026 --perfil=dev --cache-dir=… --reprocessar --apply`, depois
    `recalcular-analise.ts --tudo --apply`. O apagamento em massa ficou para o Wellington autorizar.
14. **`fii_monthly.fatorDesdobramento` já gravado** continua com os fatores antigos (IRIM11 18,35 etc.). A guarda nova
    em `verificarFii` (PL positivo e estável, sem ida e volta) já impede que virem evento (119 → 46 eventos
    `cvm_cotas`, 3 não inteiros: MOFF11, REME11, SPG211). O flag só é regravado reprocessando o fii-mensal.
15. **Frescor dos proventos:** com a base do dev parada, o scores marca 245 FIIs (`cobertura_antiga`) e 115 ações
    (`pagador_recorrente_parado`) com DY/rendimento 12m e meses ausentes (`fonte_defasada`, Índice incompleto) e
    grava o alerta `proventos_defasados`. "Anos de dividendos" não existe como métrica nesta fase.
16. **RSS do scores:** fundamentos agora por lote de 50 emissores (etapa scores via tsx: +99 → +28 MB sobre a etapa
    anterior); `rss_acima_limite` virou nível erro. A etapa `derivados` continua sendo o maior degrau (~+100 MB):
    se o next-server seguir acima de +300 MB, tirar o scores do processo do app (script com
    `--max-old-space-size=384` chamado pelo cron).
