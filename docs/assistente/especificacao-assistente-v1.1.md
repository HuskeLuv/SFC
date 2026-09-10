# Especificação Funcional — Assistente de IA (Pedro, v1.1, set/2026)

> Convertido do .docx enviado em 10/09/2026. Fonte da verdade do catálogo de intenções e prioridades.

Especificação Funcional — Assistente de IA
Catálogo de intenções, motores de execução e prioridades · Setembro/2026 · v1.1

# 1. Objetivo do documento

Especificar as intenções que o assistente de IA do app deve atender, classificando cada uma pelo motor de execução (o que define o custo), pelos dados e ferramentas necessárias e pela prioridade de implementação. Complementa o “Briefing Técnico — Redução do Custo da IA por Usuário”.

# 2. Arquitetura de roteamento (resumo)

Toda mensagem do usuário passa por três camadas, nesta ordem:

- Camada 1 — Regras: matching de intenções frequentes → query direta ao banco + template de resposta. Custo ~zero.
- Camada 2 — Classificador: modelo pequeno com prompt mínimo decide a intenção quando as regras não resolvem.
- Camada 3 — LLM completo: modelo pequeno (Haiku 4.5) com tool calling e prompt caching. Modelo maior só por exceção.
  Legenda dos motores usados nas tabelas:
- R — Regra/consulta direta: resolvido sem LLM (query + template). Custo ~zero.
- IA — LLM para análise/raciocínio, sem escrita de dados.
- IA+T — LLM com tool calling: executa ações de escrita na planilha do usuário. Exige confirmação (seção 5).
  Prioridades: P0 = MVP do assistente · P1 = segunda onda · P2 = evoluções.

# 3. Catálogo de intenções

## 3.1. Lançamentos e ações de escrita

| Intenção                  | Exemplo de pedido                                | Motor | Dados / ferramentas necessárias                                                        | Prioridade |
| ------------------------- | ------------------------------------------------ | ----- | -------------------------------------------------------------------------------------- | ---------- |
| Criar despesa             | “Gastei 45,90 no mercado hoje”                   | IA+T  | tool criar_lancamento(tipo, valor, data, conta, categoria, descricao)                  | P0         |
| Criar receita             | “Recebi 2.500 de freela na conta Nubank”         | IA+T  | tool criar_lancamento; lista de contas do usuário                                      | P0         |
| Criar transferência       | “Transferi 300 da Caixa pro Inter”               | IA+T  | tool criar_transferencia(origem, destino, valor, data)                                 | P1         |
| Lançar recibo por imagem  | Foto de comprovante Pix / recibo                 | IA+T  | modelo com visão; tool criar_lancamento; OCR de valor/data/estabelecimento             | P1         |
| Lançar fatura item a item | “Lance a fatura do cartão na planilha” (PDF/OFX) | IA+T  | parser OFX/CSV determinístico; IA só p/ PDF sem estrutura; tool criar_lancamentos_lote | P1         |
| Efetivar vencimentos      | “Efetive as despesas que vencem hoje”            | IA+T  | query despesas_pendentes(data); tool efetivar_lancamentos(ids)                         | P1         |
| Despesa recorrente        | “Crie academia de 120 por mês”                   | IA+T  | tool criar_recorrencia(valor, periodicidade, categoria)                                | P2         |
| Parcelamento              | “Divida esse gasto de 200 em 4x”                 | IA+T  | tool criar_parcelamento(lancamento_id, n_parcelas)                                     | P2         |
| Recategorizar em lote     | “Recategorize iFood como Delivery”               | IA+T  | query transacoes(filtro); tool atualizar_categoria_lote(ids, categoria)                | P2         |
| Excluir lançamento        | “Exclua o lançamento duplicado de ontem”         | IA+T  | query transacoes(filtro); tool excluir_lancamento(id); confirmação reforçada           | P2         |

## 3.2. Consultas rápidas (maior volume de mensagens)

