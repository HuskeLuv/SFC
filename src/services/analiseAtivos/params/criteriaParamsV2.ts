/**
 * CriteriaParams v2 — Filtros de Fundamentos na v2.5: as REGRAS voltam a ser o mais próximo possível
 * da spec do Pedro (§3.2, §4.1, §4.4, §5, §6), ignorando a limitação dos dados grátis, e a área fica
 * pronta para um provedor pago (contratar = conector + env + NOVA versão de params, sem migration).
 * Desenho: docs/analise-ativos/v25-regras-pedro/desenho.json (final.mudancas_por_item) e decisões do
 * Wellington de 15/10/2026.
 *
 * Diferenças para a v1 (mesmos ids de critério):
 *  - séries com os nomes da spec (revenue, net_income_adjusted, net_margin, net_debt_ebitda,
 *    vacancy_physical, leverage_pct, default_pct, ltv_avg, income_per_share, ffo…);
 *  - 'luc' = net_income_adjusted com serieFallback net_income (decidido pela janela inteira; com
 *    fallback o resultado leva obs 'lucro_sem_descontado' e o tooltip avisa);
 *  - financeiras = "n de 6": naoSeAplica vazio, margemSemReceitaComparavel 'sem_dado',
 *    notaEssencial false; FCL calculado (literal, decisão 3) — religar = nova versão;
 *  - margem com receita ≤ lucro = 'valor' (literal: margem > 100% atende);
 *  - vacância, inadimplência e LTV ATIVOS (sem fonte = "não atende · sem dado nas demonstrações");
 *    vacancy_physical vem da CVM (informe trimestral, §6), com prioridade menor que um provedor;
 *    séries trimestrais/mensais → valor do ano = ÚLTIMO período do ano (decisão 4);
 *  - 'Alavancagem ≤ 20% do PL' (leverage_pct) e 'Dív. líq./EBITDA < 3×' (verificação continua ≤ 3,0).
 * Limites, janelas e regras de 'up'/'months'/caixa líquido = v1 (screen.js). Valores imutáveis:
 * recalibrar = nova versão (seed-criteria-params --versao=N).
 */
