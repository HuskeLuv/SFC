/**
 * CriteriaParams v4 — v3 IDÊNTICA, só com o critério 'alav' do fii_tijolo sobre o ATIVO TOTAL.
 * Desenho: docs/analise-ativos/fundamentei-trazer/desenho.json (item 7, fatia E) e decisão 1 do
 * Wellington de 19/10/2026 (decisoes.md): obrigações ÷ ativo ≤ 15%, rótulo "Alavancagem ≤ 15% do
 * ativo" (a spec do Pedro cita 20% do PL: avisar).
 *
 * Diferença para a v3 (todo o resto é o MESMO objeto; teste criteriaParams.test):
 *  - fii_tijolo 'alav' (MESMO id: o filtro ?c=alav, o par alav↔ltv e o "n de 6" continuam):
 *    série leverage_assets_pct (fii_monthly.obrigacoesAtivoPct → asset_multiples_yearly), limite 15,
 *    definição com a nota de que outros valores a pagar podem incluir itens que não são dívida.
 *    Acima de 50% do ativo em algum ano, o resultado leva a obs 'obrigacoes_ativo_revisao'
 *    (resolverSeries). leverage_pct (obrigações ÷ PL) NÃO é redefinida: continua nas v2/v3, no
 *    Raio-X, no Valuation e nos Pares com o rótulo 'Alavancagem (% do PL)'.
 *  - fii_papel, ações, Stocks e REITs: iguais.
 * Ativação (desenho ativacao_prod): seed-criteria-params --versao=4 com validFrom no FUTURO, rodar
 * 'criterios --sem-aplicar --versao-params=4' contra a vigente e só então adiantar o validFrom. A
 * reversão é um UPDATE pontual do validFrom (o seed só insere).
 * Valores imutáveis: recalibrar = nova versão.
 */
import {
  criteriaParamsSchema,
  type CriteriaParams,
  type CriteriaParamsEntrada,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V3_JSON } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { LIMITE_ALAV_ATIVO_V4_PCT, SERIE_ALAV_ATIVO } from '@/types/analiseAtivosComplementos';

const T = TEXTOS_CRITERIOS.alavancagemAtivoV4;

/** 'alav' do fii_tijolo na v4 (obrigações ÷ ativo total). */
export const ALAV_ATIVO_V4 = {
  id: 'alav',
  rotulo: T.rotulo,
  definicao: `${T.definicao}. ${T.observacao}`,
  tipo: 'max',
  serie: SERIE_ALAV_ATIVO,
  limite: LIMITE_ALAV_ATIVO_V4_PCT,
  formato: '%',
} as const;

export const CRITERIA_PARAMS_V4_JSON = {
  ...CRITERIA_PARAMS_V3_JSON,
  versao: 4,
  descricao:
    'v4 = v3 com o critério alav do fii_tijolo sobre o ativo total (obrigações ÷ ativo ≤ 15%); ' +
    'decisão 1 do Wellington de 19/10/2026 (docs/analise-ativos/fundamentei-trazer/desenho.json)',
  perfis: {
    ...CRITERIA_PARAMS_V3_JSON.perfis,
    fii_tijolo: CRITERIA_PARAMS_V3_JSON.perfis.fii_tijolo.map((c) =>
      c.id === 'alav' ? ALAV_ATIVO_V4 : c,
    ),
  },
} satisfies CriteriaParamsEntrada;

/** v4 validada (o que o motor e as telas usam quando ela for a vigente no banco). */
export const CRITERIA_PARAMS_V4: CriteriaParams =
  criteriaParamsSchema.parse(CRITERIA_PARAMS_V4_JSON);
