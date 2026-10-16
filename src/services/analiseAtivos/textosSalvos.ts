/**
 * Textos do bloco 1 — Salvos, filtros salvos, comparações salvas e Exportar PDF (dono: fatia 0).
 * TODA a cópia das fatias A (mensagens do servidor e do PDF), B (entradas) e C (página Salvos) fica
 * aqui; os avisos das listas ficam em textosAlertas.ts. Nenhum componente escreve texto solto.
 *
 * Origem: HTML do Pedro (D1: "<T> salvo em Salvos · você recebe aviso de resultado e data-com",
 * "<T> removido de Salvos"), protótipo do designer (docs/analise-ativos/bloco1-salvos/
 * prototipo.html) e arquitetura do desenho.json (que vale em divergência: "por volta das 8h",
 * PDF sem opções, listas pessoais no modo consultor).
 *
 * Compliance: toda folha passa pela varredura linguagemV2 (linguagemV2Global.test.ts) — nada de
 * 'compre', 'compra', 'barato', 'caro', 'oportunidade', 'recomend*', 'faltam', 'melhores',
 * 'ranking' (a pílula do bloco 3 fica reservada SEM rótulo). Placeholders entre chaves
 * ({ticker}, {lista}, {n}, {max}…), preenchidos com formatarTexto (textos.ts).
 *
 * Toast: o protótipo mostra o ticker e a lista em negrito; o aviso do app (mostrarToastMover) é
 * texto puro, então os literais vão sem marcação.
 */
