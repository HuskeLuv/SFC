# Mover investimentos na Carteira — decisões do desenho (01/10/2026)

Workflow de desenho wf_7bf87420-f09 (arquiteto, designer, revisor, revisão final). Spec completa: `spec-desenho.json`. Protótipo: `prototipo.html` (artifact https://claude.ai/artifact/VeaQyGUPEQBV3kokiPQmVh).

## Recomendações levadas ao Wellington

1. Arrastar para outra aba usando a **bandeja "Outra aba"** no rodapé durante o arrasto, como no protótipo. A barra de abas fica de fora porque rola e corta abas. Isso diverge da spec final do arquiteto, que descreve o popover na barra de abas: a construção segue o protótipo.
2. Na troca de **aba**, o objetivo (%) volta a 0% nas posições, com aviso antes de confirmar e restaurado pelo Desfazer. Nos planejados, o objetivo é mantido. Na troca só de seção, o objetivo é mantido.
3. O **IR não muda**: segue o tipo do ativo (Asset.type). O diálogo avisa.
4. O histórico por classe (evolução e rentabilidade por classe) segue a aba nova também para trás no tempo, porque a escolha é aplicada na leitura.
5. No **Fluxo de Caixa**, aportes e resgates de um ativo que mudou de aba passam para a linha da aba nova em todos os meses. Troca só de seção não mexe no Fluxo.
6. A **compra** de um ativo que o usuário já tem deixa de regravar o subgrupo. Junto, corrigir o bug do BDR que não salva a estratégia.
7. Ativo que não pode ser movido (RF, Reservas, Imóveis…): na página do ativo aparece só uma frase, sem botão desabilitado.
8. ETF: Brasil e EUA sempre livres dentro da aba. ETF em dólar ↔ Stocks/REITs fica bloqueado ("em validação") até conferir com uma carteira real.
9. Consultor agindo pelo cliente pode mover. Fica "via consultor" no histórico e no selo.
10. O selo "movido" e o "Voltar ao original" aparecem só na troca de **aba** e vêm do Histórico de alterações, sem colunas novas.
11. Fica fora, em PRs separados: units B3 cadastradas como ação (TAEE11…), que não aparecem em nenhuma aba (antes, contar em prod); divergência entre pizza e aba nos fundos legados 'fund'; contraste das faixas de seção (TABLE_STYLES).

## Modelo

Migration aditiva: `portfolios.categoriaOverride`, `portfolios.tipoFundo` e `watchlists.categoriaOverride` (TEXT NULL). O override só é gravado quando o destino é diferente da aba base; voltar para a base grava null. Funções únicas: `categoriaEfetiva()` e `wherePortfolioDaCategoria()`. O Asset.type do catálogo nunca muda.

## Fatias de construção

0 contratos → em paralelo: A (API, histórico e desfazer), B (rotas das abas e operação), C (demais consumidores), D (diálogo, sheet, página do ativo e wizard), E (DnD, bandeja, cartões mobile e e2e).
