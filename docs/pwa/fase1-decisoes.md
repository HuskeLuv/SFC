# Decisões do Wellington — fase 1 (Carteira), 25/09/2026

Aceitou todas as recomendações ("pode seguir"). **Valem sobre a spec** (`fase1-spec-desenho.json`): a versão final do arquiteto e a do designer foram escritas em paralelo e divergem em alguns pontos — onde divergem, vale o que está aqui (= protótipo `fase1-prototipo.html`).

1. Classes: trilho de chips (labels de hoje, `role=button` + `aria-current`, alvo de 44px) + botão fixo **"Todas"** que abre sheet com as 14 classes (valor e %).
2. Topo da /carteira abaixo de lg: o **h1 "Carteira de Investimentos" CONTINUA VISÍVEL** (compacto, 18px) — NÃO usar sr-only (o arquiteto propôs; rejeitado: quebra READY_SELECTOR/mobile-shell). Somem só o subtítulo e os botões Adicionar/Resgatar. O listener do + Lançar e os wizards (lazy) sobem para `CarteiraTabs`, funcionando também com a Análise aberta.
3. Pizza "Tipos de investimento" **FICA** (legenda embaixo no celular). NÃO trocar por lista nova de alocação (o arquiteto propôs; rejeitado).
4. Alocação: o próprio `AlocacaoAtivosTable` em cartões; sheet com **"Aplicar"** + barra fixa "N alterações não salvas" com Descartar/Salvar (`saveChanges`), igual ao desktop. Reserva de Emergência em R$.
5. Edição: `MobileEditSheet` salva no botão (ou Enter; textarea: Enter quebra linha); retorno `false` ou exceção = falha → sheet fica aberto com erro. **SEM Desfazer nesta fase** (o arquiteto propôs Desfazer; rejeitado). Aviso "salvo" de 4s sem ação.
6. Ordenar ativos no celular (Ordem da carteira / Maior valor / Rentabilidade / Mais longe do objetivo / Nome), dentro de cada seção. Só celular.
7. Seções vazias (ex.: Growth sem ativos) escondidas no celular.
8. Calendário nativo em TODAS as datas do cadastro e do resgate (`nativeOnMobile`), mantendo o aviso de dia útil B3.
9. Aba ativa na URL (`/carteira?aba=acoes`), com `router.replace` (sem encher o histórico).
10. Tipos agrupados no wizard (Adicionar e Planejar; Aporte usa a lista da API sem agrupar). Progresso = etapas visíveis reais (3 a 5).
11. "IR se resgatar hoje" na Renda Fixa: só se o cálculo JÁ existir pronto no sistema; senão fica fora. Nada de cálculo novo.
12. Performance: medir no build de produção (API × render); fazer só ganhos baratos de front (abas, wizards e gráficos sob demanda; `useReservaEmergencia` só na aba). Sem mudar cálculo nem API.
13. Fora da fase 1 (PRs separados depois): cor do Quanto Falta no desktop; remoção de AddInvestmentModal/AddInvestmentSidebar/AddReservaModal.
14. Quanto Falta no celular: pílula com ponto colorido + texto AA com a palavra ("Falta", "Acima", "No objetivo"). Faixa de seção: fundo tranquilidade 18% + texto segurança (claro) / 14% + #EAEAEA (escuro).
15. Desktop idêntico. Guarda estrutural de desktop por aba rodando no CI.