export const TEXTOS_SALVOS = {
  /** pílula da casca (fatia C) */
  pilula: 'Salvos',
  criarLista: {
    botao: 'Criar lista',
    aria: 'Criar lista',
  },

  /** Modo consultor: listas, filtros e comparações são pessoais (decisão do Wellington 16/10). */
  consultor: {
    titleListas: 'As listas são pessoais e não aparecem no modo consultor.',
    titleFiltros: 'Filtros salvos são pessoais e não aparecem no modo consultor.',
    titleComparacoes: 'Comparações salvas são pessoais e não aparecem no modo consultor.',
    marcadorAria: 'Salvar {ticker} (indisponível no modo consultor)',
    faixa:
      'As listas são pessoais e não aparecem no modo consultor. Filtros e comparações salvos também ficam de fora; o Quadro, o Comparador e o PDF funcionam normalmente.',
    paginaTitulo: 'Salvos não aparece no modo consultor',
    paginaTexto:
      'As listas, os filtros e as comparações salvas são pessoais de cada usuário, como a Minha tese. Para ver os dados de um ativo, use o Quadro ou a página do ativo.',
    irQuadro: 'Ir para o Quadro',
  },

  /** Botão Salvar do cabeçalho do ativo (fatia B) e marcador do Quadro. */
  salvar: {
    salvar: 'Salvar',
    salvo: 'Salvo ✓',
    aria: 'Salvar {ticker}',
    ariaSalvo: 'Salvo em {listas}. Mudar listas',
    /** marcador da linha/cartão do Quadro */
    linhaAria: 'Salvar {ticker}',
    linhaAriaSalvo: '{ticker} está salvo',
    colunaQuadro: 'Salvar',
    /** linha embaixo do cabeçalho do ativo */
    salvoEm: 'Salvo em {listas}',
    /** separador dos nomes ("Dividendos e Utilidade pública") */
    juntarListas: ' e ',
    alertasDaLinha: ' · alertas: {tipos}',
    nenhumAlertaLigado: 'nenhum ligado nas listas',
    mudarListas: 'Mudar listas',
    verEmSalvos: 'Ver em Salvos',
  },

  /** "Salvar em…" (popover no computador, BottomSheet no celular). */
  escolherListas: {
    titulo: 'Salvar {ticker} em',
    instrucao: 'Marque uma ou mais listas. Vale na hora.',
    umAtivo: '1 ativo',
    nAtivos: '{n} ativos',
    listaCheia: ' · lista cheia ({max})',
    comAlertas: ' · com alertas',
    novaListaCom: 'Nova lista com {ticker}',
    limiteListas: 'Você chegou a {max} listas. Apague uma para criar outra.',
    limiteUsuario:
      'Você chegou a {max} ativos salvos na conta. Tire ativos de alguma lista em Salvos para salvar outros.',
    rodapeAlertas: 'Os alertas seguem os de cada lista.',
    pronto: 'Pronto',
    fechar: 'Fechar',
  },

  /** Avisos (toasts) — literais do Pedro (D1), sem marcação. */
  toast: {
    salvoEm: '{ticker} salvo em {lista}',
    /** só com recursos.alertas */
    comAviso: ' · você recebe aviso de resultado e data-com',
    removidoDe: '{ticker} removido de {lista}',
    listaCriada: 'Lista {lista} criada.',
    listaCriadaCom: 'Lista {lista} criada com {ticker}.',
    nomeAtualizado: 'Nome da lista atualizado.',
    listaApagada: 'Lista {lista} apagada.',
    desfazer: 'Desfazer',
    tentarDeNovo: 'Tentar de novo',
    erroSalvar: 'Não foi possível salvar {ticker}. Tente de novo.',
    erroRemover: 'Não foi possível remover {ticker}. Tente de novo.',
    erroGenerico: 'Não foi possível concluir agora. Tente de novo.',
  },

  /** ModalNomeLista (criar e renomear). */
  modalNome: {
    criarTitulo: 'Criar lista',
    criarSubtitulo: 'Dê um nome para encontrar a lista depois. Dá para mudar quando quiser.',
    criarSubtituloCom: '{ticker} entra na lista nova.',
    renomearTitulo: 'Renomear lista',
    renomearSubtitulo: 'O nome aparece em Salvos e nos alertas desta lista.',
    rotulo: 'Nome da lista',
    placeholder: 'ex.: Dividendos, Elétricas, Para estudar',
    contador: '{n}/{max}',
    erroVazio: 'Dê um nome à lista.',
    erroRepetido: 'Você já tem uma lista com esse nome. Escolha outro.',
    limite:
      'Você chegou a {max} listas, o limite por conta. Apague uma lista em Salvos para criar outra.',
    avisar: 'Avisar resultado e provento anunciado',
    avisarAjuda: 'Dá para mudar depois em Alertas da lista.',
    cancelar: 'Cancelar',
    criar: 'Criar lista',
    salvarNome: 'Salvar nome',
    salvando: 'Salvando…',
    fechar: 'Fechar',
  },

  /** Confirmação de apagar lista (fatia C). */
  apagarLista: {
    titulo: 'Apagar a lista "{lista}"?',
    saemItens: 'Os {n} ativos saem desta lista',
    saiUmItem: 'O ativo sai desta lista',
    alertasParam: ' e os alertas dela param',
    fimFrase: '. ',
    continuam:
      'Os ativos continuam nas outras listas e na sua Carteira, se estiverem lá. Não dá para desfazer.',
    confirmar: 'Apagar lista',
    cancelar: 'Cancelar',
  },

  /** Página /analise-ativos/salvos (fatia C). */
  pagina: {
    titulo: 'Salvos',
    segmento: {
      rotulo: 'Ver',
      listas: 'Listas',
      alertas: 'Alertas',
      novosAria: '{n} novos',
    },
    listas: {
      rotulo: 'Suas listas',
      novaLista: 'Nova lista',
      alertasLigadosSr: ', alertas ligados',
    },
    cabecalho: {
      umAtivo: '1 ativo · criada em {data}',
      nAtivos: '{n} ativos · criada em {data}',
      alertas: ' · alertas: {tipos}',
      nenhumAlerta: 'nenhum ligado',
      alertasDaLista: 'Alertas da lista',
      renomear: 'Renomear',
      renomearAria: 'Renomear lista',
      apagar: 'Apagar lista',
      apagarAria: 'Apagar lista',
    },
    abas: { rotulo: 'Classe', acao: 'Ações', fii: 'FIIs' },
    tabela: {
      legendaAcao: 'Ações da lista {lista}',
      legendaFii: 'FIIs da lista {lista}',
      adicionadoEm: 'Adicionado em',
      remover: 'Remover',
      removerAria: 'Remover {ticker} de {lista}',
      cartaoAdicionado: 'adicionado em {data}',
      criteriosAntes: 'antes {n} de {total} · {data}',
      nota: 'Critérios atualizados todo dia. Dado contábil histórico, não avaliação do My Finance.',
    },
    foraDoQuadro: {
      titulo: 'Fora do Quadro',
      texto:
        'Estes ativos não aparecem mais no Quadro (por exemplo, saíram da B3 ou ficaram sem dados). Dá para tirá-los da lista.',
      motivos: {
        fora_do_quadro: 'não está mais no Quadro',
        classe_reservada: 'classe ainda não disponível',
      },
    },
    vazio: {
      semListasTitulo: 'Você ainda não tem listas',
      semListasTexto:
        'Crie listas para acompanhar ativos com os mesmos dados do Quadro: critérios, preço, DY e o que você tem na Carteira. Para salvar um ativo, use o botão Salvar na página dele ou o marcador em cada linha do Quadro.',
      listaVaziaTitulo: 'A lista está vazia',
      listaVaziaTexto:
        'Use Salvar na página de um ativo ou o marcador nas linhas do Quadro e escolha "{lista}".',
      semAcaoTitulo: 'Nenhuma ação em {lista}',
      semFiiTitulo: 'Nenhum FII em {lista}',
      outraClasseUm: 'Esta lista tem 1 {classe}.',
      outraClasseN: 'Esta lista tem {n} {classe}.',
      classeSingular: { acao: 'ação', fii: 'FII' },
      classePlural: { acao: 'ações', fii: 'FIIs' },
      verOutra: 'Ver {classe}',
      irQuadro: 'Ir para o Quadro',
      criarLista: 'Criar lista',
    },
    erro: {
      titulo: 'Não foi possível carregar suas listas',
      texto:
        'A conexão com o servidor falhou. Seus dados estão guardados; tente de novo em instantes.',
      tentar: 'Tentar de novo',
    },
    carregando: 'Carregando…',
  },

  /** Filtros salvos do Quadro (fatia B). */
  filtros: {
    botao: 'Filtros salvos',
    botaoContagem: 'Filtros salvos ({n})',
    salvarFiltros: 'Salvar filtros',
    lista: {
      titulo: 'Filtros salvos · {classe}',
      instrucao: 'Clique para aplicar. Cada classe tem os seus.',
      instrucaoCelular: 'Toque para aplicar.',
      vazio:
        'Nenhum filtro salvo em {classe}. Escolha a janela e os critérios e toque em Salvar filtros.',
      contador: '{n} de {max}',
      fechar: 'Fechar',
      apagarAria: 'Apagar o filtro {nome}',
      confirmarApagar: 'Apagar {nome}?',
      apagar: 'Apagar',
      cancelar: 'Cancelar',
    },
    resumo: {
      separador: ' · ',
      janela: '{n} anos',
      setor: 'Setor: {setor}',
      segmento: 'Segmento: {setor}',
      naCarteira: 'Na minha carteira',
    },
    modal: {
      titulo: 'Salvar filtros',
      subtitulo: 'Guarda a combinação para reaplicar no Quadro de {classe}.',
      limite:
        'Você chegou a {max} filtros salvos em {classe}. Apague um em Filtros salvos para guardar outro.',
      oQueFica: 'O que fica salvo',
      janela: 'Janela: {n} anos',
      criterios: 'Critérios: {lista}',
      setor: 'Setor: {setor}',
      segmento: 'Segmento: {setor}',
      naCarteira: 'Só o que está na minha carteira',
      rotulo: 'Nome do filtro',
      ajuda: 'até {max} caracteres',
      nota: 'O resultado muda com a atualização diária dos critérios: o filtro guarda as regras, não a lista de ativos.',
      erroVazio: 'Dê um nome ao filtro.',
      repetido: 'Já existe um filtro com esse nome. Substituir?',
      substituir: 'Substituir',
      cancelar: 'Cancelar',
      salvar: 'Salvar filtros',
      salvando: 'Salvando…',
    },
    faixa: {
      aplicado: 'Filtro salvo: {nome}',
      alterado: 'alterado',
      salvarAlteracoes: 'Salvar alterações',
      salvarComoNovo: 'Salvar como novo',
      tirarAria: 'Tirar o filtro salvo {nome}',
      ajustado: 'Um critério deste filtro não existe mais nesta classe e foi retirado.',
      naoEncontrado: 'Este filtro salvo não existe mais. Os filtros da tela continuam.',
    },
    toast: {
      aplicado: 'Filtro {nome} aplicado: {n} de {total} atendem.',
      salvo: 'Filtro {nome} salvo. Ele fica em Filtros salvos.',
      atualizado: 'Filtro {nome} atualizado.',
      apagado: 'Filtro {nome} apagado.',
    },
  },

  /** Comparações salvas (fatia B no Comparador; fatia C na página Salvos). */
  comparacoes: {
    botaoSalvas: 'Comparações salvas',
    botaoSalvasContagem: 'Comparações salvas ({n})',
    salvar: 'Salvar comparação',
    salva: 'Comparação salva ✓',
    salvaNaBarra: 'Comparação salva: {nome}',
    lista: {
      titulo: 'Comparações salvas',
      instrucao: 'Clique para abrir com os dados de hoje.',
      instrucaoCelular: 'Toque para abrir.',
      item: '{classe} · {tickers} · {n} anos · salva em {data}',
      separadorTickers: ' · ',
      classe: { acao: 'Ações', fii: 'FIIs' },
      vazio: 'Nenhuma comparação salva. Monte uma comparação e toque em Salvar comparação.',
      vazioClasse: 'Nenhuma comparação salva em {classe}.',
      contador: '{n} de {max}',
      fechar: 'Fechar',
      abrirAria: 'Abrir a comparação {nome}',
      renomear: 'Renomear',
      renomearAria: 'Renomear a comparação {nome}',
      apagarAria: 'Apagar a comparação {nome}',
      confirmarApagar: 'Apagar {nome}?',
      apagar: 'Apagar',
      cancelar: 'Cancelar',
      salvarNome: 'Salvar nome',
      rotuloNome: 'Nome da comparação',
      erro: 'Não foi possível carregar as comparações salvas.',
      tentar: 'Tentar de novo',
      carregando: 'Carregando…',
    },
    modal: {
      titulo: 'Salvar comparação',
      subtitulo: '{classe} · {tickers} · janela de {n} anos',
      rotulo: 'Nome da comparação',
      ajuda: 'até {max} caracteres',
      nota: 'Ficam salvos os ativos e a janela. Ao abrir de novo, os números vêm atualizados.',
      erroVazio: 'Dê um nome à comparação.',
      limite:
        'Você chegou a {max} comparações salvas. Apague uma em Comparações salvas para guardar outra.',
      cancelar: 'Cancelar',
      salvar: 'Salvar comparação',
      salvando: 'Salvando…',
    },
    toast: {
      salva: 'Comparação {nome} salva.',
      atualizada: 'Comparação atualizada',
      verSalvas: 'Ver salvas',
      aberta: 'Comparação {nome} aberta com os dados de hoje.',
      apagada: 'Comparação {nome} apagada.',
      renomeada: 'Nome da comparação atualizado.',
    },
  },

  /** Exportar PDF do Comparador (fatia B: modal; fatia A: documento). Sem opções no bloco 1. */
  pdf: {
    botao: 'Exportar PDF',
    titulo: 'Exportar PDF',
    subtitulo: '{classe} · {tickers} · {n} anos',
    vaiTitulo: 'O que vai no PDF',
    vaiItens: [
      'Os critérios e os números desta comparação, com as fontes e as datas.',
      'A Leitura dos dados e o aviso legal em toda página.',
    ],
    foraTitulo: 'O que fica de fora',
    foraItens: [
      'Sua posição na Carteira, seu nome e seu e-mail. O PDF costuma ser compartilhado.',
      'Os mini-gráficos (ficam no app).',
    ],
    limiteInfo:
      'Até {max} PDFs por hora. No celular, o PDF abre no menu de compartilhar do aparelho.',
    previaAria: 'Prévia da página 1 do PDF da comparação',
    nomeArquivo: 'Arquivo: {nome}',
    baixar: 'Baixar PDF',
    gerando: 'Gerando PDF…',
    compartilhar: 'Compartilhar PDF',
    prontoTitulo: 'O PDF está pronto.',
    prontoTexto: 'Toque em Compartilhar PDF para salvar em Arquivos ou enviar.',
    erro: 'Não foi possível gerar o PDF. Tente de novo.',
    tentar: 'Tentar de novo',
    limite:
      'Você gerou {max} PDFs na última hora, o limite por conta. Dá para gerar de novo a partir das {hora}.',
    limiteSemHora:
      'Você gerou {max} PDFs na última hora, o limite por conta. Tente de novo mais tarde.',
    cancelar: 'Cancelar',
    toastPronto: 'PDF pronto: {nome}',
    /** conteúdo do documento (fatia A, montarDocumentoComparacao) */
    documento: {
      marca: 'My Finance',
      origem: 'Análise de Ativos · Comparador',
      tituloAcao: 'Comparação · Ações',
      tituloFii: 'Comparação · FIIs',
      geradoEm: 'Gerado pelo My Finance em {data}',
      pagina: 'página {x} de {y}',
      janela: 'janela de {n} anos',
      fechamento: 'fechamento de {data} · fonte B3',
      semCotacao: 'sem cotação recente',
      colunaCriterio: 'Critério',
      grupoCriterios: 'Critérios de fundamentos · {n} anos',
      atende: '✓',
      naoAtende: '—',
      atendidos: 'Critérios atendidos: {n} de {total}',
      leituraTitulo: 'Leitura dos dados',
      leituraContagens: '{valor} em {n} anos',
      seriesNoApp: 'Séries anuais (receita, lucro, EBITDA, FCL) disponíveis no app.',
      avisoLegalTitulo: 'Aviso importante.',
    },
  },

  /**
   * Mensagens das rotas (fatia A; o hook mostra o `error` do corpo). Ficam aqui para passar pela
   * mesma varredura.
   */
  servidor: {
    listasPessoais: 'As listas são pessoais',
    listaNaoEncontrada: 'Lista não encontrada',
    filtroNaoEncontrado: 'Filtro não encontrado',
    comparacaoNaoEncontrada: 'Comparação não encontrada',
    ativoNaoEncontrado: 'Ativo não encontrado',
    dadosInvalidos: 'Dados inválidos',
    listaRepetida: 'Você já tem uma lista com esse nome.',
    limiteListas: 'Você chegou a {max} listas, o limite por conta.',
    limiteItensLista: 'Esta lista chegou a {max} ativos.',
    limiteItensUsuario: 'Você chegou a {max} ativos salvos na conta.',
    escolherListas: 'Escolha em quais listas salvar.',
    filtroRepetido: 'Já existe um filtro com esse nome.',
    limiteFiltros: 'Você chegou a {max} filtros salvos nesta classe.',
    limiteComparacoes: 'Você chegou a {max} comparações salvas.',
    classesMisturadas: 'Os ativos da comparação precisam ser da mesma classe.',
    alertasDesligados: 'Os alertas não estão disponíveis.',
    limitePdf: 'Você gerou {max} PDFs na última hora, o limite por conta.',
  },
} as const;
