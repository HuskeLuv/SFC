# Decisões do Wellington — fase 2 (Fluxo de caixa), 26/09/2026

Aceitou todas as recomendações ("pode seguir"). **Valem sobre a spec** (`fase2-spec-desenho.json`) e sobre o protótipo (`fase2-prototipo.html`) onde divergirem.

1. **Linhas sem valor no mês ficam ESCONDIDAS** na visão do mês: em cada grupo, só as linhas com valor + botão "Mostrar N linhas sem valor" (o protótipo mostra todas com "—"; vale esta decisão). Grupo sem nenhuma linha preenchida mostra só a faixa com o subtotal R$ 0,00 e o botão.
2. **Situação da célula = PONTO colorido** (cor exata escolhida pelo usuário, com anel) ao lado do valor; o valor em texto na cor normal. Nome da situação no nome acessível e no sheet. Desktop inalterado.
3. **"Ano inteiro" SÓ LEITURA** em tela cheia; tocar no nome do mês fecha e abre aquele mês na visão do mês. Coluna de itens fixa 128px; Total do ano como última coluna, não fixa.
4. **Desfazer só no lançamento rápido.** Editar valor, renomear, mover, reordenar, excluir → aviso "Salvo" sem ação (o histórico atual não sabe desfazer essas ações). Excluir avisa no próprio sheet que não tem Desfazer.
5. **Lançamento rápido:** um mês = SOMA ao valor da célula; "Definir este valor em todo mês" = TROCA do mês escolhido até dezembro (ou "Até"), meses que diminuem em vermelho + confirmação obrigatória; nunca mexe em meses anteriores. Descrição vai para o comentário da célula SÓ se preenchida (o assistente continua carimbando sempre). Origem no histórico: "(lançamento rápido)". Prévia pela mesma rota (`confirmar:false`), lançamento em um toque.
6. Consultor personificando PODE usar o lançamento rápido (registrado como via consultor, igual à planilha).
7. Depois de lançar FORA do Fluxo: fica na tela, aviso com Desfazer. Se já estiver no Fluxo: pula para o mês, abre o grupo e pisca a linha.
8. Linhas de **Dívidas** no celular: sem Renomear/Excluir, com "Gerida em Dívidas". Desktop (que mostra o botão e falha em silêncio) = PR separado depois.
9. **Orçamento no celular:** selos "Dentro da meta" (< 80%), "Atenção" (80–100%), "Estourou" (> 100%) — mesmos cortes do sino (`orcamentoAlertas`). Manter o nome "Consolidado" (não "Só pago/recebido"). "Orçado × real" em barras horizontais. Alinhar cores/corte do desktop = PR separado.
10. Mês inicial = mês atual (dez em ano passado, jan em ano futuro), em `?mes=` (history.replaceState), compartilhado com o Orçamento; lançamento rápido abre no mês de hoje. Total do ano embaixo de cada linha LIGADO por padrão (desligável no ⋯). Recolher/expandir compartilhado com o desktop (mesma chave). Linha calculada abre sheet explicando a conta. Só a barra do mês fica fixa ao rolar. Barra de teclas `= + − × ÷ ( )` para fórmula (a tecla "−" insere "-").
11. e2e do lançamento rápido só até a PRÉVIA (sem gravar); gravação e desfazer cobertos no Vitest da rota.
12. Arrastar → "Mover" no sheet da linha (cima/baixo/outra seção) + "Reordenar linhas" com setas no ⋯ do grupo. Importar planilha no celular em tela cheia (3 passos) dentro do ⋯.
13. Desktop idêntico; guarda estrutural `desktop-fluxo.spec` (planilha + orçamento) gravada ANTES de refatorar e rodando no CI.
