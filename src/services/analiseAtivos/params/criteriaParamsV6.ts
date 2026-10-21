/**
 * CriteriaParams v6 — v5 com duas regras mais próximas do Fundamentei (decisão do Wellington de
 * 21/10/2026, a partir do HAR de 19/10; só a regra, nunca valores de terceiros).
 *
 * Diferenças para a v5 (o resto é o MESMO objeto; teste criteriaParams.test):
 *  - cagr.baseNaoPositiva 'sem_dado': com o primeiro ano ≤ 0 a taxa anual não se calcula e o
 *    critério fica sem dado (a v5 contava como atendido pelo último ano). A definição dos critérios
 *    'cagr' troca a regra do fim (textosCriterios.criteriosV6.regraCagr);
 *  - fii_tijolo 'alav' (mesmo id e série): até 16,7% do ativo (LIMITE_ALAV_ATIVO_V6_PCT, os 20% do PL
 *    da spec sobre o ativo), com rótulo e definição próprios.
 * O ano fiscal fora de dezembro não é critério: muda na scoring_params v4.
 *
 * Ativação: igual à v5 (seed-criteria-params --versao=6 entra INERTE em 2099-01-01; 'criterios
 * --sem-aplicar --versao-params=6' gera o antes × depois; só então o validFrom é adiantado). A v5
 * nunca é ativada (histórico imutável). Valores imutáveis: recalibrar = nova versão.
 */
import {
  criteriaParamsSchema,
  type CriteriaParams,
  type CriteriaParamsEntrada,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V5_JSON } from '@/services/analiseAtivos/params/criteriaParamsV5';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { LIMITE_ALAV_ATIVO_V6_PCT } from '@/types/analiseAtivosCriterios';

const T5 = TEXTOS_CRITERIOS.criteriosV5;
const T6 = TEXTOS_CRITERIOS.criteriosV6;
const V5 = CRITERIA_PARAMS_V5_JSON;

/** Critério 'cagr' da v5 com a regra do fim trocada pela da v6; os outros iguais. */
function comRegraV6<C extends { tipo: string; definicao: string }>(c: C): C {
  if (c.tipo !== 'cagr') return c;
  const sufixo = `; ${T5.regraCagr}`;
  if (!c.definicao.endsWith(sufixo)) {
    throw new Error(`critério cagr sem a regra da v5: ${c.definicao}`);
  }
  return { ...c, definicao: `${c.definicao.slice(0, -sufixo.length)}; ${T6.regraCagr}` };
}

const fiiTijoloV6 = V5.perfis.fii_tijolo.map((c) =>
  c.id === 'alav'
    ? {
        ...c,
        rotulo: T6.alav.rotulo,
        definicao: `${T6.alav.definicao}. ${TEXTOS_CRITERIOS.alavancagemAtivoV4.observacao}`,
        limite: LIMITE_ALAV_ATIVO_V6_PCT,
      }
    : c,
);

export const CRITERIA_PARAMS_V6_JSON = {
  ...V5,
  versao: 6,
  descricao:
    'v6 = v5 com o crescimento anual composto "sem dado" quando o primeiro ano é negativo ou zero e ' +
    'a alavancagem do FII de tijolo até 16,7% do ativo (20% do PL da spec); decisão do Wellington ' +
    'de 21/10/2026 (mais próximo do Fundamentei)',
  perfis: {
    ...V5.perfis,
    acao: V5.perfis.acao.map(comRegraV6),
    fii_tijolo: fiiTijoloV6,
    stock: V5.perfis.stock.map(comRegraV6),
    reit: V5.perfis.reit.map(comRegraV6),
  },
  cagr: { baseNaoPositiva: 'sem_dado' },
} satisfies CriteriaParamsEntrada;

/** v6 validada (o que o motor e as telas usam quando ela for a vigente no banco). */
export const CRITERIA_PARAMS_V6: CriteriaParams =
  criteriaParamsSchema.parse(CRITERIA_PARAMS_V6_JSON);
