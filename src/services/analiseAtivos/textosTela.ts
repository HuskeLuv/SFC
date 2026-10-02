/**
 * TEXTOS DA TELA da Análise de Ativos — Fase 1. Módulo ÚNICO: toda string nova que a área mostra
 * (casca, Quadro, busca, página do ativo, tese, tela fora do beta) sai daqui. As frases dos
 * critérios/barras continuam em `textos.ts` (TEXTOS_ANALISE, Fase 0) e são reexportadas/usadas aqui.
 *
 * Compliance: o teste (__tests__/textosTela.test.ts) varre TODAS as folhas de TEXTOS_TELA com
 * `encontrarPalavrasProibidas` (regras/comum/linguagem.ts). Nada de "comprar", "recomendação",
 * "barato/caro", "oportunidade"; o indicador é sempre "Índice MF", nunca "nota". O rodapé legal é
 * REEXPORTADO de TEXTOS_ANALISE.rodapeLegal (texto fixo exigido pela spec, fora da varredura).
 *
 * Placeholders `{nome}` são preenchidos com `formatarTexto` (textos.ts). Só os nomes de
 * PLACEHOLDERS_PERMITIDOS são aceitos (o teste confere).
 *
 * Dono: 0a. As fatias A–D usam estes textos; texto novo = PR na 0a (ou acrescentar no fim da
 * seção da própria fatia, sem mexer nas outras chaves).
 */
import { TEXTOS_ANALISE, formatarTexto } from '@/services/analiseAtivos/textos';
import type {
  ClasseQuadro,
  EstadoIndice,
  ForaDoQuadroMotivo,
  MotivoTela,
  TipoSeloEstado,
} from '@/types/analiseAtivosApi';

export { formatarTexto };

/** Rodapé legal (texto fixo, reexportado da Fase 0). */
export const RODAPE_LEGAL: string = TEXTOS_ANALISE.rodapeLegal;

export const PLACEHOLDERS_PERMITIDOS = [
  'ticker',
  'aba',
  'objetivo',
  'data',
  'hora',
  'n',
  'total',
  'max',
  'classe',
  'motivo',
  'ano',
  'valor',
  'pares',
  'atendidos',
  'aplicaveis',
] as const;

