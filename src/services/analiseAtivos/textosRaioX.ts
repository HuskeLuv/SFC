/**
 * Textos do Fundamentos · Raio-X + Exportar CSV (Bloco D, fatia A). Esqueleto da fatia 0 com TODOS
 * os textos da spec e do protótipo final; a fatia A pode ACRESCENTAR chaves (sem renomear as
 * existentes). Passa pela varredura do Bloco D (textosBlocoD.test.ts: PALAVRAS_PROIBIDAS_BLOCO_D,
 * inclusive 'nota/notas'; placeholders só de PLACEHOLDERS_PERMITIDOS + PLACEHOLDERS_BLOCO_D).
 *
 * Decisões refletidas: D3 (taxa de adm. do FII "% do PL no ano", soma de 12 meses, fora da escala
 * ⇒ em conferência), D4 (sem inadimplência/prazo médio/vencimentos/indexadores), D5 (rendimento
 * distribuído 2º tri + 4º tri e payout do resultado), D1 (per-share com salto de ações ⇒ em
 * conferência, também no Essencial), D13 (CSV raio-x_<TICKER>_<AAAA-MM-DD>.csv; bloco final
 * "Sobre os dados", nunca "Notas"). O rodapé legal do CSV é o RODAPE_LEGAL (fora deste objeto).
 */
