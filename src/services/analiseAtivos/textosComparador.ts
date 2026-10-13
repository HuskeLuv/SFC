/**
 * Textos do Comparador (v2.4, fatia D — Comparador isonômico). Os textos jurídicos literais
 * (instrução da barra e "Leitura dos dados") NÃO ficam aqui: vêm de textosLiterais.ts e vão para a
 * tela com data-texto-legal. Os rótulos dos critérios vêm de criteria_params; frases de critério,
 * marcas e contadores, de textosCriterios.ts.
 *
 * Compliance (spec v2.4 §3.3/§9, D1): sem ★, sem marca de valor "mais favorável", sem placar, sem
 * ranking e sem Índice MF. Os grupos de indicadores mostram os números lado a lado, todos com o
 * mesmo peso visual. Toda folha passa pela varredura linguagemV2 (textosComparador.test.ts).
 *
 * `busca.*` também é usado pela BuscaAtivos (chaves estáveis). `resumo.*` só existe para o
 * ResumoNumerico.tsx, que a fatia F remove (a tela não o usa mais).
 */
export const TEXTOS_COMPARADOR = {
  titulo: 'Comparador',
  subtitulo: 'Compare até 4 ativos da mesma classe, critério por critério.',
  abas: { rotulo: 'Classe dos ativos', acao: 'Ações', fii: 'FIIs' },
  slots: {
    rotulo: 'Ativos na comparação',
    adicionarAcao: 'Adicionar ação',
    adicionarFii: 'Adicionar FII',
    contagem: '({n} de {max})',
    vagas: '{n} de {max} vagas',
    remover: 'Remover {ticker} da comparação',
    cotacao: 'Cotação',
    sugestoes: 'Do mesmo segmento',
    limite: 'Limite de {max} ativos. Remova um para incluir outro.',
    abrirAtivo: 'Abrir a página de {ticker}',
  },
  busca: {
    placeholderAcao: 'Buscar ação para comparar',
    placeholderFii: 'Buscar FII para comparar',
    nenhum: 'Nenhum ativo encontrado.',
    soAcoes: 'O comparador mostra ativos da mesma classe: só ações.',
    soFiis: 'O comparador mostra ativos da mesma classe: só FIIs.',
    jaIncluido: 'já está na comparação',
    outraClasse: 'outra classe',
    outraClasseFii: 'FII: outra classe',
    outraClasseAcao: 'ação: outra classe',
    cheio: 'Você já escolheu {max} ativos',
    fechar: 'Fechar',
  },
  vazio: {
    titulo: 'Escolha o que comparar',
    textoAcao:
      'Adicione de 2 a 4 ações. A tabela mostra os critérios de fundamentos e os indicadores de cada uma, lado a lado.',
    textoFii:
      'Adicione de 2 a 4 FIIs. A tabela mostra os critérios de fundamentos e os indicadores de cada um, lado a lado.',
    daCarteira: 'Da sua carteira:',
    outrasEntradas:
      'Também dá para comparar a partir do Quadro (botão Comparar) ou da página de um ativo.',
  },
  umAtivo: 'Adicione mais um ativo para ver os dados lado a lado.',
  ignorados: {
    outra_classe:
      '{ticker} ficou de fora: o comparador mostra ativos da mesma classe. Para comparar {classe}, use a aba {aba}.',
    inexistente: '{ticker} não foi encontrado e ficou de fora.',
    excesso: '{ticker} ficou de fora: o limite é de {max} ativos.',
    formato: '“{valor}” não é um ticker válido e ficou de fora.',
    classes: { acao: 'ações', fii: 'FIIs' },
  },
  /** aviso do misto (tijolo + papel), detectado pelo perfil de critérios */
  misto: {
    titulo: 'Você está comparando FIIs de tijolo com FIIs de papel.',
    texto:
      'Os critérios de qualidade são diferentes: imóveis (vacância, nº de imóveis) vs. crédito (LTV, inadimplência). Obrigações/PL fica num grupo comum. A tabela mostra os dois grupos e marca “n/a” onde o critério não se aplica — para uma comparação justa, compare fundos do mesmo tipo.',
  },
  /** seletor Tijolo | Papel (só em FIIs): deixa na comparação só os fundos do tipo escolhido */
  tipoFii: {
    rotulo: 'Tipo de FII',
    tijolo: 'Tijolo',
    papel: 'Papel',
    dica: 'Mantém na comparação só os FIIs do tipo escolhido.',
  },
  janela: {
    rotulo: 'Janela de anos dos critérios',
  },
  criterios: {
    /** linha de fechamento do bloco ('Critérios atendidos' + 'n de k' em cada coluna) */
    atendidos: 'Critérios atendidos',
    semAvaliacao: 'sem avaliação',
    semAvaliacaoTexto: 'sem avaliação nesta janela',
    naoAtendePrefixo: 'não atende · {fato}',
  },
  leitura: {
    titulo: 'Leitura dos dados',
    separador: ' · ',
  },
  celula: {
    naoSeAplica: 'n/a',
    semDado: '—',
    emConferencia: 'em conferência',
    fonteCvm: 'fonte CVM',
  },
  tabela: {
    rotuloRegiao: 'Comparação, role para o lado',
    caption: 'Comparação de {valor}: critérios de fundamentos e indicadores, lado a lado.',
    colunaCriterio: 'Critério',
  },
  grupos: {
    qualidade: 'Qualidade',
    endividamento: 'Endividamento',
    preco: 'Preço',
    dividendos: 'Dividendos',
    naCarteira: 'Na minha carteira',
    renda: 'Renda',
    endividamentoFii: 'Endividamento · fonte CVM',
    imoveis: 'Qualidade dos imóveis · fonte CVM',
    imoveisMisto: 'Qualidade dos imóveis (tijolo) · fonte CVM',
    ativosPapel: 'Qualidade dos ativos da carteira · fonte CVM',
    ativosPapelMisto: 'Qualidade dos ativos da carteira (papel) · fonte CVM',
    tamanhoLiquidez: 'Tamanho e liquidez',
  },
  linhas: {
    cotacao: { rotulo: 'Cotação', sub: '' },
    lucrosSeguidos: { rotulo: 'Lucros seguidos', sub: 'anos fechados' },
    roe: { rotulo: 'ROE', sub: '12 meses' },
    margemLiquida: { rotulo: 'Margem líquida', sub: '12 meses' },
    divLiqEbitda: { rotulo: 'Dív. líq./EBITDA', sub: 'negativo = caixa líquido' },
    divLiqPl: { rotulo: 'Dív. líq./PL', sub: '' },
    pl: { rotulo: 'P/L', sub: 'cotação ÷ LPA 12m' },
    pvp: { rotulo: 'P/VP', sub: '' },
    pvpFii: { rotulo: 'P/VP', sub: 'cotação ÷ VP por cota' },
    pReceita: { rotulo: 'P/Receita', sub: 'valor de mercado ÷ receita 12m' },
    dy12m: { rotulo: 'DY 12m', sub: '' },
    payout: { rotulo: 'Payout', sub: 'proventos ÷ lucro' },
    naCarteira: { rotulo: 'Posição', sub: 'quantidade · peso' },
    rendimentoCota: { rotulo: 'Rendimento 12m por cota (R$)', sub: '' },
    mesesComRendimento: { rotulo: 'Meses seguidos com rendimento', sub: '' },
    vpCota: { rotulo: 'VP por cota (R$)', sub: '' },
    obrigacoesPl: { rotulo: 'Obrigações/PL', sub: 'passivo menos rendimentos a distribuir' },
    vacanciaFisica: {
      rotulo: 'Vacância física (CVM)',
      sub: 'pode diferir do relatório do gestor',
    },
    nImoveis: { rotulo: 'Nº de imóveis (CVM)', sub: 'imóveis para renda' },
    areaInformada: { rotulo: 'Área (CVM)', sub: 'mil m² · não é ABL' },
    nCri: { rotulo: 'Nº de CRIs (CVM)', sub: '' },
    patrimonio: { rotulo: 'Patrimônio', sub: '' },
    cotistas: { rotulo: 'Cotistas', sub: '' },
    liquidez21: { rotulo: 'Liquidez média 21 pregões', sub: '' },
    semNegociacao: 'sem negociação recente',
  },
  graficos: {
    tituloAcao: 'Lucro líquido em 10 anos',
    tituloFii: 'VP por cota desde {ano}',
    legenda: 'Base 100, mesma escala em todos',
    rotuloAcao: 'Lucro líquido · base 100',
    rotuloFii: 'VP por cota · base 100',
    escala: 'Base 100 em {ano}. Mesma escala nos {n} gráficos ({valor} a {max}).',
    srSerie: '{ticker}: de 100 para {valor}',
    srSemSerie: '{ticker}: sem série',
    insuficiente: 'histórico insuficiente',
    rotuloLinha: 'Base 100',
    subLinha: 'mesma escala em todos',
  },
  /** só para o ResumoNumerico.tsx (removido na F); a tela usa "Leitura dos dados" */
  resumo: {
    titulo: 'Resumo numérico',
    criterios: 'Critérios atendidos: {valor}',
    criteriosItem: '{ticker} {atendidos} de {aplicaveis}',
    emConferencia: 'Em conferência: {valor}',
    emConferenciaItem: '{ticker} ({campo})',
    responsabilidade: 'Os dados aparecem lado a lado e não indicam qual ativo escolher.',
  },
  acoes: {
    copiarLink: 'Copiar link',
    copiarLinkComparacao: 'Copiar link da comparação',
    linkCopiado: 'Link copiado',
    erroCopiar: 'Não foi possível copiar o link.',
  },
  estados: {
    carregando: 'Carregando: Comparador',
    erro: 'Não foi possível carregar a comparação.',
    erroAtivo: 'Não foi possível carregar {ticker}',
    tentarNovamente: 'Tentar de novo',
  },
} as const;