| Intenção            | Exemplo de pedido                      | Motor | Dados / ferramentas necessárias                            | Prioridade |
| ------------------- | -------------------------------------- | ----- | ---------------------------------------------------------- | ---------- |
| Saldo               | “Qual meu saldo?” / “saldo da conta X” | R     | query saldo(conta?)                                        | P0         |
| Gasto por categoria | “Quanto gastei com delivery este mês?” | R     | query gastos(categoria, periodo)                           | P0         |
| Vencimentos         | “Quais contas vencem esta semana?”     | R     | query despesas_pendentes(intervalo)                        | P0         |
| Total da fatura     | “Qual o total da minha fatura?”        | R     | query fatura_atual(cartao?)                                | P0         |
| Orçamento restante  | “Quanto ainda posso gastar em lazer?”  | R     | query orcamento_status(categoria)                          | P0         |
| Maior despesa       | “Qual foi minha maior despesa do mês?” | R     | query top_despesas(periodo, n)                             | P0         |
| Receitas do período | “Quanto recebi este mês?”              | R     | query receitas(periodo)                                    | P0         |
| Duplicidades        | “Tenho despesas duplicadas?”           | R     | algoritmo de duplicidade (valor+data+descrição aproximada) | P1         |
| Sobra do mês        | “Quanto sobrou no mês passado?”        | R     | query resultado(periodo)                                   | P0         |

## 3.3. Análises e relatórios

| Intenção                      | Exemplo de pedido                            | Motor | Dados / ferramentas necessárias                                                    | Prioridade |
| ----------------------------- | -------------------------------------------- | ----- | ---------------------------------------------------------------------------------- | ---------- |
| Análise de fatura             | “Analise minha fatura do cartão”             | IA    | query fatura_detalhada; agregações por categoria/estabelecimento                   | P1         |
| Evolução de categoria         | “Evolução de Delivery nos últimos 6 meses”   | R     | query serie_temporal(categoria, meses); gráfico nativo; comentário opcional via IA | P1         |
| Comparativo mensal            | “Compare este mês com o mês passado”         | IA    | queries de agregação dos 2 períodos                                                | P1         |
| Comparar cartões              | “Compare meus cartões de crédito”            | IA    | query faturas por cartão; limites e vencimentos                                    | P2         |
| Diagnóstico de gastos         | “Onde estou gastando mais do que deveria?”   | IA    | gastos vs orçamento vs média histórica por categoria                               | P1         |
| Relatório inteligente mensal  | “Análise de Abril: Olho no Cartão!”          | IA    | Batch API (processamento noturno, 50% de desconto); agregações do mês + histórico  | P1         |
| Configurar relatório por fala | “Relatório de fluxo de caixa do ano passado” | IA+T  | tool configurar_relatorio(filtros) — IA só monta filtros; app gera o relatório     | P2         |

## 3.4. Gestão orçamentária

| Intenção             | Exemplo de pedido                                         | Motor | Dados / ferramentas necessárias                                                 | Prioridade |
| -------------------- | --------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- | ---------- |
| Remanejar orçamento  | “Estourei restaurante, o que faço?”                       | IA    | orcamento_status (todas categorias); folgas disponíveis; tool ajustar_orcamento | P1         |
| Orçamento automático | “Monte um orçamento baseado nos últimos 3 meses”          | IA+T  | médias por categoria; tool criar_orcamento(categorias, valores); confirmação    | P1         |
| Ajustar orçamento    | “Ajuste mercado para 800”                                 | IA+T  | tool ajustar_orcamento(categoria, valor)                                        | P1         |
| Alerta de estouro    | “Você já usou 85% do orçamento de lazer” (proativo)       | R     | job diário de verificação de limiares (70/85/100%)                              | P1         |
| Simulação            | “Se eu cortar delivery pela metade, quanto sobra no ano?” | IA    | média da categoria; cálculo de projeção                                         | P2         |

## 3.5. Planejamento e metas

