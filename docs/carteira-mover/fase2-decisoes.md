# Mover investimentos — FASE 2 (Reservas + Renda Fixa) — desenho (02/10/2026)

Workflow de desenho wf_07ba9cd3-aa9 (arquiteto, designer, revisor com 13 críticas, revisão final; ~22 min, ~806k tokens).
Spec completa: `fase2-spec-desenho.json`. Protótipo: `fase2-prototipo.html` (artifact https://claude.ai/artifact/BytpPSBy9pwwK5oYAsEKsU). Script: `fase2-workflow-desenho.js`.

## Modelo

Mesmo `Portfolio.categoriaOverride` da fase 1, com 3 valores novos e sem migration. Não mexe em tesouroDestino, Asset.type nem símbolo.
"Onde aparece" segue o override. "Como vale" continua pelo Asset, pelo FI e pelas notes.
Fica atrás de MOVER_CAIXA_RF_HABILITADO (env lida em runtime), com fatia 0 + A-E.

## Recomendações levadas ao Wellington — ✅ APROVADAS 02/10 ("Pode seguir"; IPCA+ mantém o comportamento atual da main)

1. As 3 abas trocam entre si. Saldo sem título (RESERVA-\*, conta corrente, poupança) troca só entre as 2 Reservas.
2. Renda variável/fundos ↔ RF/Reservas ficam BLOQUEADOS nos dois sentidos. Fundo DI → Reserva de Oportunidade pode virar uma fase 3.
3. Saúde Financeira respeita a escolha: o título movido para a Reserva de Emergência conta na cobertura. Aparece o aviso de liquidez (≠ DAILY e vencimento > 360d) e a prévia numérica antes → depois na confirmação.
4. Bandeja: só as outras abas do trio, sem chip travado. FII/Ações ficam idênticos à fase 1.
5. Seções: Reservas sem seção. RF com Pós/Pré/Híbrida derivadas, não editáveis. No Tesouro a seção vem do tipo do título. DIVERGÊNCIA: o arquiteto põe IPCA+ em Pós ("como hoje") e o protótipo em Híbrida → seguir o comportamento atual da main.
6. 'cash' deixa de aparecer em dobro e fica só na Reserva de Oportunidade, ligado à chave. Antes, rodar um SELECT de contagem em prod.
7. Abas de Reserva passam a usar a mesma valoração da pizza/RF e os metadados reais do FI, sem os falsos D+0/Imediata/CDI. Tesouros já na reserva podem variar alguns centavos.
8. Planejamento segue o mover, e os itens movidos são avaliados como na Saúde. A correção geral do Planejamento vai num PR à parte.
9. Resgate continua agrupado pelo tipo do título.
10. Caixa para Investir: o saldo já separado não migra. Só os aportes futuros seguem a aba nova.
11. Alvos ≥44px e contraste AA (protótipo ajustado).
12. Rentabilidade/TWR não mudam. Removido o efeito "análises" da confirmação.
13. Sobe com a chave DESLIGADA e liga após o QA. Desligar = env + restart.

## Antes de codar

SELECTs read-only em prod (Wellington roda via `!`): posições 'cash'; Tesouro de catálogo com tesouroDestino de reserva e destinos mistos; reservas com/sem FI; RF legacy; overrides da fase 1; paridade de secaoRendaFixa.