export const TEXTOS_RAIO_X = {
  seletor: {
    rotuloGrupo: 'Nível de detalhe dos fundamentos',
    essencial: 'Essencial',
    raioX: 'Raio-X',
  },
  titulo: 'Fundamentos',
  sub: {
    essencial: '10 anos · ano fiscal · fonte CVM',
    raioXAcao: '10 anos · demonstrativos completos',
    raioXFii: '10 anos · informes mensal e trimestral',
  },
  unidade: {
    acao: 'Valores em R$ mi · ano fiscal · fonte: CVM (DFP) · {valor}',
    fii: 'Valores em R$ mi; por cota em R$ · ano fiscal · fonte: CVM (informes mensal e trimestral)',
    escopo: { con: 'consolidado', ind: 'individual' },
  },
  blocos: {
    todos: 'Todos',
    rotuloChips: 'Blocos do Raio-X',
    lucro_caixa: 'Lucro e geração de caixa',
    caixa_divida: 'Caixa e dívida',
    fluxo_caixa: 'Fluxo de caixa',
    resultado_distribuicao: 'Resultado e distribuição',
    patrimonio_cota: 'Patrimônio e cota',
    carteira_imoveis: 'Carteira de imóveis',
    carteira_recebiveis: 'Carteira de recebíveis',
    alavancagem_custos: 'Alavancagem e custos',
  },
  /** rótulo + explicação curta (sub) de cada linha; unidade do CSV em `csv.unidades` */
  linhas: {
    receita: { rotulo: 'Receita líquida', sub: '' },
    receitaBanco: { rotulo: 'Receitas da intermediação financeira', sub: '' },
    lucroBruto: { rotulo: 'Lucro bruto', sub: '' },
    lucroBrutoBanco: { rotulo: 'Resultado bruto da intermediação financeira', sub: '' },
    margemBrutaPct: { rotulo: 'Margem bruta', sub: '' },
    ebitda: { rotulo: 'EBITDA', sub: 'EBIT + depreciação e amortização (DFC)' },
    margemEbitdaPct: { rotulo: 'Margem EBITDA', sub: '' },
    ebit: { rotulo: 'EBIT', sub: 'resultado antes do financeiro e dos tributos' },
    lucroLiquido: { rotulo: 'Lucro líquido', sub: 'atribuído aos controladores' },
    margemLiquidaPct: { rotulo: 'Margem líquida', sub: '' },
    lpa: { rotulo: 'LPA (R$)', sub: 'na base de ações de hoje' },
    roePct: { rotulo: 'ROE', sub: '' },
    roicPct: { rotulo: 'ROIC', sub: 'aproximado: IR/CSLL de 34%' },
    payoutPct: { rotulo: 'Payout', sub: 'proventos declarados ÷ lucro' },
    patrimonioLiquido: { rotulo: 'Patrimônio líquido', sub: '' },
    caixaAplicacoes: { rotulo: 'Caixa e aplicações', sub: '' },
    dividaBruta: { rotulo: 'Dívida bruta', sub: 'curto + longo prazo' },
    dividaLiquida: { rotulo: 'Dívida líquida', sub: 'negativa = caixa maior que a dívida' },
    divLiqEbitda: { rotulo: 'Dív. líq./EBITDA', sub: '' },
    divLiqPl: { rotulo: 'Dív. líq./PL', sub: '' },
    liquidezCorrente: { rotulo: 'Liquidez corrente', sub: '' },
    nAcoesMi: { rotulo: 'Nº de ações (milhões)', sub: 'fim do ano, sem tesouraria' },
    fco: { rotulo: 'Caixa das operações (FCO)', sub: '' },
    fci: { rotulo: 'Caixa de investimentos', sub: '' },
    caixaFinanciamento: { rotulo: 'Caixa de financiamento', sub: '' },
    capex: { rotulo: 'CAPEX (saída)', sub: 'imobilizado e intangível' },
    fcl: { rotulo: 'Fluxo de caixa livre', sub: 'caixa das operações − CAPEX' },
    fclLucroPct: { rotulo: 'FCL/lucro', sub: '' },
    dividendosJcpPagos: { rotulo: 'Dividendos e JCP pagos (saída)', sub: '' },
    receitaAluguel: { rotulo: 'Receita de aluguéis', sub: 'informe trimestral (CVM)' },
    resultado: { rotulo: 'Resultado', sub: '' },
    rendimentoDistribuido: {
      rotulo: 'Rendimento distribuído',
      sub: 'soma do 1º e do 2º semestre (informe trimestral)',
    },
    rendimentoCota: {
      rotulo: 'Rendimento por cota (R$)',
      sub: 'soma no ano, por data-com, base de cotas de hoje',
    },
    dyPct: { rotulo: 'DY', sub: '' },
    payoutResultadoPct: {
      rotulo: 'Payout do resultado',
      sub: 'rendimento distribuído ÷ resultado',
    },
    resultadoCota: { rotulo: 'Resultado por cota (R$)', sub: '÷ média mensal de cotas no ano' },
    vpCota: { rotulo: 'VP por cota (R$)', sub: 'cota no fim do ano, base de cotas de hoje' },
    pvp: { rotulo: 'P/VP', sub: '' },
    nCotasMi: { rotulo: 'Nº de cotas (milhões)', sub: 'dezembro, base de cotas de hoje' },
    cotistas: { rotulo: 'Cotistas (mil)', sub: '' },
    nImoveis: { rotulo: 'Imóveis para renda', sub: 'fonte CVM · pode diferir do gestor' },
    areaInformadaMilM2: { rotulo: 'Área informada (mil m²)', sub: 'fonte CVM · não é ABL' },
    vacanciaFisicaPct: { rotulo: 'Vacância física', sub: 'fonte CVM · pode diferir do gestor' },
    nCri: { rotulo: 'Nº de CRIs', sub: 'fonte CVM' },
    maiorCriPct: { rotulo: 'Maior CRI', sub: '% do valor em CRIs, fonte CVM' },
    obrigacoesPlPct: { rotulo: 'Obrigações/PL', sub: '' },
    /** decisão 3 */
    taxaAdmAnoPct: {
      rotulo: 'Taxa de adm. (% do PL no ano)',
      sub: 'soma dos 12 meses informados à CVM',
    },
    taxaPerformance: { rotulo: 'Taxa de performance', sub: 'soma do ano' },
  },
  celula: {
    semDado: 'sem dado na fonte naquele ano',
    naoSeAplica: 'n/a',
    razao: '(razão)',
    emConferencia: 'em conferência',
    chipAria: '{campo} {ano} em conferência: por quê?',
  },
  conferencia: {
    /** decisão 1 (Raio-X e Essencial): salto_acoes_sem_evento / dados_incompletos / < 1/10 da mediana */
    saltoAcoes:
      'nº de ações muda sem evento societário registrado: LPA, nº de ações e valores por ação do ano ficam em conferência',
    acoesAbaixoMediana:
      'nº de ações do ano abaixo de 1/10 da mediana dos anos: valores por ação em conferência',
    /** decisão 3 */
    taxaAdmForaDaEscala:
      'taxa de adm. somada no ano acima de {valor}% do PL: algum mês veio fora da escala na fonte',
    taxaAdmMesesIncompletos: 'menos de 12 meses com a taxa informada no ano',
    semestreIncompleto: 'semestre incompleto no informe trimestral',
    resultadoNaoPositivo: 'resultado do ano ≤ 0: o payout não se aplica',
    cotasIncompletas: 'menos de 12 meses de cotas no ano',
    lucroNaoPositivo: 'lucro do ano ≤ 0: a razão não se aplica',
  },
  legenda:
    'Itálico com fundo cinza = razão (margens, retornos, múltiplos). “—” = sem dado na fonte naquele ano.',
  sobreOsDados: {
    titulo: 'Sobre os dados',
    naoSeAplicamBancos: 'Não se aplicam a bancos (linhas ocultas): {valor}.',
    capexBanco:
      'CAPEX e fluxo de caixa livre: o demonstrativo do banco não separa o investimento em imobilizado e intangível (linhas ocultas).',
    receitaPapel: 'Receita de aluguéis não se aplica a FII de papel (linha oculta).',
    payoutSemProventos:
      'Payout “—”: o documento usado não traz proventos declarados no ano. A equipe confere o escopo do DMPL.',
    regrasFii:
      'Rendimento distribuído = soma do 1º e do 2º semestre do informe trimestral. Resultado por cota usa a média mensal de cotas do ano, para não distorcer em ano de emissão. Dados de imóveis vêm da CVM e podem diferir do relatório do gestor.',
    baseCotasHoje:
      'Anos anteriores a {data} na base de cotas de hoje: o fundo desdobrou as cotas (VP, rendimento e nº de cotas ajustados).',
    lpaBaseHoje: 'LPA na base de ações de hoje (ajustado por desdobramentos e bonificações).',
    unit: 'Ativo negociado em unit (1 unit = {n} ações): o LPA é por unit e o nº de ações é o total de ações da companhia, por isso lucro ÷ nº de ações não bate com o LPA.',
    perShareConferencia:
      'LPA e nº de ações em conferência nos anos em que a base de ações muda sem evento societário.',
    semAnosAntes: 'Antes de {ano} a companhia não publicava DFP.',
    taxaAdm:
      'Taxa de adm. = soma das taxas mensais informadas à CVM no ano, em % do PL. No card Múltiplos, o valor é o do mês.',
    padraoContabil: 'Padrão contábil: {valor}.',
    fcfFinanciamento:
      'Caixa de financiamento é o fluxo das atividades de financiamento da DFC (não é fluxo de caixa livre).',
  },
  estados: {
    carregando: 'Carregando: Fundamentos',
    erro: 'Não foi possível carregar este bloco.',
    tentarNovamente: 'Tentar de novo',
    vazio: 'Sem demonstrativos anuais estruturados na CVM para este ativo.',
  },
  tabela: {
    rotuloRegiao: 'Raio-X de {ticker}, role para o lado',
    caption: 'Raio-X de {ticker}, anos fiscais de {anos}, mais recente primeiro',
    colunaIndicador: 'Indicador',
  },
  csv: {
    botao: 'Exportar CSV',
    gerando: 'Gerando CSV…',
    baixado: '{valor} baixado',
    erro: 'Não foi possível gerar o CSV.',
    tentarNovamente: 'Tentar de novo',
    compartilharTitulo: 'Raio-X de {ticker}',
    cabecalhoLinha: 'Linha',
    sobreOsDados: 'Sobre os dados',
    emConferencia: 'Em conferência',
    itemConferencia: '{ano} · {campo}: {motivo}',
    observacoes: 'Observações',
    fonte: 'Fonte',
    fonteValor: 'CVM (DFP/ITR, informes de FII) · B3 · cálculos do My Finance',
    geradoEm: 'Gerado em',
    parametros: 'Parâmetros',
    avisoLegal: 'Aviso legal',
    unidades: {
      moedaMi: '(R$ mi)',
      moeda: '(R$)',
      pct: '(%)',
      multiplo: '(x)',
      milhoes: '(milhões)',
      areaMilM2: '(mil m²)',
      inteiro: '',
    },
  },
} as const;