export const TEXTOS_TELA = {
  area: {
    titulo: 'Análise de Ativos',
    pilulaBeta: 'Beta',
    subtitulo:
      'Fundamentos de 10 anos, Índice MF e o que você tem na Carteira, lado a lado. Ações e FIIs da B3.',
    voltarQuadro: 'Voltar ao Quadro',
    trilha: 'Análise de Ativos',
  },
  banner: {
    titulo: 'Você está no beta fechado.',
    texto:
      'Dados da CVM e da B3, atualizados todo dia útil depois do fechamento. Se um número parecer errado, conte pra gente pelo Suporte.',
    dispensar: 'Entendi',
    rotuloRegiao: 'Aviso do beta',
  },
  foraDoBeta: {
    pilula: 'Beta fechado',
    titulo: 'A Análise de Ativos ainda está em teste com um grupo pequeno',
    texto:
      'Quando abrir para todos, ela aparece no menu, logo abaixo de Carteira. Enquanto isso, o que você já tem continua no mesmo lugar:',
    itens: {
      carteira: 'sua posição e o objetivo de cada ativo, na Carteira;',
      agenda: 'datas de resultado e de proventos das suas ações, na Agenda;',
      educacao: 'a trilha de investimentos, na Educação.',
    },
    links: {
      carteira: 'Carteira',
      agenda: 'Agenda',
      educacao: 'Educação',
    },
    botao: 'Ir para a Carteira',
  },
  menu: {
    item: 'Análise de Ativos',
    novo: 'NOVO',
  },
  blocos: {
    indice: 'Índice MF',
    criterios: 'Critérios',
    naCarteira: 'Na sua carteira',
    kpis: 'Indicadores',
    graficoAcao: 'Lucro por ação × Cotação',
    graficoFii: 'VP por cota × Cotação',
    dividendosAcao: 'Proventos por ano',
    dividendosFii: 'Rendimento por cota por ano',
    fundamentos: 'Fundamentos · Essencial',
    valuation: 'Valuation · Múltiplos',
    historicos: 'Múltiplos históricos',
    pares: 'Pares do segmento',
    eventos: 'Próximos eventos',
    educacao: 'Aprenda a analisar',
    tese: 'Minha tese',
    frescor: 'Dados',
  },
  indice: {
    nome: TEXTOS_ANALISE.indice.nome,
    formulaRotulo: 'Fórmula pública',
    componentesRotulo: 'Componentes do Índice MF',
    semScore: 'Índice MF não calculado para este fundo nesta data',
    semScoreCurto: 'sem Índice · dados insuficientes',
    foraDoIndice: TEXTOS_ANALISE.indice.foraDoIndice,
    incompletoTitulo: 'O que falta',
    incompletoRodape: 'O número é recalculado quando o dado chegar.',
    zeroRegraTitulo: 'Componente zerado pela regra',
    zeroRegraRodape: 'Índice baixo pela regra, não por falta de dado.',
    zeroRegraComponente: '0 · regra',
    ariaCalculado: 'Índice MF {valor} de 10',
    ariaIncompleto: 'Índice MF incompleto: {valor} de 10',
    ariaZeroRegra: 'Índice MF {valor} de 10, componente zerado pela regra',
    ariaSemScore: 'Índice MF não calculado: dados insuficientes',
    ariaForaDoIndice: 'Fora do Índice MF nesta fase',
    criteriosAtendidos: TEXTOS_ANALISE.indice.leituraSemaforo,
    criterioDesligado: 'Não se aplica · critério desligado até a validação da fonte',
  },
  /** Texto de cada componente zerado pela regra, pelo motivo (sufixo do código). */
  zeroRegra: {
    prejuizo: 'Componente zerado pela regra: prejuízo no último exercício',
    pl_nao_positivo: 'Componente zerado pela regra: patrimônio líquido negativo',
    pl_negativo: 'Componente zerado pela regra: patrimônio líquido negativo',
  },
  /**
   * Motivos de "dados incompletos"/ausente. Códigos compostos 'componente:motivo' têm texto
   * próprio; os demais caem no texto do sufixo (motivosPorSufixo).
   */
  motivos: {
    'div:fonte_defasada': 'proventos em conferência',
    'lucro:fonte_defasada': 'lucro do último exercício em conferência',
    'preco:historico_curto': 'histórico de preço com menos de 5 anos',
    'lucro:sem_dado_fonte': 'lucro sem dado estruturado na CVM',
    'acoes:salto_sem_evento': 'nº de ações em conferência',
    'tipo:indefinido': 'tipo do fundo indefinido pela composição',
    'preco:sem_acoes': 'nº de ações indisponível',
  } as Record<string, string>,
  motivosPorSufixo: {
    fonte_defasada: 'dado em conferência',
    fonte_falhou: 'fonte indisponível no último processamento',
    sem_dado_fonte: 'sem dado estruturado na fonte',
    historico_curto: 'histórico com menos de 5 anos',
    controladora_zero: 'lucro da controladora não informado na fonte',
    sem_preco: 'sem cotação recente',
    sem_acoes: 'nº de ações indisponível',
    sem_data_com: 'proventos sem data-com',
    prejuizo: 'não calculado: prejuízo no último exercício',
    pl_negativo: 'não calculado: patrimônio líquido negativo',
    salto_sem_evento: 'em conferência',
    indefinido: 'indefinido',
    outro: 'dado em conferência',
  } as Record<string, string>,
  /** Valor ausente por campo, quando o motivo pede frase própria. */
  ausentesPorCampo: {
    plPrejuizo: 'P/L não calculado: prejuízo no último exercício',
    dyEmConferencia: 'proventos em conferência',
    dyRendimentoParado: 'rendimento parado',
    semDado: 'sem dado',
  },
  naoSeAplica: {
    curto: 'n/a',
    ...TEXTOS_ANALISE.motivosNaoSeAplica,
  },
  foraDoQuadro: {
    rotulo: 'fora do Quadro',
    sem_negociacao_30: 'sem negociação nos últimos 30 pregões',
    fiagro: 'Fiagro fica fora do Quadro nesta fase',
    comMotivo: 'fora do Quadro · {motivo}',
  },
  selosEstado: {
    criterios_provisorios: TEXTOS_ANALISE.selos.criteriosProvisorios,
    data_estimada: TEXTOS_ANALISE.selos.dataEstimada,
    proventos_em_conferencia: TEXTOS_ANALISE.selos.proventosEmRevisao,
    sem_negociacao_recente: 'sem negociação recente',
    baixa_liquidez: TEXTOS_ANALISE.selos.baixaLiquidez,
    planejado: 'Planejado',
    na_carteira: 'Na carteira',
  } satisfies Record<TipoSeloEstado, string>,
  selos: {
    dadosIncompletos: TEXTOS_ANALISE.selos.dadosIncompletos,
    fonteCvm: TEXTOS_ANALISE.selos.fonteCvm,
    fonteCvmCurto: 'fonte CVM',
    emConferencia: 'em conferência',
  },
  acoes: {
    registrar: 'Registrar operação',
    planejar: 'Planejar na Carteira',
    verNaCarteira: 'Ver na Carteira',
    ajustarAlvo: 'Ajustar alvo',
    editarObjetivo: 'Editar objetivo',
  },
  naCarteira: {
    voceNaoTem:
      'Você não tem {ticker}. Planeje o ativo para ver na Carteira quanto falta para um objetivo, ou registre uma operação que já fez.',
    naAba: 'Na aba {aba}',
    planejadoEm: 'Planejado em {aba}, com objetivo de {objetivo}% da aba',
    valorPelaCarteira: 'Valor e % calculados pela Carteira com o fechamento de {data}',
    pesoNaAba: 'Peso dentro de {aba}',
    objetivoAtivo: 'objetivo do ativo',
    classeNoPlanejamento: '{aba} no Planejamento',
    alvoClasse: 'alvo',
    quantoFalta: 'Quanto falta',
    quantidade: 'Quantidade',
    valor: 'Valor',
    pctCarteira: '% da carteira',
    precoMedio: 'Preço médio',
    resultado: 'Resultado',
    resultadoNota: 'sem proventos, igual à Carteira',
  },
  tese: {
    privada: 'Privada: só você vê',
    pessoal: 'A tese é pessoal de cada usuário',
    pessoalConsultor:
      'Enquanto você age pela carteira de um cliente, a tese dele não aparece e você não pode escrever por ele. Para anotar a sua, saia do modo consultor.',
    perguntas:
      'Por que você tem (ou não) este ativo? O que acompanharia? O que faria você mudar de ideia? Escrever ajuda a decidir com calma.',
    escrever: 'Escrever minha tese',
    rotuloCampo: 'Sua tese sobre {ticker}',
    editar: 'Editar',
    apagar: 'Apagar tese',
    salvando: 'Salvando…',
    salvoAs: 'Salvo às {hora}',
    salvoEm: 'Salvo em {data} às {hora}',
    pendente: 'Alterações ainda não salvas',
    erro: 'Não foi possível salvar. Seu texto continua aqui.',
    tentarNovamente: 'Tentar de novo',
    contador: '{n} de {max} caracteres',
    limite: 'Limite de {max} caracteres',
  },
  quadro: {
    rotulo: 'Quadro',
    abas: { acao: 'Ações', fii: 'FIIs' } satisfies Record<ClasseQuadro, string>,
    modos: { resumo: 'Resumo', detalhado: 'Detalhado' },
    ordem: 'Ordem',
    ordenarPor: 'Ordenar por {valor}',
    ordenadoPor: 'ordenado por {valor}',
    filtros: {
      lucroConsistente: 'Lucro 5+ anos seguidos',
      dyMinAcao: 'DY 12m ≥ 4%',
      dyMinFii: 'DY 12m ≥ 8%',
      pvpMax: 'P/VP ≤ 1',
      tijolo: 'Tijolo',
      papel: 'Papel',
      naCarteira: 'Na minha carteira',
      somenteCompletos: 'Só dados completos',
      setor: 'Setor',
      segmento: 'Segmento',
      semSetor: 'sem setor',
    },
    mostrando: 'Mostrando {n} de {total}',
    mostrarMais: 'Mostrar mais 25',
    carregando: 'Carregando o Quadro',
    vazioFiltro: 'Nenhum ativo com esses filtros',
    limparFiltros: 'Limpar filtros',
    semPosicaoAcao: 'Você ainda não tem ações na Carteira',
    semPosicaoFii: 'Você ainda não tem FIIs na Carteira',
    erro: 'Não foi possível carregar o Quadro. Os filtros continuam como estavam.',
    tentarNovamente: 'Tentar de novo',
    frescorAtrasado: 'Cotações com atualização em atraso',
    colunas: {
      ativo: 'Ativo',
      fundo: 'Fundo',
      preco: 'Preço',
      cota: 'Cota',
      tipo: 'Tipo',
      lucrosSeguidos: 'Lucros seguidos',
      roe: 'ROE',
      pl: 'P/L',
      pvp: 'P/VP',
      dy12m: 'DY 12m',
      lucro10a: 'Lucro 10 anos',
      rendimento10a: 'Rendimento 10 anos',
      indiceMf: 'Índice MF',
      naCarteira: 'Na carteira',
      setor: 'Setor',
      segmento: 'Segmento',
      margemLiquida: 'Margem líquida',
      divLiqEbitda: 'Dív.líq./EBITDA',
      payout: 'Payout',
      liquidez21: 'Liquidez média 21d',
      obrigacoesPl: 'Obrigações/PL',
      patrimonio: 'Patrimônio',
      cotistas: 'Cotistas',
      vacanciaCvm: 'Vacância (CVM)',
      imoveisCris: 'Imóveis/CRIs (CVM)',
      mesesRendimento: 'Meses com rendimento',
      valorMercado: 'Valor de mercado',
    },
    anos: '{n} anos',
    planejadoPct: 'Planejado · {valor}%',
    // ---- acréscimos da fatia A (Quadro) ----
    abasRotulo: 'Classe de ativo',
    filtrosRotulo: 'Filtros',
    modosRotulo: 'Colunas',
    tipos: {
      tijolo: 'Tijolo',
      papel: 'Papel',
      hibrido: 'Híbrido',
      fof: 'Fundo de fundos',
      indefinido: 'Indefinido',
    },
    ordemBotao: 'Ordem: {valor}',
    maiorPrimeiro: 'maior primeiro',
    menorPrimeiro: 'menor primeiro',
    maiorPrimeiroBotao: 'Maior primeiro',
    menorPrimeiroBotao: 'Menor primeiro',
    padraoMaior: 'maior primeiro por padrão',
    padraoMenor: 'menor primeiro por padrão',
    ordenarTitulo: 'Ordenar {classe}',
    direcao: 'Direção',
    semDadoNoFim: 'Ativos sem dado para a ordem escolhida ficam no fim da lista.',
    verResultado: 'Ver resultado',
    legenda: 'Quadro de {classe}, ordenado por {valor}',
    ordenadoAnuncio: 'Ordenado por {valor}',
    contagemOrdem: '{n} de {total} · ordenado por {valor}',
    classesMinusculas: { acao: 'ações', fii: 'FIIs' },
    vazioFiltroTexto: 'Tire um filtro para ver mais ativos.',
    semPosicaoTexto:
      'Registre uma operação ou planeje um ativo para ele aparecer aqui com a sua posição.',
    erroTitulo: 'Não foi possível carregar o Quadro agora',
    setorTodos: 'Todos',
    aplicar: 'Aplicar',
    fechar: 'Fechar',
    formulaRotulo: 'Índice MF',
    formulaTexto: '(0 a 10), indicador quantitativo de fórmula pública:',
    formula:
      '0,35 × lucro + 0,20 × dívida + 0,20 × rentabilidade + 0,15 × proventos + 0,10 × preço',
    formulaNota:
      'Critério que não se aplica sai da conta e o peso dele é redistribuído. Dado ausente conta zero e o ativo ganha o selo “dados incompletos”.',
    cotacoesDe: 'Cotações: COTAHIST B3 de {data}',
    posicaoAcoes: '{n} ações · {valor}%',
    posicaoCotas: '{n} cotas · {valor}%',
    posicaoSemPct: '{n} na carteira',
    naoTem: 'Não tem',
    serieLucroAria: 'Lucro em {n} de {total} anos com dado',
    serieRendAria: 'Rendimento por cota: {n} de {total} anos com rendimento',
    semSerie: 'sem histórico anual',
    carregandoMais: 'Carregando mais',
  },
  busca: {
    rotulo: 'Buscar ativo',
    placeholder: 'Buscar ação ou FII por ticker ou nome',
    atalho: 'Pressione / para buscar',
    semResultado: 'A busca cobre ações e FIIs da B3, por ticker ou nome',
    grupos: { acao: 'Ações', fii: 'FIIs' } satisfies Record<ClasseQuadro, string>,
    recentes: 'Buscas recentes',
    fechar: 'Fechar busca',
    // ---- acréscimos da fatia A (busca) ----
    nenhumResultado: 'Nenhum ativo encontrado para “{valor}”',
    instrucoes: '↑ ↓ para escolher · Enter abre · Esc fecha',
    sugestoes: 'Sugestões',
    indiceCurto: 'Índice {valor}',
    dicaCelular: 'Busque por ticker (WEGE3) ou nome (WEG).',
    abrir: 'Buscar ativo',
    carregando: 'Carregando a busca',
  },
  ativo: {
    carregando: 'Carregando o ativo',
    naoEncontrado: 'Ativo não encontrado na Análise de Ativos',
    naoEncontradoTexto: 'A área cobre ações e FIIs da B3 com cadastro na CVM. Confira o ticker.',
    erro: 'Não foi possível carregar este ativo.',
    tentarNovamente: 'Tentar de novo',
    fechamento: 'fechamento de {data} · fonte B3',
    semNegociacao: 'sem negociação nos últimos 30 pregões',
    historicoInsuficiente: 'histórico insuficiente para o gráfico',
    verDadosTabela: 'Ver dados em tabela',
    verGrafico: 'Ver gráfico',
    ult12m: 'últ. 12m',
    ult12mTabela: 'Últ. 12m',
    anoParcial: '{ano} entra quando o ano terminar; os últimos 12 meses estão no DY 12m',
    lacunaPrejuizo: 'prejuízo no ano: ponto fora do gráfico',
    cagrForaConferencia: 'anos em conferência ficam fora do crescimento anual',
    cagr5a: 'crescimento anual em 5 anos',
    semEventos: 'Sem eventos programados nos próximos meses',
    semEventosFii:
      'Sem eventos programados nos próximos meses. Para FIIs, aparecem aqui as datas-com já anunciadas pelo fundo.',
    notaAgenda: 'Eventos de ativos da sua carteira aparecem na Agenda',
    semPares: 'sem pares no mesmo segmento',
    criterioParesAcao: 'mesmo segmento B3 (completado pelo subsetor)',
    criterioParesFii: 'mesmo segmento CVM e tipo',
    referenciaPares: 'mediana de {pares} pares',
    semReferenciaPares: 'sem referência de pares',
    barraOculta: 'histórico com menos de 5 anos · barra oculta',
    frescorAtrasado: 'atualização em atraso',
    unidadeFundamentos: 'Valores em R$ mi · ano fiscal · fonte: CVM',
    anoIncompletoFii: 'ano com menos de 4 trimestres informados',
  },
  eventos: {
    resultado: 'Resultado {valor}',
    resultadoEstimado: 'Resultado {valor} (data estimada)',
    resultadoEstimadoDescricao: 'Pelo histórico de divulgação da companhia',
    assembleia: 'Assembleia {valor}',
    dataCom: 'Data-com {valor}',
  },
  educacao: {
    acao: {
      titulo: 'Aprenda a analisar ações',
      descricao: 'Trilha de investimentos da Educação',
    },
    fii: {
      titulo: 'Aprenda a analisar FIIs',
      descricao: 'Trilha de investimentos da Educação',
    },
  } satisfies Record<ClasseQuadro, { titulo: string; descricao: string }>,
  /** Definição + referência usual de cada múltiplo (Valuation e KPIs). Factual, sem juízo. */
  leituras: {
    pl: {
      definicao: 'Preço da ação dividido pelo lucro por ação dos últimos 12 meses.',
      referencia: 'Comparado com a mediana dos pares e com a média de 10 anos do próprio ativo.',
    },
    pvp: {
      definicao: 'Preço dividido pelo valor patrimonial por ação (ou por cota).',
      referencia: 'Comparado com a mediana dos pares e com a média de 10 anos do próprio ativo.',
    },
    pReceita: {
      definicao: 'Valor de mercado dividido pela receita dos últimos 12 meses.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    evEbitda: {
      definicao: 'Valor da firma (mercado + dívida líquida) dividido pelo EBITDA de 12 meses.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    pFco: {
      definicao: 'Valor de mercado dividido pelo fluxo de caixa operacional de 12 meses.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    pFcl: {
      definicao: 'Valor de mercado dividido pelo fluxo de caixa livre de 12 meses.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    lpa: {
      definicao: 'Lucro dos últimos 12 meses dividido pelo número de ações.',
      referencia: 'Série anual na base de ações de hoje (ajustada por desdobramentos).',
    },
    vpa: {
      definicao: 'Patrimônio líquido dividido pelo número de ações.',
      referencia: 'Série anual na base de ações de hoje (ajustada por desdobramentos).',
    },
    dpa12m: {
      definicao: 'Proventos por ação com data-com nos últimos 12 meses.',
      referencia: 'Dividendos e JCP declarados; não inclui valores estimados.',
    },
    dy12m: {
      definicao: 'Proventos dos últimos 12 meses divididos pelo preço atual.',
      referencia: 'Comparado com a mediana dos pares e com a média de 5 anos.',
    },
    dyMedio5a: {
      definicao: 'Média do dividend yield anual dos últimos 5 anos fechados.',
      referencia: 'Anos em conferência ficam fora da média.',
    },
    payout: {
      definicao: 'Parte do lucro distribuída como proventos.',
      referencia: 'Acima de 100% indica distribuição maior que o lucro do período.',
    },
    margemLiquida: {
      definicao: 'Lucro líquido dividido pela receita.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    roe: {
      definicao: 'Lucro dividido pelo patrimônio líquido.',
      referencia: 'Comparado com a mediana dos pares e com a referência do critério.',
    },
    roa: {
      definicao: 'Lucro dividido pelo ativo total.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    roic: {
      definicao: 'Retorno operacional sobre o capital investido.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    divLiqEbitda: {
      definicao: 'Dívida líquida dividida pelo EBITDA de 12 meses.',
      referencia: 'Valor negativo indica caixa líquido. Não se aplica a bancos.',
    },
    divLiqPl: {
      definicao: 'Dívida líquida dividida pelo patrimônio líquido.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    liquidezCorrente: {
      definicao: 'Ativo circulante dividido pelo passivo circulante.',
      referencia: 'Comparado com a mediana dos pares.',
    },
    cagr: {
      definicao: 'Crescimento anual composto entre o primeiro e o último ano fechado da janela.',
      referencia:
        'Não calculado quando algum dos extremos é zero, negativo ou está em conferência.',
    },
    vpCota: {
      definicao: 'Patrimônio líquido do fundo dividido pelo número de cotas.',
      referencia: 'Fonte CVM (informe mensal).',
    },
    rendCota12m: {
      definicao: 'Rendimentos por cota com data-com nos últimos 12 meses.',
      referencia: 'Não inclui valores estimados.',
    },
    vacanciaCvm: {
      definicao: 'Área vaga sobre a área total dos imóveis, informada à CVM.',
      referencia: 'Fonte CVM · pode diferir do relatório do gestor.',
    },
    obrigacoesPl: {
      definicao: 'Obrigações do fundo (aquisição de imóveis, securitização) sobre o patrimônio.',
      referencia: 'Comparado com a mediana dos pares e com a referência do critério.',
    },
    taxaAdm: {
      definicao: 'Taxa de administração mensal informada à CVM.',
      referencia: 'Comparada com a mediana dos pares.',
    },
    liquidez21: {
      definicao: 'Média do volume financeiro diário nos últimos 21 pregões.',
      referencia: 'Menos de 15 pregões com negócio em 21 = baixa liquidez.',
    },
    cotistas: {
      definicao: 'Número de cotistas informado no último informe mensal.',
      referencia: 'Fonte CVM.',
    },
  },
  formato: {
    semDado: '—',
    naoSeAplica: 'n/a',
  },
  /** Componentes visuais comuns (fatia 0b): barras, selos e banner. */
  comum: {
    barras: {
      resumoLucro: 'Lucro em {n} de {total} anos com dado',
      resumoRendimento: 'Rendimento por cota em {n} de {total} anos com dado',
      prejuizoEm: 'prejuízo em {n}',
      semDadoEm: 'sem dado em {n}',
      emConferenciaEm: 'em conferência em {n}',
      semSerie: 'Sem histórico anual',
      anoValor: '{ano}: {valor}',
      anoPrejuizo: '{ano}: prejuízo de {valor}',
      anoSemDado: '{ano}: sem dado',
      anoEmConferencia: '{ano}: {valor}, em conferência',
      seguidosAria: '{n} anos seguidos de lucro',
      seguidosUmAria: '1 ano seguido de lucro',
      seguidosNenhumAria: 'Nenhum ano seguido de lucro',
      seguidosSemDadoAria: 'Anos seguidos de lucro: sem dado',
      umAno: '1 ano',
      nenhum: 'nenhum',
    },
    seloIncompleto: {
      abrir: 'Ver o que falta',
      tituloComTicker: 'O que falta em {ticker}',
    },
    banner: {
      /** palavra do texto do banner que vira link (TEXTOS_TELA.banner.texto) */
      suporte: 'Suporte',
    },
  },
} as const;

