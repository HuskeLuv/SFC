/**
 * Meta de renda (FII): cotas necessárias para R$ X/mês, custo à cotação de hoje e quantas faltam.
 *
 * Regra 8 do relatório da Fase A: ⌈⌉ sobre o valor ARREDONDADO a 9 casas (106 de 8.754 combinações
 * davam 1 cota a mais com Math.ceil direto: 1.700 × 12 ÷ 2,55 = 8.000 exato, e o JS dá 8.000,0000001).
 * Rendimento ≤ 0 ⇒ null ("—"), nunca Infinity.
 */
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';

export interface MetaDeRenda {
  cotas: number;
  custo: number;
  faltam: number;
}

export function metaDeRenda(
  rendaMensal: number,
  rend12m: number | null,
  cotacao: number,
  posicao: number,
  casasAntesDoTeto: number = SCORING_PARAMS_V1.valuation.metaRendaCasasAntesDoTeto,
): MetaDeRenda | null {
  if (typeof rend12m !== 'number' || !Number.isFinite(rend12m) || rend12m <= 0) return null;
  if (!Number.isFinite(rendaMensal) || rendaMensal <= 0) return null;
  if (!Number.isFinite(cotacao) || cotacao <= 0) return null;
  const cotas = Math.ceil(arredondar((rendaMensal * 12) / rend12m, casasAntesDoTeto));
  const pos = Number.isFinite(posicao) && posicao > 0 ? posicao : 0;
  return {
    cotas,
    custo: arredondar(cotas * cotacao, 2),
    faltam: Math.max(0, cotas - pos),
  };
}