| Intenção              | Exemplo de pedido                             | Motor | Dados / ferramentas necessárias                  | Prioridade |
| --------------------- | --------------------------------------------- | ----- | ------------------------------------------------ | ---------- |
| Plano de meta         | “Juntar 10 mil até dezembro, quanto por mês?” | R     | cálculo determinístico; IA só se pedir conselho  | P2         |
| Depósito em meta      | “Registre 500 na meta Viagem”                 | IA+T  | tool registrar_deposito_meta(meta, valor)        | P2         |
| Projeção de meta      | “No ritmo atual, quando atinjo a meta?”       | R     | query historico_depositos; projeção linear       | P2         |
| Capacidade de parcela | “Consigo assumir 890 por mês?”                | IA    | renda média, compromissos fixos, sobra histórica | P2         |

## 3.6. Mensagens proativas (IA inicia a conversa)

| Intenção                   | Exemplo de pedido                           | Motor | Dados / ferramentas necessárias                         | Prioridade |
| -------------------------- | ------------------------------------------- | ----- | ------------------------------------------------------- | ---------- |
| Resumo semanal             | Mensagem automática de resumo de gastos     | IA    | Batch API semanal; agregações da semana                 | P2         |
| Aviso de vencimento        | “Sua conta de luz vence amanhã”             | R     | job diário sobre despesas_pendentes                     | P1         |
| Gasto atípico              | “Farmácia 3x acima da sua média”            | R     | detecção estatística (média + desvio) por categoria     | P2         |
| Nova recorrência detectada | “Identifiquei uma assinatura nova de 34,90” | R     | detecção de padrão (mesmo valor/estabelecimento mensal) | P2         |

## 3.7. Onboarding e criação de orçamento

O onboarding conversacional segue a metodologia Pedro Haddad: o orçamento nasce das prioridades de vida do usuário (o que é importante preservar para qualidade de vida no presente), e não de cortes genéricos. Pendência: fundador deve documentar as etapas da metodologia para codificação no system prompt do fluxo.
| Intenção | Exemplo de pedido | Motor | Dados / ferramentas necessárias | Prioridade |
| --- | --- | --- | --- | --- |
| Onboarding guiado | Primeiro acesso: IA conduz criação de contas, categorias e primeiro orçamento | IA+T | fluxo conversacional com roteiro da metodologia Pedro Haddad no system prompt; tools criar_conta, criar_categoria, criar_orcamento; barra de progresso das etapas | P1 |
| Questionário de prioridades | “O que é importante pra você?” → orçamento alinhado aos valores do usuário (qualidade de vida no presente) | IA+T | questionário estruturado (5-8 perguntas); mapeamento prioridade → pesos por categoria; tool criar_orcamento; confirmação | P1 |
| Revisão pós-onboarding | Aos 30 dias: comparar orçado vs realizado e propor ajustes (proativo) | IA | Batch API; orcamento_status completo do 1º mês | P2 |

## 3.8. Previsão de fluxo de caixa e gestão de dívidas

| Intenção                     | Exemplo de pedido                                 | Motor | Dados / ferramentas necessárias                                                                  | Prioridade |
| ---------------------------- | ------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ | ---------- |
| Saldo projetado              | “Qual meu saldo no dia 30?”                       | R     | recorrências + vencimentos pendentes + média diária de gastos variáveis                          | P1         |
| Alerta de vermelho           | “Vou fechar o mês no vermelho?” (também proativo) | R     | projeção de saldo + limiar; job diário                                                           | P1         |
| Plano de quitação de dívidas | “Me ajude a quitar minhas dívidas”                | IA    | cadastro de dívidas (saldo, juros, parcela); métodos bola de neve e avalanche; ordem de quitação | P1         |
| Custo do rotativo            | “Quanto o rotativo do cartão me custou este mês?” | R     | juros/encargos identificados na fatura                                                           | P1         |
| Antecipação de parcelas      | “Vale a pena antecipar parcelas?”                 | IA    | simulação de desconto vs custo de oportunidade                                                   | P2         |

## 3.9. Assinaturas, conciliação e busca

