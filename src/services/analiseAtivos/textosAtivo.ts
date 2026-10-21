/**
 * Textos da página do ativo v2.4 (dono: fatia C2): card de critérios (o que não é compartilhado),
 * Essencial na ordem nova em R$ bi, resumo literal do Valuation, pares sem Índice. O textosTela NÃO
 * é editado na C2 (a limpeza das chaves antigas é da F). Textos do card de critérios compartilhados
 * em textosCriterios.ts; rodapé dos cenários em textosLiterais.ts ('rodape-cenarios').
 *
 * Linguagem: tudo passa por linguagemV2 (textosAtivo.test.ts) — sem nota, Índice, semáforo,
 * destaque, melhor/pior, falta(m), recomend*. Placeholders {chave} via formatarTexto.
 *
 * v2.5 (fatia 0, CONGELADOS): 'Lucro descontado' / 'Margem descontada' (§3.2) com o tooltip do
 * fallback; 'Alavancagem (% do PL)' no lugar de 'Obrigações/PL' nas colunas de FII (Raio-X, pares);
 * a frase de fonte do Essencial passa a ser montada pelas origens (textosCriterios.textoNotaFonte),
 * e unidadeAcaoSemFonte é a linha de unidade sem o 'fonte: CVM' fixo.
 *
 * fundamentei-regras (F2; só com ANALISE_ATIVOS_ESSENCIAL_V2_HABILITADO): essencialV2 — um lucro
 * líquido só ('Lucro líquido' / 'Margem líquida', sem ⓘ de fallback, A4.e), tooltip do 'L' (prejuízo
 * no período, A4.a), rótulo do exercício fora de dezembro ('fev/2026') e a nota 'exercício encerrado
 * em {mes}' (A4.c). Sub-rótulo do payout de caixa (segue a payout.regra da scoring vigente, sem chave).
 */
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';

