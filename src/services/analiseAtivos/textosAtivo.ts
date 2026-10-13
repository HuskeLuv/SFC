/**
 * Textos da página do ativo v2.4 (dono: fatia C2): card de critérios (o que não é compartilhado),
 * Essencial na ordem nova em R$ bi, resumo literal do Valuation, pares sem Índice. O textosTela NÃO
 * é editado na C2 (a limpeza das chaves antigas é da F). Textos do card de critérios compartilhados
 * em textosCriterios.ts; rodapé dos cenários em textosLiterais.ts ('rodape-cenarios').
 *
 * Linguagem: tudo passa por linguagemV2 (textosAtivo.test.ts) — sem nota, Índice, semáforo,
 * destaque, melhor/pior, falta(m), recomend*. Placeholders {chave} via formatarTexto.
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
      lucro: 'Lucro líq. ⓘ',
      margem: 'Margem líq. ⓘ',
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
    /** tooltips das colunas com ⓘ (D2: a CVM não publica o lucro sem itens não recorrentes) */
    tooltips: {
      lucro: TEXTOS_CRITERIOS.tooltips.lucroLiquido,
      margem: TEXTOS_CRITERIOS.tooltips.margemLiquida,
      dl: 'Dívida bruta − caixa e aplicações financeiras; negativo = caixa líquido.',
      fclCapex:
        'Fluxo de caixa livre (FCO − CAPEX) ÷ CAPEX: quantas vezes o caixa livre cobre o investimento.',
    },
    /** rótulo da área de FII tijolo (rec. 7: a área informada à CVM não é a ABL do gestor) */
    areaFii: 'Área (CVM)',
    tooltipAreaFii: 'Área informada à CVM, em m²; não é a ABL do relatório do gestor.',
    unidadeAcao: 'Valores em R$ bi; LPA e Div./ação em R$ por ação · ano fiscal · fonte: CVM',
    notaFinanceira:
      'EBITDA, dívida líquida e FCL/CAPEX não se aplicam a bancos, seguradoras e holdings financeiras.',
    notaEssencial:
      'Essencial: o que basta para ver se receita, lucro, caixa e dividendos crescem ano a ano. Para abrir todos os demonstrativos, use o Raio-X.',
    /** Dív. líq./EBITDA sem número quando o EBITDA do ano é ≤ 0 */
    ebitdaNaoPositivo: 'não calculado: EBITDA ≤ 0 no ano',
    /** marca da linha do último ano fechado (leitor de tela) */
    ultimoAnoSr: 'último ano fiscal fechado',
  },

  /** Valuation · Múltiplos (§3.2 bloco 6 / §4.4): resumo literal + legenda. */
  valuation: {
    resumo: '{n} de {total} indicadores de {valor} estão abaixo da própria média de {anos} anos',
    legenda: 'marcador azul = valor atual · traço = média',
    semHistorico: 'Indicadores sem histórico anual suficiente: valores dos últimos 12 meses.',
  },

  /** Pares (§3.2 bloco 7): sem Índice, com a coluna Critérios (janela 5). */
  pares: {
    criterios: 'Critérios',
    criteriosTitulo: 'Critérios de fundamentos em {anos} anos',
    subAcao: 'mesmo segmento B3, depois mesmo setor · ordem A–Z · critérios em {anos} anos',
    subFii: 'mesmo tipo · ordem A–Z · critérios em {anos} anos',
    vazioAcao: 'Nenhum outro ativo do mesmo segmento no Quadro.',
    vazioFii: 'Nenhum outro fundo do mesmo tipo no Quadro.',
    semAvaliacao: '—',
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
] as const;
