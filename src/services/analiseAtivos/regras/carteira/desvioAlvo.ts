/**
 * STUB da fatia 0 — CORPO da fatia C1 (caso 33). Desvio da posição em relação ao alvo planejado,
 * com posição, alvo e desvio na MESMA base: o valor da ABA (rec. 1; % dentro de Ações/FIIs).
 *   posicaoPct = valorPosicao ÷ valorBaseAba × 100
 *   alvoValor  = alvoPct% × valorBaseAba;  alvoQtd = alvoValor ÷ preco (arredondado para baixo)
 *   desvioPp   = posicaoPct − alvoPct (negativo = abaixo do alvo); desvioValor/desvioQtd idem
 * Sem alvo (alvoPct null) ⇒ campos de alvo/desvio null. Texto em TEXTOS_CRITERIOS.desvio (nunca
 * "faltam"). Assinatura FINAL.
 */
import type { EntradaDesvioAlvo, ResultadoDesvioAlvo } from '@/types/analiseAtivosCriterios';

export function desvioAlvo(_entrada: EntradaDesvioAlvo): ResultadoDesvioAlvo {
  throw new Error('desvioAlvo: não implementado (fatia C1)');
}
