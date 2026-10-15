/**
 * Desvio da posição em relação ao alvo planejado (fatia C1, caso 33), com posição, alvo e desvio na
 * MESMA base (`valorBase`). v2.5: a base passa a ser a carteira TOTAL (caso 33; a fatia C troca os
 * chamadores, que até lá passam o valor da aba).
 *   posicaoPct  = valorPosicao ÷ valorBase × 100
 *   alvoValor   = alvoPct% × valorBase;  alvoQtd = alvoValor ÷ preco (arredondado para baixo)
 *   desvioPp    = posicaoPct − alvoPct (negativo = abaixo do alvo)
 *   desvioValor = valorPosicao − alvoValor;  desvioQtd = desvioValor ÷ preco (truncado para zero)
 * Sem alvo (alvoPct null) ⇒ campos de alvo/desvio null; sem preço ⇒ quantidades null; base zerada
 * ⇒ posicaoPct 0 e valores do alvo 0. O texto vem de TEXTOS_CRITERIOS.desvio (nunca "faltam").
 * Função pura.
 */
import type { EntradaDesvioAlvo, ResultadoDesvioAlvo } from '@/types/analiseAtivosCriterios';

/** Folga contra o ruído do ponto flutuante nas divisões que viram quantidade inteira. */
const EPS = 1e-9;

const semMenosZero = (v: number): number => (Object.is(v, -0) ? 0 : v);

export function desvioAlvo({
  valorPosicao,
  valorBase,
  alvoPct,
  preco,
}: EntradaDesvioAlvo): ResultadoDesvioAlvo {
  const base = Number.isFinite(valorBase) && valorBase > 0 ? valorBase : 0;
  const posicao = Number.isFinite(valorPosicao) && valorPosicao > 0 ? valorPosicao : 0;
  const posicaoPct = base > 0 ? (posicao / base) * 100 : 0;

  if (alvoPct === null || !Number.isFinite(alvoPct)) {
    return {
      posicaoPct,
      alvoValor: null,
      alvoQtd: null,
      desvioPp: null,
      desvioValor: null,
      desvioQtd: null,
    };
  }

  const temPreco = preco !== null && Number.isFinite(preco) && preco > 0;
  const alvoValor = (alvoPct / 100) * base;
  const desvioValor = posicao - alvoValor;
  return {
    posicaoPct,
    alvoValor,
    alvoQtd: temPreco ? Math.floor(alvoValor / (preco as number) + EPS) : null,
    desvioPp: posicaoPct - alvoPct,
    desvioValor,
    desvioQtd: temPreco
      ? semMenosZero(Math.trunc(desvioValor / (preco as number) + Math.sign(desvioValor) * EPS))
      : null,
  };
}
