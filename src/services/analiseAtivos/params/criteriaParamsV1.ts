/**
 * CriteriaParams v1 — Filtros de Fundamentos (spec v2.4 §4.1 + decisões de 13/10/2026).
 *
 * Limites e tipos = CRITERIA do screen.js do Pedro (prototipo-pedro-v2.html), com as decisões:
 *  - D2: "Lucro crescente" e "Margem líquida positiva" usam o lucro líquido dos CONTROLADORES (a CVM
 *    não publica o lucro sem itens não recorrentes; não existe "descontado");
 *  - D3: vacância (tijolo), inadimplência e LTV (papel) INATIVOS — "sem dado" para todos, com
 *    motivo 'sem_fonte_confiavel'; alavancagem = "Obrigações/PL ≤ 20%";
 *  - D4: financeiras (ehFinanceira do universo, inclui seguradoras e holdings como ITSA) = n de 3:
 *    EBITDA, Dív.líq/EBITDA e FCL "não se aplica";
 *  - "Dív. líq./EBITDA ≤ 3×" (regra da spec: dentro do limite = ≤; caixa líquido conta como dentro e
 *    o fato mostra máx(0, máx): 'máx. 0,0×');
 *  - rec. 3: FoF/híbrido/indefinido/sem tipo → tijolo se imóveis ≥ 50% do PL, senão papel;
 *  - rec. 4: meses ancorados em jan/(fim−J+1)–dez/fim; base de proventos que começa depois do
 *    início da janela → 'sem_dado'.
 * Ids (estáveis) em IDS_CRITERIO (src/types/analiseAtivosCriterios.ts). Textos de rótulo e
 * definição = protótipo final (docs/analise-ativos/v2-filtros/prototipo.html). Valores imutáveis:
 * recalibrar = nova versão.
 *
 * v2.5: CRITERIA_PARAMS_V1_JSON é o JSON EXATO gravado em produção (nomes de série legados, sem os
 * campos novos); CRITERIA_PARAMS_V1 é o mesmo JSON depois do parse (nomes canônicos da spec e os
 * padrões da v2.4) — o que o motor e os testes usam. Produção não importa mais esta constante: o
 * vigente do código é CRITERIA_PARAMS_CODIGO (criteriaParamsCodigo.ts).
 */
import {
  criteriaParamsSchema,
  type CriteriaParams,
  type CriteriaParamsEntrada,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';

const REND = {
  id: 'rend',
  rotulo: 'Rendimento/cota crescente',
  definicao: 'Rendimento por cota no ano maior que o do ano anterior em todos os anos da janela',
  tipo: 'up',
  serie: 'rendCota',
  formato: 'n2',
  unidade: 'R$',
} as const;

const VP = {
  id: 'vp',
  rotulo: 'VP/cota crescente',
  definicao:
    'Valor patrimonial por cota no fim do ano maior que o do ano anterior em todos os anos da janela',
  tipo: 'up',
  serie: 'vpCota',
  formato: 'n2',
  unidade: 'R$',
} as const;

const MES = {
  id: 'mes',
  rotulo: 'Rendimento todos os meses',
  definicao: 'Rendimento pago em todos os meses da janela',
  tipo: 'months',
  serie: 'mesesRendimento',
  formato: 'n',
} as const;

const RES = {
  id: 'res',
  rotulo: 'Resultado crescente',
  definicao: 'Resultado do fundo no ano maior que o do ano anterior em todos os anos da janela',
  tipo: 'up',
  serie: 'resultadoFii',
  formato: 'n',
  unidade: 'R$ mi',
} as const;

export const CRITERIA_PARAMS_V1_JSON = {
  versao: 1,
  descricao:
    'v1 = spec v2.4 §4.1 (screen.js) + D2/D3/D4 e recomendações 3 e 4 de 13/10/2026 ' +
    '(docs/analise-ativos/v2-filtros/decisoes.md)',
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
        serie: 'receita',
        formato: 'n',
        unidade: 'R$ mi',
      },
      {
        id: 'luc',
        rotulo: 'Lucro crescente',
        definicao:
          'Lucro líquido maior que o do ano anterior em todos os anos da janela. A CVM não publica o lucro sem itens não recorrentes; o critério usa o lucro líquido dos controladores',
        tipo: 'up',
        serie: 'lucroLiquido',
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
          'Margem líquida (lucro líquido dos controladores ÷ receita líquida) acima de zero em todos os anos da janela',
        tipo: 'pos',
        serie: 'margemLiquida',
        formato: '%',
      },
      {
        id: 'dl',
        rotulo: 'Dív. líq./EBITDA ≤ 3×',
        definicao:
          'Dívida líquida até 3 vezes o EBITDA em todos os anos da janela (caixa líquido conta como dentro do limite)',
        tipo: 'max',
        serie: 'dlEbitda',
        limite: 3,
        formato: 'x',
      },
      {
        id: 'fcl',
        rotulo: 'FCL crescente',
        definicao:
          'Fluxo de caixa livre (FCO − CAPEX) maior que o do ano anterior em todos os anos da janela',
        tipo: 'up',
        serie: 'fcl',
        formato: 'n',
        unidade: 'R$ mi',
      },
    ],
    acao_financeira: {
      base: 'acao',
      naoSeAplica: ['ebitda', 'dl', 'fcl'],
      regraPerfil: 'ehFinanceira_universo',
    },
    fii_tijolo: [
      REND,
      VP,
      {
        id: 'vac',
        rotulo: 'Vacância ≤ 10%',
        definicao: 'Vacância física até 10% em todos os anos da janela',
        tipo: 'max',
        serie: 'vacancia',
        limite: 10,
        formato: '%',
        ativo: false,
        motivoInativo: 'sem_fonte_confiavel',
      },
      {
        id: 'alav',
        rotulo: 'Obrigações/PL ≤ 20%',
        definicao:
          'Obrigações do fundo (passivo menos rendimentos a distribuir) até 20% do patrimônio líquido em todos os anos da janela',
        tipo: 'max',
        serie: 'obrigacoesPl',
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
        serie: 'inadimplencia',
        limite: 3,
        formato: '%',
        ativo: false,
        motivoInativo: 'sem_fonte_confiavel',
      },
      {
        id: 'ltv',
        rotulo: 'LTV ≤ 60%',
        definicao:
          'LTV médio dos CRIs (saldo devedor ÷ valor da garantia) até 60% em todos os anos da janela',
        tipo: 'max',
        serie: 'ltv',
        limite: 60,
        formato: '%',
        ativo: false,
        motivoInativo: 'sem_fonte_confiavel',
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
} satisfies CriteriaParamsEntrada;

/** v1 validada (nomes canônicos + padrões da v2.4): dlEbitda → net_debt_ebitda etc. */
export const CRITERIA_PARAMS_V1: CriteriaParams =
  criteriaParamsSchema.parse(CRITERIA_PARAMS_V1_JSON);
