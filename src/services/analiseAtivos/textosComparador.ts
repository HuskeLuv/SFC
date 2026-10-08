/**
 * Textos do Comparador (Bloco D, fatia C). Esqueleto da fatia 0 com TODOS os textos da spec e do
 * protótipo final; a fatia C pode ACRESCENTAR chaves (sem renomear as existentes). Passa pela
 * varredura do Bloco D (textosBlocoD.test.ts). Vai ao jurídico antes de ligar os Cenários
 * (decisão 15), junto com o Resumo numérico.
 *
 * ★ = "valor numericamente mais favorável" no critério, nunca "melhor"; sempre com o texto
 * "destaque". Decisões refletidas: D9 (Resumo SEM placar: Índice na ordem dos slots, * no
 * incompleto, critérios atendidos, frase de responsabilidade; nada de contar ★ nem "X tem o
 * maior"), D10 (imóveis da CVM com "fonte CVM" e sem ★), D11 (payout neutro), D12 (até 4 ativos;
 * tijolo + papel com aviso e n/a; ação + FII recusado; sem "Salvar comparação" nem PDF).
 * O rodapé legal é o RODAPE_LEGAL da casca (fora deste objeto).
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
      'Adicione de 2 a 4 ações. A tabela mostra cada critério lado a lado e marca com ★ o valor numericamente mais favorável.',
    textoFii:
      'Adicione de 2 a 4 FIIs. A tabela mostra cada critério lado a lado e marca com ★ o valor numericamente mais favorável.',
    daCarteira: 'Da sua carteira:',
    outrasEntradas:
      'Também dá para comparar a partir do Quadro (botão Comparar) ou da página de um ativo.',
  },
  umAtivo: 'Adicione mais um ativo para ver os destaques.',
  ignorados: {
    outra_classe:
      '{ticker} ficou de fora: o comparador mostra ativos da mesma classe. Para comparar {classe}, use a aba {aba}.',
    inexistente: '{ticker} não foi encontrado e ficou de fora.',
    excesso: '{ticker} ficou de fora: o limite é de {max} ativos.',
    formato: '“{valor}” não é um ticker válido e ficou de fora.',
    // acréscimo da fatia C: {classe} do texto de outra_classe
    classes: { acao: 'ações', fii: 'FIIs' },
  },
  misto:
    'Você está comparando FIIs de tijolo com FIIs de papel. Os critérios de qualidade são diferentes: o que não se aplica a um tipo aparece como “n/a”.',
  destaque: {
    rotulo: 'destaque',
    srOnly: 'destaque: valor numericamente mais favorável',
    legenda:
      '★ marca o valor numericamente mais favorável em cada critério, entre os ativos com dado. Não indica qual ativo escolher.',
    // acréscimo da fatia C: legenda curta do celular
    legendaCurta: '★ = valor numericamente mais favorável no critério.',
    // celular: o chip dos cartões é só a lupa tracejada (colunas estreitas)
    legendaConferenciaCurta: 'Lupa tracejada = valor em conferência (fora do ★).',
    regras: '★ só com 2 ou mais valores e sem empate; valores em conferência ficam fora do ★.',
    regrasFii:
      'Dados de imóveis da CVM não recebem ★ até a validação com os relatórios dos gestores.',
    semDestaqueAcao: 'Sem ★: cotação, payout, valor de mercado, liquidez e Índice MF.',
    semDestaqueFii:
      'Sem ★: cotação, rendimento por cota, VP por cota, patrimônio, cotistas, liquidez e Índice MF.',
  },
  semDestaque: {
    menos_de_2: 'sem destaque: menos de 2 valores',
    empate: 'sem destaque: empate',
    neutro: 'sem destaque: não tem direção',
    tipos_diferentes: 'tipos diferentes: sem destaque',
    sem_validacao_cvm: 'sem destaque até a validação',
  },
  celula: {
    naoSeAplica: 'n/a',
    semDado: '—',
    emConferencia: 'em conferência',
    fonteCvm: 'fonte CVM',
    criterioProvisorio: 'critério provisório',
    plNaoPositivo: 'P/L ≤ 0: fora do destaque',
    indiceIncompleto: 'incompleto',
  },
  tabela: {
    rotuloRegiao: 'Comparação, role para o lado',
    caption: 'Comparação de {valor}. ★ = valor numericamente mais favorável no critério.',
    colunaCriterio: 'Critério',
  },
  grupos: {
    indice: 'Índice MF',
    qualidade: 'Qualidade',
    endividamento: 'Endividamento',
    preco: 'Preço',
    dividendos: 'Dividendos',
    tamanhoLiquidez: 'Tamanho e liquidez',
    naCarteira: 'Na carteira',
    renda: 'Renda',
    imoveis: 'Qualidade dos imóveis (fonte CVM)',
    cris: 'Qualidade da carteira de CRIs (fonte CVM)',
    alavancagem: 'Alavancagem',
    historico: 'Histórico',
  },
  linhas: {
    indice: { rotulo: 'Índice MF', sub: '{atendidos} de {aplicaveis} critérios' },
    cotacao: { rotulo: 'Cotação', sub: '' },
    lucrosSeguidos: { rotulo: 'Lucros seguidos', sub: 'anos fechados' },
    roe: { rotulo: 'ROE', sub: '12 meses' },
    margemLiquida: { rotulo: 'Margem líquida', sub: '12 meses' },
    divLiqEbitda: { rotulo: 'Dív. líq./EBITDA', sub: 'negativo = caixa líquido' },
    divLiqPl: { rotulo: 'Dív. líq./PL', sub: '' },
    pl: { rotulo: 'P/L', sub: 'cotação ÷ LPA 12m' },
    pvp: { rotulo: 'P/VP', sub: '' },
    pvpFii: { rotulo: 'P/VP', sub: 'tijolo: menor; papel: mais perto de 1,00' },
    pReceita: { rotulo: 'P/Receita', sub: 'valor de mercado ÷ receita 12m' },
    dy12m: { rotulo: 'DY 12m', sub: '' },
    payout: { rotulo: 'Payout', sub: 'sem destaque: não tem direção' },
    valorMercado: { rotulo: 'Valor de mercado', sub: '' },
    liquidez21: { rotulo: 'Liquidez média 21 pregões', sub: '' },
    naCarteira: { rotulo: 'Na minha carteira', sub: 'quantidade · peso' },
    rendimentoCota: { rotulo: 'Rendimento 12m por cota (R$)', sub: '' },
    mesesComRendimento: { rotulo: 'Meses seguidos com rendimento', sub: '' },
    vpCota: { rotulo: 'VP por cota (R$)', sub: '' },
    nImoveis: { rotulo: 'Imóveis para renda', sub: 'sem destaque até a validação' },
    areaInformada: { rotulo: 'Área informada (mil m²)', sub: 'não é ABL' },
    vacanciaFisica: { rotulo: 'Vacância física', sub: 'sem destaque até a validação' },
    nCri: { rotulo: 'Nº de CRIs', sub: 'critério provisório' },
    maiorCri: { rotulo: 'Maior CRI', sub: '% do valor em CRIs · critério provisório' },
    obrigacoesPl: { rotulo: 'Obrigações/PL', sub: '' },
    patrimonio: { rotulo: 'Patrimônio', sub: '' },
    cotistas: { rotulo: 'Cotistas', sub: '' },
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
    // acréscimos da fatia C
    rotuloLinha: 'Base 100',
    subLinha: 'mesma escala em todos',
  },
  resumo: {
    titulo: 'Resumo numérico',
    indice: 'Índice MF, na ordem dos ativos acima: {valor}',
    indiceItem: '{ticker} {valor}',
    legendaIncompleto: '* Índice incompleto: o Índice usa só os critérios com dado.',
    criterios: 'Critérios atendidos: {valor}',
    criteriosItem: '{ticker} {atendidos} de {aplicaveis}',
    emConferencia: 'Em conferência: {valor}',
    emConferenciaItem: '{ticker} ({campo})',
    responsabilidade:
      'Os destaques indicam o valor numericamente mais favorável em cada critério. Não indicam qual ativo escolher.',
  },
  acoes: {
    copiarLink: 'Copiar link',
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
