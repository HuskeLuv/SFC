/**
 * Meta de renda (FII): cotas necessárias para R$ X/mês, custo à cotação de hoje e a DIFERENÇA entre
 * a meta configurada pelo usuário e a posição atual (v2.4: 'diferenca', com sinal — positiva = a
 * posição está abaixo da meta, negativa = acima; nunca "faltam", spec §4.4).
 *
 * Regra 8 do relatório da Fase A: ⌈⌉ sobre o valor ARREDONDADO a 9 casas (106 de 8.754 combinações
 * davam 1 cota a mais com Math.ceil direto: 1.700 × 12 ÷ 2,55 = 8.000 exato, e o JS dá 8.000,0000001).
 * Rendimento ≤ 0 ⇒ null ("—"), nunca Infinity.
 */
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';

/** Casas antes do teto (⌈⌉) na conta das cotas (regra 8 da Fase A). */
export const META_RENDA_CASAS_ANTES_DO_TETO = 9;

export interface MetaDeRenda {
  cotas: number;
  custo: number;
  /** cotas da meta − cotas da posição (com sinal) */
  diferenca: number;
}

export function metaDeRenda(
  rendaMensal: number,
  rend12m: number | null,
  cotacao: number,
  posicao: number,
  casasAntesDoTeto: number = META_RENDA_CASAS_ANTES_DO_TETO,
): MetaDeRenda | null {
  if (typeof rend12m !== 'number' || !Number.isFinite(rend12m) || rend12m <= 0) return null;
  if (!Number.isFinite(rendaMensal) || rendaMensal <= 0) return null;
  if (!Number.isFinite(cotacao) || cotacao <= 0) return null;
  const cotas = Math.ceil(arredondar((rendaMensal * 12) / rend12m, casasAntesDoTeto));
  const pos = Number.isFinite(posicao) && posicao > 0 ? posicao : 0;
  return {
    cotas,
    custo: arredondar(cotas * cotacao, 2),
    diferenca: cotas - pos,
  };
}
