/**
 * Textos das entradas do Comparador (Bloco D, fatia D): pílulas Quadro | Comparador, modo
 * Comparar do Quadro (caixas + bandeja) e botão "Comparar" no cabeçalho do ativo. Esqueleto da
 * fatia 0; a fatia D pode ACRESCENTAR chaves. Passa pela varredura do Bloco D.
 *
 * Decisão 13: a bandeja e o botão do cabeçalho abrem o Comparador a partir de 1 ativo (com 1, o
 * Comparador diz "adicione mais um para ver destaques"); todo controle com 44px.
 */
export const TEXTOS_ENTRADAS_COMPARADOR = {
  pilulas: {
    rotulo: 'Páginas da Análise de Ativos',
    quadro: 'Quadro',
    comparador: 'Comparador',
  },
  quadro: {
    botao: 'Comparar',
    botaoSair: 'Sair do modo comparar',
    colunaCaixa: 'Comparar',
    caixa: 'Comparar {ticker}',
    caixaDesabilitada: 'Limite de {max} ativos: desmarque um para incluir outro.',
    /** cartão do celular: motivo visível ao lado da caixa desabilitada */
    caixaLimite: 'Limite de {max} atingido',
  },
  bandeja: {
    rotulo: 'Seleção para comparar',
    contagem: '{n} de {max} selecionados',
    instrucaoAcao: 'marque de 1 a {max} ações',
    instrucaoFii: 'marque de 1 a {max} FIIs',
    limiteAtingido: 'limite atingido',
    comparar: 'Comparar',
    compararN: 'Comparar {n}',
    limpar: 'Limpar',
    anuncio: '{n} de {max} selecionados: {valor}',
    /** link da bandeja (nome acessível com os tickers) */
    compararAria: 'Comparar {valor}',
  },
  cabecalhoAtivo: {
    botao: 'Comparar',
    aria: 'Comparar {ticker} com outros ativos',
  },
  paginaComparador: {
    titulo: 'Comparador',
    subtitulo: 'Compare até 4 ativos da mesma classe, critério por critério.',
  },
} as const;
