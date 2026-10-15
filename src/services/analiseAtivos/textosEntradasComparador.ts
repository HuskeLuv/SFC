/**
 * Textos das entradas do Comparador (Bloco D, fatia D): pílulas Quadro | Comparador e modo
 * Comparar do Quadro (caixas + bandeja). O "Comparar" do cabeçalho do ativo é o da BarraAcoesAtivo
 * (textosAcoesCarteira). Passa pela varredura linguagemV2 da v2.4 (textosComparador.test.ts).
 *
 * A bandeja abre o Comparador a partir de 1 ativo (com 1, o Comparador diz
 * "adicione mais um ativo para ver os dados lado a lado"); todo controle com 44px.
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
  paginaComparador: {
    titulo: 'Comparador',
    subtitulo: 'Compare até 4 ativos da mesma classe, critério por critério.',
  },
} as const;