import {
  criteriaParamsSchema,
  SANIDADE_PADRAO,
  type CriteriaParams,
  type CriteriaParamsEntrada,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';

const REND = {
  id: 'rend',
  rotulo: 'Rendimento/cota crescente',
  definicao: 'Rendimento por cota no ano maior que o do ano anterior em todos os anos da janela',
  tipo: 'up',
  serie: 'income_per_share',
  formato: 'n2',
  unidade: 'R$',
} as const;

const VP = {
  id: 'vp',
  rotulo: 'VP/cota crescente',
  definicao:
    'Valor patrimonial por cota no fim do ano maior que o do ano anterior em todos os anos da janela',
  tipo: 'up',
  serie: 'nav_per_share',
  formato: 'n2',
  unidade: 'R$',
} as const;

const MES = {
  id: 'mes',
  rotulo: 'Rendimento todos os meses',
  definicao: 'Rendimento pago em todos os meses da janela',
  tipo: 'months',
  serie: 'months_with_income',
  formato: 'n',
} as const;

const RES = {
  id: 'res',
  rotulo: 'Resultado crescente',
  definicao: 'Resultado do fundo no ano maior que o do ano anterior em todos os anos da janela',
  tipo: 'up',
  serie: 'ffo',
  formato: 'n',
  unidade: 'R$ mi',
} as const;

export const CRITERIA_PARAMS_V2_JSON = {
  versao: 2,
  descricao:
    'v2 = regras da spec do Pedro (§3.2, §4.1, §4.4, §5, §6) + camada de fontes; decisões do ' +
    'Wellington de 15/10/2026 (docs/analise-ativos/v25-regras-pedro/desenho.json)',
  janelas: [3, 5, 10],
  janelaPadrao: 5,
  ancoraAno: { mesLiberaAnoAnterior: 5 },
  perfis: {
    acao: [
      {
        id: 'rec',
        rotulo: 'Receita crescente',
        definicao: 'Receita líquida maior que a do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'revenue',
        formato: 'n',
        unidade: 'R$ mi',
      },
      {
        id: 'luc',
        rotulo: 'Lucro crescente',
        definicao:
          'Lucro líquido descontado (sem itens não recorrentes) maior que o do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'net_income_adjusted',
        serieFallback: 'net_income',
        formato: 'n',
        unidade: 'R$ mi',
      },
      {
        id: 'ebitda',
        rotulo: 'EBITDA crescente',
        definicao:
          'EBITDA (EBIT + depreciação e amortização) maior que o do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'ebitda',
        formato: 'n',
        unidade: 'R$ mi',
      },
      {
        id: 'mg',
        rotulo: 'Margem líquida positiva',
        definicao:
          'Margem líquida (lucro líquido ÷ receita líquida) acima de zero em todos os anos da janela',
        tipo: 'pos',
        serie: 'net_margin',
        formato: '%',
      },
      {
        id: 'dl',
        rotulo: 'Dív. líq./EBITDA < 3×',
        definicao:
          'Dívida líquida de até 3 vezes o EBITDA em todos os anos da janela (caixa líquido conta como dentro do limite)',
        tipo: 'max',
        serie: 'net_debt_ebitda',
        limite: 3,
        formato: 'x',
      },
      {
        id: 'fcl',
        rotulo: 'FCL crescente',
        definicao:
          'Fluxo de caixa livre (FCO − CAPEX) maior que o do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'free_cash_flow',
        formato: 'n',
        unidade: 'R$ mi',
      },
    ],
    acao_financeira: {
      base: 'acao',
      naoSeAplica: [],
      regraPerfil: 'ehFinanceira_universo',
      margemSemReceitaComparavel: 'sem_dado',
      notaEssencial: false,
    },
    fii_tijolo: [
      REND,
      VP,
      {
        id: 'vac',
        rotulo: 'Vacância ≤ 10%',
        definicao: 'Vacância física até 10% em todos os anos da janela',
        tipo: 'max',
        serie: 'vacancy_physical',
        limite: 10,
        formato: '%',
      },
      {
        id: 'alav',
        rotulo: 'Alavancagem ≤ 20% do PL',
        definicao:
          'Alavancagem do fundo (obrigações ÷ PL) até 20% do patrimônio líquido em todos os anos da janela',
        tipo: 'max',
        serie: 'leverage_pct',
        limite: 20,
        formato: '%',
      },
      MES,
      RES,
    ],
    fii_papel: [
      REND,
      VP,
      {
        id: 'inad',
        rotulo: 'Inadimplência ≤ 3%',
        definicao: 'Inadimplência da carteira de crédito até 3% em todos os anos da janela',
        tipo: 'max',
        serie: 'default_pct',
        limite: 3,
        formato: '%',
      },
      {
        id: 'ltv',
        rotulo: 'LTV ≤ 60%',
        definicao:
          'LTV médio dos CRIs (saldo devedor ÷ valor da garantia) até 60% em todos os anos da janela',
        tipo: 'max',
        serie: 'ltv_avg',
        limite: 60,
        formato: '%',
      },
      MES,
      RES,
    ],
  },
  equivalencias: { vac: 'inad', alav: 'ltv' },
  regraHibrido: { limiarImoveisPlPct: 50, aplicaA: ['hibrido', 'indefinido', 'fof', 'sem_tipo'] },
  dlEbitda: {
    caixaLiquido: 'atende',
    exibirNegativoComoZero: true,
    ebitdaNaoPositivo: 'nao_atende_se_dl_positiva',
  },
  meses: { ancora: 'fim_anoFim', mesesBaseCurta: 'sem_dado' },
  criterios: { margem: { receitaMenorQueLucro: 'valor' } },
  fontes: {
    // um provedor contratado entra ANTES de 'cvm' numa versão nova (ex.: ['provedor_x', 'cvm'])
    prioridade: { padrao: ['cvm'], porSerie: { vacancy_physical: ['cvm'] } },
    agregacaoAnual: { vacancy_physical: 'ultimo', default_pct: 'ultimo', ltv_avg: 'ultimo' },
    sanidade: { ...SANIDADE_PADRAO, aplicaA: ['provedor'] },
    obrigatorias: {
      br_acoes: ['revenue', 'net_income'],
      br_fii: ['income_per_share', 'nav_per_share'],
    },
  },
} satisfies CriteriaParamsEntrada;

/** v2 validada (o que o motor e as telas usam). */
export const CRITERIA_PARAMS_V2: CriteriaParams =
  criteriaParamsSchema.parse(CRITERIA_PARAMS_V2_JSON);
