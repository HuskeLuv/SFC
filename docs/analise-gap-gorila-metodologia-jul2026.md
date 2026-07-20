# Análise profunda — Por que nossa TWR não bate com a Gorila (jul/2026)

> Sessão de 20/07/2026. Análise 100% read-only (nenhuma alteração em prod).
> Continuação do diagnóstico de 18/07 (relatório do tester v3, backtest Gorila VIEW).

## TL;DR

O gap de −18,7pp (hoje −17,9pp: nossa série +15,7% vs Gorila +33,5% na janela
16/06/2021→15/07/2026) tem **três causas independentes**, todas identificadas e
quantificadas por simulação com dados reais de preço/provento:

| #   | Causa                                                                                                                                                                                                                                                                                                              | Contribuição             | Correção                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1   | **Metodologia TWR: provento vira "caixa morto" na base** — a série soma proventos acumulados ao patrimônio para sempre; cada retorno diário é diluído pelo fator V/(V+C). Em 2026, C≈R$30k vs V≈R$120k na carteira do backtest. Gorila (e Kinvo) tratam provento como renda do período (equivalente a reinvestir). | **~12-13pp** (dominante) | Mudar o encadeamento TWR do builder: provento entra no numerador do dia (renda) e sai da base — não acumula |
| 2   | **Fundo CVM sem histórico de cota antes de fev/2025** — compra de 15k cotas @ 1,00 em jul/2023; primeiro preço no banco é 1,3648 (03/02/2025). O motor avalia flat e perde +36% de crescimento (2023→2025); no total 1,00→1,61 até 2026. A Gorila capturou.                                                        | **~2-3pp**               | Backfill dos informes diários CVM do fundo 37.649.652/0001-61 desde jul/2023                                |
| 3   | **Ruído metodológico residual** (timing ex-date vs pagamento, reinvestimento vs renda, arredondamentos, extração por pixel)                                                                                                                                                                                        | ±1-2pp                   | — (aceitável)                                                                                               |

Com as correções 1+2, nossa série na janela do backtest deve sair de ~+15,7%
para **~+30-33%**, dentro de ±2pp da Gorila (+33,53%).

## Descoberta crítica: qual carteira o tester comparou

**As capturas do MyFinance no relatório são do usuário `testejunho@hotmai.com`
(b98a31b3), NÃO do `pedrotestejunho@hotmail.com` (990c34a9).** Evidência: o gráfico
da fig. 11 começa em 16/06/2021 — a série do testejunho começa em 16/06/2021
(1ª compra), enquanto a do Pedro começa em 02/05/2018 (compra do HFOF11 em 2018).

Composição da carteira do backtest (testejunho, confirmada em prod):

| Ativo                                       | Compra                         | Qtd                                     | Preço          |
| ------------------------------------------- | ------------------------------ | --------------------------------------- | -------------- |
| KFOF11                                      | 16/06/2021                     | 500                                     | 91,10          |
| HFOF11                                      | 02/05/2022                     | 300 (→3000 no split 10:1 de 12/05/2025) | 99,45          |
| XPML11                                      | 08/06/2022 (+21 em 12/01/2026) | 500→521                                 | 99,00 / 109,75 |
| Fundo CVM 37.649.652/0001-61 (multimercado) | 11/07/2023                     | 15.000                                  | 1,00           |
| Reserva emergência                          | 05/01/2026                     | —                                       | 3.227,70       |
| BBAS3                                       | 10/06/2026                     | 300                                     | 19,00          |

Nota: o notes da tx HFOF11 guarda `"date":"2018-05-02"` no payload do wizard,
mas a transação foi salva com data 02/05/2022 — a carteira do Pedro é a variante
com a compra em 2018. A Gorila espelha o **testejunho** (compra em mai/2022).
O fix de 18/07 (txs fantasma do Pedro) era válido, mas para a carteira errada
do ponto de vista do backtest — por isso os cortes "rebasados" do Pedro ficaram
acima da Gorila em 2022-23 (sem o cliff de mai/2022, ver abaixo).

## Cadeia de evidências

1. **Preços ✓** — nossos fechamentos (B3_COTAHIST) idênticos ao Yahoo/B3 em todos
   os meses amostrados 2021-2026 (HFOF11, KFOF11). Snapshot dez/24 = 300×57,79 +
   500×70,96 = 52.817, exato.
2. **Proventos ✓** — crédito contínuo ~R$540-590/mês sem buracos (deltas de
   `totalEarnings` dos snapshots). Fontes por era: manual (ago/21→mar/22, HFOF11),
   YAHOO (abr/22→mai/25), BRAPI (jun/25+, pós-split 0,056). BRAPI só tem HFOF11
   pós-split (14 pagamentos); KFOF11 completo (94 desde 2018).