/** Texto legível de um código de motivo ('div:fonte_defasada', 'sem_dado_fonte', 'prejuizo'...). */
export function textoMotivo(codigo: string): string {
  const exato = TEXTOS_TELA.motivos[codigo];
  if (exato) return exato;
  const sufixo = codigo.includes(':') ? codigo.slice(codigo.lastIndexOf(':') + 1) : codigo;
  return TEXTOS_TELA.motivosPorSufixo[sufixo] ?? TEXTOS_TELA.motivosPorSufixo.outro;
}

export function motivoTela(codigo: string): MotivoTela {
  return { codigo, texto: textoMotivo(codigo) };
}

/** Texto de um componente zerado pela regra ('lucro:prejuizo', 'preco:pl_negativo'...). */
export function textoZeroRegra(codigo: string): string {
  const sufixo = codigo.includes(':') ? codigo.slice(codigo.lastIndexOf(':') + 1) : codigo;
  const mapa: Record<string, string> = TEXTOS_TELA.zeroRegra;
  return mapa[sufixo] ?? TEXTOS_TELA.indice.zeroRegraTitulo;
}

/** Texto de um motivo de "não se aplica" ('financeira', 'papel_sem_imoveis'...). */
export function textoNaoSeAplica(motivo: string): string {
  const mapa: Record<string, string> = TEXTOS_TELA.naoSeAplica;
  return mapa[motivo] ?? TEXTOS_TELA.naoSeAplica.fora_do_escopo;
}

export function textoForaDoQuadro(motivo: ForaDoQuadroMotivo): string {
  return TEXTOS_TELA.foraDoQuadro[motivo];
}

/** Motivo único dos estados sem número (sem_score / fora_do_indice); [] nos demais. */
export function motivosEstadoIndice(estado: EstadoIndice): MotivoTela[] {
  if (estado === 'sem_score') return [{ codigo: 'sem_score', texto: TEXTOS_TELA.indice.semScore }];
  if (estado === 'fora_do_indice') {
    return [{ codigo: 'fora_do_indice', texto: TEXTOS_TELA.indice.foraDoIndice }];
  }
  return [];
}

export function textoSeloEstado(tipo: TipoSeloEstado): string {
  return TEXTOS_TELA.selosEstado[tipo];
}