export const TEXTOS_ATIVO = {
  /** Card "Critérios de fundamentos" (§3.2 bloco 2) — complementos de TEXTOS_CRITERIOS. */
  criterios: {
    /** card sem avaliação (job ainda não rodou para o ativo) */
    semAvaliacao:
      'Os critérios de fundamentos deste ativo ainda não foram calculados. Eles aparecem aqui depois da próxima atualização das demonstrações.',
    /** fato de um critério sem dado: 'não atende · sem dado nas demonstrações …' */
    fatoSemDado: 'não atende · {fato}',
    /** complemento da fonte no rodapé do card */
    mesmosCriterios: 'Os mesmos critérios dos filtros do Quadro.',
    /** lista dos critérios (nome acessível) */
    listaAria: 'Critérios de fundamentos em {anos} anos ({anoInicio}–{anoFim})',
    /** número grande do card: '5' + 'de 6' */
    deTotal: 'de {total}',
    /** complemento do número para leitor de tela */
    contagemSr: 'critérios atendidos em {anos} anos',
  },

  /** Fundamentos · Essencial (§3.2 bloco 5): ordem nova, R$ bi, D2 e D4. */
  essencial: {
    colunas: {
      receita: 'Receita líq.',
      ebitda: 'EBITDA',
      lucro: 'Lucro descontado ⓘ',
      margem: 'Margem descontada ⓘ',
      dl: 'Dívida líq. ⓘ',
      dlEbitda: 'Dív. líq./EBITDA',
      fclCapex: 'FCL/CAPEX ⓘ',
      roe: 'ROE',
      lpa: 'LPA (R$)',
      dpa: 'Div./ação (R$)',
      payout: 'Payout',
      pl: 'P/L',
      pvp: 'P/VP',
      dy: 'DY',
    },
    /**
     * tooltips das colunas com ⓘ. v2.5: definição do descontado; a célula que usa o lucro líquido
     * no lugar dele (MarcaCelulaEssencial.fallback) acrescenta fallbackLucro/fallbackMargem.
     */
    tooltips: {
      lucro: TEXTOS_CRITERIOS.tooltips.lucroDescontado,
      margem: TEXTOS_CRITERIOS.tooltips.margemDescontada,
      fallbackLucro: TEXTOS_CRITERIOS.tooltips.fallbackLucro,
      fallbackMargem: TEXTOS_CRITERIOS.tooltips.fallbackMargem,
      /** célula sem dado (financeira com '—', receita ≤ 0): o mesmo texto dos critérios */
      semDado: TEXTOS_CRITERIOS.fatos.semDado,
      dl: 'Dívida bruta − caixa e aplicações financeiras; negativo = caixa líquido.',
      fclCapex:
        'Fluxo de caixa livre (FCO − CAPEX) ÷ CAPEX: quantas vezes o caixa livre cobre o investimento.',
    },
    /** rótulo da área de FII tijolo (rec. 7: a área informada à CVM não é a ABL do gestor) */
    areaFii: 'Área (CVM)',
    tooltipAreaFii: 'Área informada à CVM, em m²; não é a ABL do relatório do gestor.',
    unidadeAcao: 'Valores em R$ bi; LPA e Div./ação em R$ por ação · ano fiscal · fonte: CVM',
    /** v2.5: unidade sem a fonte fixa (a frase de fonte vem de textoNotaFonte, pelas origens) */
    unidadeAcaoSemFonte: 'Valores em R$ bi; LPA e Div./ação em R$ por ação · ano fiscal',
    /** v2.5: selo do card quando alguma célula vem de ponto incompleto (§6) */
    seloIncompleto: TEXTOS_CRITERIOS.incompleto.selo,
    tooltipIncompleto: TEXTOS_CRITERIOS.incompleto.tooltip,
    notaFinanceira:
      'EBITDA, dívida líquida e FCL/CAPEX não se aplicam a bancos, seguradoras e holdings financeiras.',
    notaEssencial:
      'Essencial: o que basta para ver se receita, lucro, caixa e dividendos crescem ano a ano. Para abrir todos os demonstrativos, use o Raio-X.',
    /** v2.5: rótulo ABL quando gla_m2 vier de um provedor (até lá, areaFii) */
    ablFii: 'ABL (m²)',
    tooltipAblFii: 'Área bruta locável informada pela fonte, em m².',
    /** Dív. líq./EBITDA sem número quando o EBITDA do ano é ≤ 0 */
    ebitdaNaoPositivo: 'não calculado: EBITDA ≤ 0 no ano',
    /** marca da linha do último ano fechado (leitor de tela) */
    ultimoAnoSr: 'último ano fiscal fechado',
  },

  /** F2 fundamentei-regras: Essencial/Raio-X/Valuation/dividendos v2 (ESSENCIAL_V2). */
  essencialV2: {
    colunas: {
      lucro: 'Lucro líquido',
      margem: 'Margem líquida',
    },
    /** explicação das colunas (no lugar da do lucro descontado) */
    tooltips: {
      lucro: 'Lucro líquido atribuído aos acionistas controladores, como publicado na DFP.',
      margem: 'Lucro líquido ÷ receita líquida do ano.',
    },
    /** tooltip do 'L' no lugar do '—' (payout e P/L com lucro ≤ 0) */
    tooltipPrejuizo: 'prejuízo no período',
    /** nota do exercício fora de dezembro (Essencial, Raio-X, Valuation) */
    notaExercicio:
      'Exercício encerrado em {mes}: cada ano fiscal vai até {mes} e leva o ano em que termina.',
    mesesCurtos: [
      'jan',
      'fev',
      'mar',
      'abr',
      'mai',
      'jun',
      'jul',
      'ago',
      'set',
      'out',
      'nov',
      'dez',
    ],
    meses: [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ],
  },

  /**
   * F2 fundamentei-regras (A4.a): o que o payout mede, pela payout.regra da scoring VIGENTE (nunca
   * por chave): 'dfc' = proventos pagos na DFC; 'dmpl_dpa' = proventos declarados (hoje).
   */
  payoutRegra: {
    dfc: 'proventos pagos (fluxo de caixa) ÷ lucro',
    dmpl_dpa: 'proventos declarados ÷ lucro',
  },

  /** Valuation · Múltiplos (§3.2 bloco 6 / §4.4): resumo literal + legenda. */
  valuation: {
    resumo: '{n} de {total} indicadores de {valor} estão abaixo da própria média de {anos} anos',
    legenda: 'marcador azul = valor atual · traço = média',
    semHistorico: 'Indicadores sem histórico anual suficiente: valores dos últimos 12 meses.',
  },

  /**
   * v2.5: 'Alavancagem (% do PL)' — rótulo das colunas de FII (Raio-X, pares, Essencial) no lugar
   * de 'Obrigações/PL', coerente com o chip 'Alavancagem ≤ 20% do PL'. Só rótulo: o cálculo é o
   * mesmo (obrigações ÷ PL).
   */
  alavancagem: {
    rotulo: 'Alavancagem (% do PL)',
    tooltip:
      'Obrigações do fundo (passivo menos rendimentos a distribuir) ÷ patrimônio líquido, em %.',
  },

  /**
   * A6 (fatia 0; usado pela fatia E com ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO): chave NOVA para o valor
   * novo (obrigações ÷ ativo total). As chaves de PL acima continuam intactas: cada coluna com o
   * próprio rótulo e o próprio valor.
   */
  alavancagemAtivo: {
    rotulo: 'Alavancagem (% do ativo)',
    tooltip:
      'Obrigações do fundo (aquisição de imóveis, securitização e outros valores a pagar) ÷ ativo total, em %. Outros valores a pagar podem incluir itens que não são dívida.',
  },

  /** Pares (§3.2 bloco 7): sem Índice, com a coluna Critérios (janela 5). */
  pares: {
    colunas: {
      fundo: 'Fundo',
      criterios: 'Critérios',
      vacancia: 'Vacância (CVM)',
      nCri: 'Nº CRIs (CVM)',
      alavancagem: 'Alavancagem (% do PL)',
      /** A6 (fatia E): coluna nova ao lado da de PL */
      alavancagemAtivo: 'Alavancagem (% do ativo)',
    },
    /** nome acessível da coluna Critérios ('Critérios de fundamentos em 5 anos') */
    criteriosTitulo: 'Critérios de fundamentos em {anos} anos',
    /** célula sem avaliação ainda */
    criteriosSem: 'sem avaliação',
    subAcao: 'mesmo segmento B3, depois mesmo subsetor · ordem A–Z · critérios em {anos} anos',
    subFii: 'mesmo segmento CVM e mesmo tipo · ordem A–Z · critérios em {anos} anos',
    vazioAcao: 'Nenhum outro ativo do mesmo segmento no Quadro.',
    vazioFii: 'Nenhum outro fundo do mesmo tipo no Quadro.',
  },
} as const;

/** Placeholders aceitos nos textos deste módulo (o teste confere). */
export const PLACEHOLDERS_ATIVO = [
  'fato',
  'anos',
  'anoInicio',
  'anoFim',
  'n',
  'total',
  'valor',
  'mes',
] as const;