3. **Diluição confirmada numericamente** — nosso retorno mensal real = retorno
   total dos ativos × V/(V+C), verificado mês a mês (ex.: jan/24: ativos +2,70% ×
   72.935/88.788 = +2,22% = série real +2,21%).
4. **Curva da Gorila extraída por pixel** das capturas do Anexo A (calibração
   validada nos tooltips: −20,81 extraído vs −20,82 real em 10/07/22).
5. **Cliff de mai/2022 na Gorila (−11,3% no mês)** = entrada do HFOF11 a custo
   (99,45) com mercado a ~75,9 → perda instantânea de −23,7% na posição ≈ −10%
   na carteira. Nossa série tem o mesmo cliff (mês −17,13%, com XPML tambem
   entrando em jun/22) — as duas plataformas contabilizam o day-1 a custo. ✓
6. **Simulação da carteira testejunho estilo-Gorila** (KFOF+HFOF@custo+XPML@custo,
   TR com reinvestimento, preços Yahoo=B3, proventos completos):

| Corte                   | Gorila | Simulação | Δ   |
| ----------------------- | ------ | --------- | --- |
| 10/07/2022              | −20,82 | −19,85    | 1,0 |
| 16/07/2022              | −20,90 | −19,98    | 0,9 |
| 02/05/2023              | −7,27  | −6,12     | 1,1 |
| 20/12/2023              | +13,85 | +14,06    | 0,2 |
| 12m (31/07/25→15/07/26) | +14,76 | +14,27    | 0,5 |
| 16/07/2026              | +33,53 | +30,83    | 2,7 |

O resíduo de +2-3pp concentra-se em out/24→mar/25 (fundo do IFIX) e tem o
formato exato de um ativo estável de ~12% ausente da simulação = o fundo CVM
(que a Gorila valoriza crescendo e nós, flat).

7. **Por que "o gap cessa em ago/2025"** (observação do tester): a janela de 12m
   rebasa a série — o efeito acumulado da diluição fica no nível, não na janela
   curta; e no curto prazo fundo CVM + reserva compensam a diluição residual.
   A hipótese do tester ("proventos não incorporados no histórico antigo") estava
   certa na direção (é sobre proventos) mas a mecânica real é diluição por
   caixa-morto — os proventos ESTÃO na série, mas param de render para sempre.

## Correções propostas (ordem recomendada)

1. **[P0 — estrutural] Provento como renda do período no TWR.**
   `patrimonioHistoricoBuilder`: hoje o TWR consome a série-sombra
   (patrimônio + proventosAcumulados) e o caixa nunca sai da base. Mudar para:
   provento do dia entra no numerador do retorno do dia (renda) e NÃO acumula na
   base dos dias seguintes — padrão Gorila/Kinvo/indústria (GIPS: income return).
   Efeitos: TWR do card/gráfico/janelas sobe para carteiras pagadoras de
   dividendos; exige rebuild de snapshots (persistFullHistoryForUser) para todos;
   revalidar paridade Kinvo (deve melhorar — a validação anterior foi em janela
   curta onde C era pequeno). MWR não muda (fluxos externos apenas).
2. **[P1] Backfill de cotas CVM do fundo 37.649.652/0001-61** (e auditar cobertura
   de outros fundos CVM em carteiras): informes diários CVM desde jul/2023.
   Hoje: primeira cota no banco 03/02/2025.
3. **[P2 — higiene] Tx de auditoria duplicada** no HFOF11 do testejunho: duas
   linhas `ajuste-corporativo` (12/05/2025) apontando para corporateActionIds
   distintos (87a555e7 e d1bf6607 — um CA foi deletado/recriado em 11/06/2026 e a
   auditoria órfã ficou). Não afeta posição (replay filtra por notes), mas
   confunde histórico/UI. Dedupe + garantir que recriação de CA remova auditorias
   órfãs.
4. **[P2] Reexecutar o backtest com o tester** após 1+2, nos mesmos cortes, na
   carteira testejunho (não Pedro). Avisar que os valores do app vão mudar para
   todos os usuários (metodologia).

## Reproduzir

- Scripts SSM read-only e simulações desta sessão: scratchpad
  `gorila-analise/` (diag-gorila-gap.ts, diag-pedro.ts, diag-testejunho.ts,
  yahoo-\*.json, gorila-curve.json com a curva mensal extraída por pixel).
- Curva Gorila mensal extraída: `gorila-curve.json` (validada nos 4 tooltips).
