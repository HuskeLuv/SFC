/**
 * CriteriaParams v3 — v2 (Brasil, IDÊNTICA) + perfis EUA (Stocks e REITs pela SEC).
 * Desenho: docs/analise-ativos/stocks-reits/desenho.json (final.criterios) e decisões do Wellington
 * de 17/10/2026 (PREVALECEM): Stocks e REITs juntos com os critérios substitutos dos REITs; universo
 * de stocks com free float ≥ US$ 2 bi (sai abaixo de US$ 1,6 bi) e REITs de patrimônio ≥ US$ 2 bi.
 *
 * Diferenças para a v2 (os perfis acao/acao_financeira/fii_* e o resto do bloco são os MESMOS — o
 * job BR avalia igual com a v2 ou a v3; teste criteriaParams.test):
 *  - stock: os 6 das ações com os MESMOS ids (rec/luc/ebitda/mg/dl/fcl; o filtro ?c= vale igual),
 *    em US$ mi; EBITDA calculado em 3 degraus e DL = dívida bruta − caixa − aplicações de curto prazo
 *    (séries da fatia B); 'luc' com serieFallback net_income como na v2;
 *  - stock_financeira: SIC 6000–6799 exceto 6798 (+ override por CIK), "n de 6" literal
 *    (naoSeAplica vazio, consistência com a v2.5 das financeiras BR);
 *  - reit: rec, dpa (Dividendo/ação crescente), fco_acao (Caixa operacional/ação crescente, no lugar
 *    do FFO/ação), dl (≤ 6×), pay (dividendos ≤ 90% do caixa operacional, no lugar do AFFO payout) e
 *    ocup (Ocupação ≥ 95%, INATIVA: não existe no XBRL — 'não atende · sem dado', conta no "de 6");
 *  - fontes.prioridade.porMercado: us_stocks/us_reits → ['sec'] (não entra em fontesCitadas: o
 *    job BR não muda de caminho);
 *  - universoEua = UNIVERSO_EUA_PADRAO.
 * Rótulos em português; os termos EUA (10-K, US GAAP, FFO/AFFO) ficam na definição (tooltip).
 * Valores imutáveis: recalibrar = nova versão (seed-criteria-params --versao=N).
 */
import {
  criteriaParamsSchema,
  type CriteriaParams,
  type CriteriaParamsEntrada,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V2_JSON } from '@/services/analiseAtivos/params/criteriaParamsV2';
import { UNIVERSO_EUA_PADRAO } from '@/types/analiseAtivosEua';

const REC_EUA = {
  id: 'rec',
  rotulo: 'Receita crescente',
  definicao:
    'Receita (revenues do relatório anual 10-K) maior que a do ano anterior em todos os anos da janela',
  tipo: 'up',
  serie: 'revenue',
  formato: 'n',
  unidade: 'US$ mi',
} as const;

const DL_DEFINICAO =
  'dívida bruta − caixa − aplicações de curto prazo; EBITDA calculado a partir do 10-K (lucro operacional + depreciação e amortização), pois não é um item padrão do US GAAP';

