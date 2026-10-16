/**
 * Textos dos avisos das listas (bloco 1, dono: fatia 0; usados pela fatia D): Alertas da lista,
 * aba Salvos › Alertas, títulos e mensagens das Notification, push 'analise' e a linha em
 * Perfil › Notificações.
 *
 * Três tipos NEUTROS (decisão do Wellington, 16/10): resultado entregue à CVM e provento anunciado
 * (ligados por padrão) e mudança no "n de 6" em 5 anos (desligado por padrão). SEM aviso de preço,
 * SEM "provento pago" (a Agenda já avisa), resumo fixo acima de 5 no dia, retenção de 90 dias,
 * "por volta das 8h" (o job roda às 11:10 UTC).
 *
 * Regras: nenhum título leva R$ nem palavra proibida (linguagemV2: 'compra', 'recomendação',
 * 'ranking', 'melhor'…); o push leva só o título + o corpo genérico (valores e datas ficam no app);
 * o texto fixo dos avisos é o literal 'aviso-salvos-alertas' de textosLiterais.ts (pendente de
 * jurídico), mostrado com data-texto-legal. O título do aviso de RESULTADO de ações reaproveita
 * tituloResultado/descricaoResultado de eventos/textosEventos.ts (sem textos paralelos).
 */
export const TEXTOS_ALERTAS = {
  /** os 3 interruptores (Alertas da lista e o resumo da lista) */
  tipos: {
    resultado: {
      rotulo: 'Resultado entregue à CVM',
      curto: 'resultado entregue',
      descricao:
        'Quando a empresa ou o fundo entrega uma nova demonstração à CVM (DFP, ITR ou informe trimestral).',
    },
    provento: {
      rotulo: 'Provento anunciado (data-com)',
      curto: 'provento anunciado',
      descricao:
        'Quando sai um novo dividendo, JCP ou rendimento, com valor por ação ou cota, data-com e data de pagamento.',
    },
    criterios: {
      rotulo: 'Mudança na contagem de critérios, 5 anos',
      curto: 'contagem de critérios',
      descricao:
        'Quando o número de critérios atendidos na janela de 5 anos muda na atualização diária (por exemplo, de 5 de 6 para 4 de 6). Vem desligado.',
    },
    /** junta os curtos ("resultado entregue, provento anunciado") */
    separador: ', ',
  },

  /** Modal "Alertas da lista" (fatia D). */
  daLista: {
    titulo: 'Alertas da lista "{lista}"',
    subtituloUm:
      'Vale para o ativo da lista. Chega no sino do app e, se você ativou, como notificação no celular.',
    subtituloN:
      'Valem para os {n} ativos da lista. Chegam no sino do app e, se você ativou, como notificação no celular.',
    rodape:
      'Um ativo em várias listas recebe um aviso só por evento. Os avisos saem uma vez por dia, por volta das 8h (horário de Brasília).',
    cancelar: 'Cancelar',
    salvar: 'Salvar alertas',
    salvando: 'Salvando…',
    fechar: 'Fechar',
    erro: 'Não foi possível salvar os alertas. Tente de novo.',
    toastSalvos: 'Alertas de {lista} salvos.',
    toastDesligados: 'Alertas de {lista} desligados.',
  },

  /** Aba Salvos › Alertas (fatia D). */
  aba: {
    titulo: 'Alertas',
    periodo: 'últimos 90 dias',
    novos: '{n} novos',
    umNovo: '1 novo',
    novoSr: 'novo',
    marcarTodos: 'Marcar todos como lidos',
    marcados: 'Alertas marcados como lidos.',
    hoje: 'Hoje · {data}',
    ontem: 'Ontem · {data}',
    rotuloItem: '{titulo}. {mensagem}',
    vazioTitulo: 'Nenhum alerta por aqui ainda',
    vazioTexto:
      'Quando um ativo das suas listas entregar resultado à CVM, anunciar provento ou mudar a contagem de critérios, o aviso aparece aqui e no sino do app. Os avisos ficam aqui por 90 dias.',
    ligarAlertasDe: 'Ligar alertas de "{lista}"',
    criarLista: 'Criar lista',
    vazioClasseTitulo: 'Sem alertas de {classe} nos últimos 90 dias',
    vazioClasseUm: 'Há 1 alerta em {classe}.',
    vazioClasseN: 'Há {n} alertas em {classe}.',
    classe: { acao: 'Ações', fii: 'FIIs' },
    erroTitulo: 'Não foi possível carregar os alertas',
    erroTexto:
      'A conexão com o servidor falhou. Seus dados estão guardados; tente de novo em instantes.',
    tentar: 'Tentar de novo',
    carregando: 'Carregando…',
    consultor: 'Os alertas são pessoais e não aparecem no modo consultor.',
  },

  /** Painel "Como os avisos chegam" (fatia D). */
  comoChegam: {
    titulo: 'Como os avisos chegam',
    intro:
      'Valem para todos os avisos da Análise de Ativos. O que cada lista avisa você escolhe em "Alertas da lista".',
    sinoTitulo: 'No sino do app',
    sinoTexto: 'Todo aviso aparece no sino e nesta tela por 90 dias.',
    sempre: 'Sempre',
    pushTitulo: 'Notificação no celular',
    pushTexto:
      'Usa a mesma permissão das outras notificações do app. É a linha "Análise de Ativos" em Perfil › Notificações.',
    pushDesligadoAparelho:
      'Este aparelho não recebe notificações do My Finance. Ative em Perfil › Notificações e volte aqui.',
    abrirPerfil: 'Abrir Perfil › Notificações',
    resumoTitulo: 'Mais de 5 no dia viram um aviso só',
    resumoTexto: 'Em vez de 6 notificações, chega uma: "Novidades em 6 ativos dos seus Salvos".',
    exemploTitulo: 'Como aparece no celular',
    exemploAria:
      'Exemplo de notificação no celular: TAEE11, provento anunciado. Toque para ver os detalhes na Análise de Ativos.',
    exemploTituloNotificacao: 'TAEE11: provento anunciado',
    exemploAgora: 'agora',
    exemploNota:
      'A notificação mostra só o ticker e o tipo de aviso. Valores e datas ficam dentro do app.',
    horario:
      'Os avisos saem uma vez por dia, por volta das 8h (horário de Brasília), depois da atualização das demonstrações, dos proventos e dos critérios. No máximo 1 aviso por ativo e por tipo no dia, mesmo que o ativo esteja em várias listas. Ativos que estão na sua Carteira continuam com o lembrete de pagamento na Agenda.',
  },

  /** Títulos e mensagens das Notification (fatia D, textosDoAviso). Nenhum título leva R$. */
  aviso: {
    /** separador de tickers da mesma companhia no título ("PETR3/PETR4") */
    separadorCompanhia: '/',
    fiiTrimestralTitulo: '{ticker}: informe trimestral publicado na CVM',
    fiiTrimestralMensagem:
      'O fundo entregou o informe do {trimestre}º trimestre de {ano} em {data}. Os números entram na Análise de Ativos depois do processamento diário.',
    resultadoComplemento: 'Os números entram na Análise de Ativos depois do processamento diário.',
    proventoTitulo: '{ticker}: provento anunciado',
    proventoMensagem:
      '{tipo} de R$ {valor} por {unidade} · data-com {dataCom} · pagamento {pagamento}.',
    proventoMensagemSemPagamento:
      '{tipo} de R$ {valor} por {unidade} · data-com {dataCom} · pagamento a definir.',
    proventoTipo: {
      dividendo: 'Dividendos',
      jcp: 'JCP',
      rendimento: 'Rendimento',
      outro: 'Provento',
    },
    proventoUnidade: { acao: 'ação', unit: 'unit', cota: 'cota' },
    criteriosTitulo: '{ticker}: a contagem de critérios mudou',
    criteriosMensagem:
      'De {de} de {total} para {para} de {total} na janela de 5 anos ({anoInicio}–{anoFim}).',
    resumoTitulo: 'Novidades em {n} ativos dos seus Salvos',
    resumoMensagem:
      'Resultados entregues à CVM, proventos anunciados e outras novidades das suas listas.',
  },

  /** Push na categoria 'analise' (fatia D, src/lib/push/contract.ts copia o literal). */
  push: {
    corpoGenerico: 'Toque para ver os detalhes na Análise de Ativos.',
  },

  /** Sino do app. */
  sino: {
    verTodos: 'Ver todos os alertas',
    origem: 'Análise de Ativos',
  },

  /** Perfil › Notificações (fatia D, NotificacoesPreferencias; só com analiseVisivel). */
  perfil: {
    rotulo: 'Análise de Ativos: avisos das suas listas',
    descricao:
      'Resultado entregue à CVM e provento anunciado dos ativos que você salvou (e a contagem de critérios, se você ligar na lista).',
    toastLigado: 'Notificações no celular ligadas para a Análise de Ativos.',
    toastDesligado:
      'Notificações no celular desligadas para a Análise de Ativos. Os avisos seguem no sino.',
  },
} as const;