Nota: a conciliação é pré-requisito de confiabilidade — sem deduplicação entre fontes, todas as análises e projeções perdem valor. Tratar como fundação, não como feature.
| Intenção | Exemplo de pedido | Motor | Dados / ferramentas necessárias | Prioridade |
| --- | --- | --- | --- | --- |
| Auditoria de assinaturas | “Quanto gasto por ano com streamings e assinaturas?” | IA | recorrências detectadas; custo anualizado; sugestões de corte por baixo uso | P1 |
| Conciliação inteligente | Deduplicar entre lançamento manual, notificação, OFX e Open Finance | R | matching fuzzy (valor + data ± 2 dias + descrição); fila de revisão para casos ambíguos; IA só nos ambíguos | P1 |
| Busca semântica | “Aquele jantar caro em julho” / “o boleto do dentista” | IA | LLM converte descrição vaga em filtros de transacoes(); alternativa: embeddings das descrições | P2 |

## 3.10. Planejamento anual, score e Imposto de Renda

| Intenção                   | Exemplo de pedido                                                                            | Motor | Dados / ferramentas necessárias                                                                                               | Prioridade |
| -------------------------- | -------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Provisão sazonal (BR)      | “Em janeiro você gasta R$ 2.400 a mais (IPVA/IPTU/matrícula). Reservar desde já?” (proativo) | R     | histórico por mês; calendário fiscal BR; sugestão de reserva mensal; considerar 13º como receita sazonal                      | P2         |
| Score de saúde financeira  | Índice 0-100 com evolução mensal                                                             | R     | fórmula por regra: sobra do mês, adesão ao orçamento, endividamento, reserva de emergência                                    | P2         |
| Modo casal/família         | Visão consolidada de dois perfis; despesas compartilhadas                                    | R     | multi-perfil com permissões; rateio de despesas; agregações consolidadas (feature de produto; IA consome os dados)            | P2         |
| Resumo de dedutíveis (IR)  | “Quanto gastei com saúde e educação este ano?”                                               | R     | flag dedutível por categoria (saúde, educação, previdência); somatórios anuais                                                | P2         |
| Simulação PGBL             | “Quanto aportar em PGBL para o benefício fiscal?”                                            | IA    | receita bruta anual do usuário; regra dos 12% da renda bruta tributável; resposta sempre com ressalva de validar com contador | P2         |
| Exportação para o contador | “Gere o resumo anual para o meu contador”                                                    | R     | export CSV/PDF por categoria dedutível e por mês                                                                              | P2         |

## 3.11. Suporte, voz e educação

| Intenção                       | Exemplo de pedido                                                              | Motor | Dados / ferramentas necessárias                                                                                                     | Prioridade |
| ------------------------------ | ------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Suporte nível 1 do app         | “Como importo um arquivo OFX?”                                                 | IA    | RAG sobre a central de ajuda; prompt caching; escalar para humano quando não resolver (já previsto na estrutura da empresa)         | P1         |
| Entrada por voz                | Áudio: “gastei quarenta e cinco e noventa no mercado”                          | IA+T  | speech-to-text; mesmo fluxo de criar_lancamento + confirmação                                                                       | P2         |
| Educação financeira contextual | “O que é CDI?” / “Como funciona o rotativo?” com os números do próprio usuário | IA    | glossário curado + dados do usuário (ex.: “seu rotativo custou R$ 87 este mês”); nunca recomendar investimento específico (seção 8) | P2         |

# 4. Ferramentas (tools) a expor para o LLM

Conjunto mínimo de ferramentas que o backend deve expor via tool calling. A IA nunca acessa o banco diretamente — só chama estas funções:

- Leitura: saldo(conta?), gastos(categoria?, periodo), receitas(periodo), transacoes(filtros), fatura_atual(cartao?), fatura_detalhada(cartao, mes), despesas_pendentes(intervalo), orcamento_status(categoria?), serie_temporal(categoria, meses), top_despesas(periodo, n), resultado(periodo).
- Leitura (novas na v1.1): saldo_projetado(data), dividas(), custo_rotativo(mes), recorrencias_detectadas(), gastos_dedutiveis(ano), historico_sazonal(mes), score_saude_financeira().
- Escrita (novas na v1.1): criar_conta(...), criar_categoria(...), criar_divida(...), marcar_dedutivel(categoria, flag), criar_reserva_sazonal(...).
- Escrita: criar_lancamento(...), criar_lancamentos_lote(...), criar_transferencia(...), efetivar_lancamentos(ids), atualizar_categoria_lote(ids, categoria), excluir_lancamento(id), criar_orcamento(...), ajustar_orcamento(categoria, valor), criar_recorrencia(...), criar_parcelamento(...), registrar_deposito_meta(meta, valor), configurar_relatorio(filtros).
  Regra de ouro: as ferramentas de leitura retornam dados agregados e enxutos (nunca o extrato completo), para manter o contexto — e o custo — pequeno.

# 5. Fluxo de confirmação obrigatório (ações IA+T)

Nenhuma ação de escrita é efetivada sem confirmação explícita do usuário. Fluxo padrão:

- A IA interpreta o pedido e monta a ação estruturada (JSON) via tool calling.
- O app exibe um card-resumo: tipo, valor, data, conta, categoria e descrição.
- O usuário confirma (1 toque) ou edita os campos antes de confirmar.
- Só após a confirmação o backend grava. A IA nunca escreve direto no banco.
- Exceção de reforço: exclusões e ações em lote exigem confirmação com listagem dos itens afetados.
- Auditoria: todo lançamento criado via IA recebe flag de origem (ex.: origem = “assistente”) para rastreabilidade e métricas.

# 6. Ordem de implementação sugerida

- Fase 1 (MVP — P0): as 8 consultas rápidas [R] + criar despesa/receita por texto [IA+T] + fluxo de confirmação. Isso já cobre a maior parte do volume de uso.
- Fase 2 (P1): recibo por foto, fatura item a item, efetivar vencimentos, análises comparativas, relatório inteligente mensal via Batch API, alertas de orçamento e vencimento. Novas na v1.1: onboarding guiado + questionário de prioridades, saldo projetado e alerta de vermelho, plano de quitação de dívidas, custo do rotativo, auditoria de assinaturas, conciliação inteligente e suporte nível 1.
- Fase 3 (P2): recorrências, parcelamentos, metas, simulações, detecção de anomalias, busca semântica, sazonalidade, score de saúde financeira, modo casal/família, módulo IR (dedutíveis, PGBL, exportação), voz e educação contextual.

# 7. Métricas por intenção (instrumentar desde o MVP)

- Volume de mensagens por intenção e por motor (R / IA / IA+T).
- % de mensagens resolvidas na Camada 1 (meta: ≥ 60%).
- Custo médio por mensagem e por usuário/mês.
- Taxa de confirmação vs. edição vs. cancelamento nos cards de ação (qualidade da interpretação).
- Taxa de acerto do cache de prompt.
- Intenções não reconhecidas (fila de revisão para ampliar a Camada 1).

# 8. Limite regulatório: investimentos (fora de escopo)

A IA não deve recomendar alocação de investimentos (“onde devo investir?”, “qual fundo comprar?”). Recomendação personalizada de investimento é atividade regulada (CVM). Comportamento-padrão a implementar:

- Responder com educação financeira geral (conceitos, classes de ativos, no máximo exemplos genéricos não personalizados).
- Sugerir a consulta a um profissional habilitado para recomendação específica.
- Registrar essas perguntas em métrica própria (demanda reprimida — insumo para futura parceria/produto regulado).
  Este limite deve constar no system prompt e ser validado no mapeamento de perímetro regulatório com o DPO (pendência estratégica já registrada).

# 9. Changelog

- v1.1 (set/2026): adicionadas seções 3.7 a 3.11 (onboarding com metodologia Pedro Haddad, questionário de prioridades, previsão de fluxo de caixa, gestão de dívidas, auditoria de assinaturas, conciliação, busca semântica, sazonalidade, score, casal/família, IR/PGBL, suporte nível 1, voz, educação contextual); novas tools; fases atualizadas; seção 8 (limite regulatório).
- v1.0 (set/2026): versão inicial.
