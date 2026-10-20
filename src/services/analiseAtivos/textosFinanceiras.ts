/**
 * Textos dos templates de banco e seguradora do Fundamentos · Essencial (A6, itens 3 e 4; dona:
 * fatia B). Os rótulos das linhas e blocos do Raio-X ficam em TEXTOS_RAIO_X (linhas/blocos novos da
 * fatia 0). Escritos e congelados na fatia 0; a fatia B pode ACRESCENTAR chaves, sem renomear.
 * Varredura linguagemV2Global.
 *
 * Basileia fica fora (fase 2: IF.data do Bacen), com a observação no card. Sinistralidade só até
 * 2022; desde 2023 (IFRS 17), despesa ÷ receita de seguro. O Comparador não ganha linha de banco.
 */
export const TEXTOS_FINANCEIRAS = {
  banco: {
    colunas: {
      receitaIntermediacao: 'Receita interm. fin.',
      pdd: 'PDD',
      lucroLiquido: 'Lucro líq.',
      margemBancaria: 'Margem líq. bancária',
      pddLucro: 'PDD ÷ lucro',
      ativoTotal: 'Ativos totais',
      patrimonio: 'PL',
      roe: 'ROE',
      divJcp: 'Div. + JCP',
      payout: 'Payout',
      dy: 'DY',
      pl: 'P/L',
      pvp: 'P/VP',
    },
    tooltips: {
      receitaIntermediacao: 'Receitas da intermediação financeira (DRE 3.01).',
      pdd: 'Provisão para perdas esperadas de crédito (DVA 7.01.03), em valor absoluto.',
      margemBancaria: 'Lucro líquido ÷ receita de intermediação financeira.',
      pddLucro: 'PDD ÷ lucro líquido; com lucro ≤ 0 a razão não se aplica.',
    },
    unidade:
      'Valores em R$ bi · ano fiscal · fonte DFP/ITR (CVM), plano de contas de instituição financeira',
    observacoes: {
      basileia:
        'Basileia (capital regulatório): não publicado nas demonstrações da CVM · fase 2 (IF.data do Bacen).',
      padraoContabil:
        'Padrão contábil: {valor}. No consolidado em IFRS a receita de intermediação inclui tarifas e seguros e não é comparável com bancos que publicam o individual em BR GAAP.',
      pddLucro: 'Com lucro ≤ 0, PDD ÷ lucro aparece "—" com o motivo.',
    },
    motivos: {
      semDva: 'sem DVA de instituição financeira no documento',
      lucroNaoPositivo: 'lucro do ano ≤ 0: a razão não se aplica',
    },
  },
  seguradora: {
    colunas: {
      receitaOperacional: 'Receita operacional',
      equivalencia: 'Equivalência patr.',
      resultadoFinanceiro: 'Resultado financeiro',
      lucroLiquido: 'Lucro líq.',
      margemLiquida: 'Margem',
      roe: 'ROE',
      patrimonio: 'PL',
      divJcp: 'Div. + JCP',
      payout: 'Payout',
      dy: 'DY',
    },
    tooltips: {
      /** ColunaFundamentos.tooltip da receita, pela OrigemReceitaSeguradora */
      receita: {
        comissoes_servicos:
          'Holding: comissões + receita de serviços (a receita de seguros da holding é zero).',
        receita_seguro: 'Operacional: receita de seguro (IFRS 17, desde 2023).',
        premios_ganhos: 'Operacional: prêmios ganhos (até 2022).',
      },
      equivalencia: 'Resultado de equivalência patrimonial das investidas.',
      margem: 'Lucro líquido ÷ receita operacional.',
    },
    unidade: 'Valores em R$ bi · ano fiscal · fonte DFP/ITR (CVM) · receita usada: {valor}',
    /** fatia B: sem nenhuma receita operacional publicada na janela */
    unidadeSemReceita: 'Valores em R$ bi · ano fiscal · fonte DFP/ITR (CVM)',
    /** fatia B: operacional com os dois regimes na janela (receitaUsada de cada um) */
    receitaUsadaRegimes: '{ate} até 2022 · {desde} desde 2023',
    receitaUsada: {
      comissoes_servicos: 'comissões + serviços (holding)',
      receita_seguro: 'receita de seguro (operacional)',
      premios_ganhos: 'prêmios ganhos (operacional)',
    },
    observacoes: {
      holdings:
        'Holdings: prêmios e sinistros das investidas não constam das demonstrações da CVM.',
      margemHolding:
        'Margem "—": o lucro da holding supera a receita operacional por causa da equivalência patrimonial, e a razão não tem leitura.',
      equivalenciaOperacional:
        'Equivalência patrimonial "—": não se aplica ao modelo de negócio de seguradora operacional.',
      ifrs17:
        'Os anos do outro regime aparecem "—" com o motivo "mudança de norma contábil (IFRS 17, 2023)". O rótulo "sinistralidade" não aparece de 2023 em diante.',
      holdingOperacao: 'Linhas de operação de seguro: "—" na holding.',
      /** a conta da DRE como publicada; recuperações em linhas próprias ficam de fora (PSSA 2022) */
      sinistrosComoPublicados:
        'Sinistralidade: usa a conta de sinistros retidos da DRE como publicada. Recuperações lançadas em linhas próprias (resseguradores, salvados e ressarcimentos) não entram no numerador.',
    },
    motivos: {
      ifrs17: 'mudança de norma contábil (IFRS 17, 2023)',
      equivalenciaNaoSeAplica: 'não se aplica ao modelo de negócio',
      holdingSemOperacao: 'não se aplica · holding sem operação de seguro própria',
      margemSemLeitura:
        'o lucro supera a receita operacional (equivalência patrimonial): a razão não tem leitura',
    },
  },
} as const;
