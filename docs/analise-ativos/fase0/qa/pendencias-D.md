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
