# Pendências da fatia E (eventos IPE, agenda, observabilidade, cron, RUNBOOK)

Coisas que a fatia E não pôde resolver sem mexer em arquivo de outra fatia (regra de disjunção) ou
que dependem de outra fatia rodar antes.

1. **Limiares fora do ScoringParams** (arquivo da fatia 0): `TOLERANCIA_ESTIMATIVA_VENCIDA_DIAS = 45`
   (regras/eventos/estimativaResultado.ts), `REPETICAO_ALERTA_MS = 24 h`, `FALHAS_SEGUIDAS_PARA_ALERTAR = 2`
   e `LIMITES_FRESCOR_PADRAO` (regras/eventos/alertasFrescor.ts) estão no código. Proposta para a v2
   dos params: seção `observabilidade { falhasSeguidas, repeticaoHoras, frescor{camada:{maxHorasJob,
maxDiasDado, emPregoes}} }` e `eventos.toleranciaEstimativaVencidaDias`.
2. **Aceite no banco dev depende da fatia A**: `cvm_company_tickers` e `asset_fundamentals_period`
   estão vazios no dev, então o job grava 0 eventos (alerta `universo_vazio`, arquivo não marcado
   processado). Validado offline com o universo do FCA 2026 + índices ITR/DFP 2024–2026 e gravação
   real em asset_eventos (depois apagada): 340 emissores, **338 com assembleia em 2026 (≥ 250)**,
   **338 com estimativa (≥ 280)**. Depois do backfill da A: `backfill-ipe.ts --anos=2024-2026 --apply`.
3. **AGESP/AGDEB fora**: assembleia especial de preferencialistas e de debenturistas não viram evento.
4. **Mesma data, subtipos em arquivos de anos diferentes** (Edital 'AGO' no IPE de 2025 e Ata 'AGE' no
   de 2026) não se fundem em 'AGO/AGE' (a fusão é por arquivo). Raro; resolve-se na Fase 1 se aparecer.
5. **Pauta da assembleia (IPE Assunto)** fica só no banco: é texto livre da companhia e pode conter
   termos da lista proibida ("venda de ações em tesouraria"). A Agenda não mostra; Fase 1 decide.
6. **Frescor da camada 'eventos'** usa `max(data)` das assembleias (repositorio.jobs, fatia 0), que é
   sazonal (pico em abril). Limite de 120 dias ajustável quando os limites forem para os params.
7. **mercado.test.ts** não ganhou caso com a flag ligada (arquivo consumidor fora da lista da fatia);
   o caminho ligado está coberto em `resultadosAnaliseAtivos.test.ts`, e os testes do agregador
   (`mercado.test.ts`, `api/calendar/route.test.ts`) seguem verdes.
8. **RUNBOOK** usa os nomes/opções de scripts das fatias A–D como estão na spec (backfill.ordem);
   conferir após o merge das outras fatias.