export const CRITERIA_PARAMS_V3_JSON = {
  ...CRITERIA_PARAMS_V2_JSON,
  versao: 3,
  descricao:
    'v3 = v2 (Brasil, igual) + Stocks e REITs pela SEC (10-K); decisões do Wellington de ' +
    '17/10/2026 (docs/analise-ativos/stocks-reits/desenho.json)',
  perfis: {
    ...CRITERIA_PARAMS_V2_JSON.perfis,
    stock: [
      REC_EUA,
      {
        id: 'luc',
        rotulo: 'Lucro crescente',
        definicao:
          'Lucro líquido (net income dos controladores, 10-K) maior que o do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'net_income_adjusted',
        serieFallback: 'net_income',
        formato: 'n',
        unidade: 'US$ mi',
      },
      {
        id: 'ebitda',
        rotulo: 'EBITDA crescente',
        definicao:
          'EBITDA calculado (lucro operacional + depreciação e amortização; sem lucro operacional, lucro antes do IR + juros + D&A) maior que o do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'ebitda',
        formato: 'n',
        unidade: 'US$ mi',
      },
      {
        id: 'mg',
        rotulo: 'Margem líquida positiva',
        definicao:
          'Margem líquida (lucro líquido ÷ receita, 10-K) acima de zero em todos os anos da janela',
        tipo: 'pos',
        serie: 'net_margin',
        formato: '%',
      },
      {
        id: 'dl',
        rotulo: 'Dív. líq./EBITDA < 3×',
        definicao: `Dívida líquida de até 3 vezes o EBITDA em todos os anos da janela (caixa líquido conta como dentro do limite); ${DL_DEFINICAO}`,
        tipo: 'max',
        serie: 'net_debt_ebitda',
        limite: 3,
        formato: 'x',
      },
      {
        id: 'fcl',
        rotulo: 'FCL crescente',
        definicao:
          'Fluxo de caixa livre (caixa operacional − CAPEX, 10-K) maior que o do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'free_cash_flow',
        formato: 'n',
        unidade: 'US$ mi',
      },
    ],
    stock_financeira: {
      base: 'stock',
      naoSeAplica: [],
      regraPerfil: 'sic_financeira',
    },
    reit: [
      {
        ...REC_EUA,
        definicao:
          'Receita (revenues ou receita de aluguéis do relatório anual 10-K) maior que a do ano anterior em todos os anos da janela',
      },
      {
        id: 'dpa',
        rotulo: 'Dividendo/ação crescente',
        definicao:
          'Dividendo por ação (pago no ano; sem o dado, declarado; sem os dois, dividendos pagos ÷ média de ações diluídas) maior que o do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'dividend_per_share',
        formato: 'n2',
        unidade: 'US$',
      },
      {
        id: 'fco_acao',
        rotulo: 'Caixa operacional/ação crescente',
        definicao:
          'Caixa operacional ÷ média de ações diluídas (10-K) maior que o do ano anterior em todos os anos da janela; entra no lugar do FFO/ação, que não está nos dados estruturados da SEC e difere deste valor',
        tipo: 'up',
        serie: 'ocf_per_share',
        formato: 'n2',
        unidade: 'US$',
      },
      {
        id: 'dl',
        rotulo: 'Dív. líq./EBITDA ≤ 6×',
        definicao: `Dívida líquida de até 6 vezes o EBITDA em todos os anos da janela (caixa líquido conta como dentro do limite); ${DL_DEFINICAO}. O EBITDAre do relatório pode diferir`,
        tipo: 'max',
        serie: 'net_debt_ebitda',
        limite: 6,
        formato: 'x',
      },
      {
        id: 'pay',
        rotulo: 'Dividendos ≤ 90% do caixa operacional',
        definicao:
          'Dividendos pagos ÷ caixa operacional (10-K) até 90% em todos os anos da janela; entra no lugar do payout sobre o AFFO, que não está nos dados estruturados da SEC. Caixa operacional ≤ 0 conta como fora do limite',
        tipo: 'max',
        serie: 'cash_payout_pct',
        limite: 90,
        formato: '%',
      },
      {
        id: 'ocup',
        rotulo: 'Ocupação ≥ 95%',
        definicao:
          'Ocupação dos imóveis de pelo menos 95% em todos os anos da janela; o dado não existe nos dados estruturados da SEC (está só no texto do 10-K)',
        tipo: 'min',
        serie: 'occupancy',
        limite: 95,
        formato: '%',
        ativo: false,
        motivoInativo: 'sem_fonte_confiavel',
      },
    ],
  },
  fontes: {
    ...CRITERIA_PARAMS_V2_JSON.fontes,
    prioridade: {
      ...CRITERIA_PARAMS_V2_JSON.fontes.prioridade,
      porMercado: { us_stocks: ['sec'], us_reits: ['sec'] },
    },
  },
  universoEua: UNIVERSO_EUA_PADRAO,
} satisfies CriteriaParamsEntrada;

/** v3 validada (o que o motor e as telas usam). */
export const CRITERIA_PARAMS_V3: CriteriaParams =
  criteriaParamsSchema.parse(CRITERIA_PARAMS_V3_JSON);
