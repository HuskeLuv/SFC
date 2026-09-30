/**
 * Helpers dos três estados (regra 1): ok | ausente | nao_se_aplica.
 *
 * Ausente ≠ zero ≠ "não se aplica". Zero é `ok(0)`. Nunca comparar null com número: no protótipo um
 * papel sem dados atendia 5/5 porque `null <= 1` é true em JS. Todo número que entra numa regra passa
 * por `deNumero` e toda comparação é feita só sobre `ok`.
 */
import type { MotivoAusente, MotivoNaoSeAplica, Valor } from '@/services/analiseAtivos/tipos';

export function ok<T>(valor: T): Valor<T> {
  return { estado: 'ok', valor };
}

export function ausente(motivo: MotivoAusente, detalhe?: string): Valor<never> {
  return detalhe === undefined
    ? { estado: 'ausente', motivo }
    : { estado: 'ausente', motivo, detalhe };
}

export function naoSeAplica(motivo: MotivoNaoSeAplica, detalhe?: string): Valor<never> {
  return detalhe === undefined
    ? { estado: 'nao_se_aplica', motivo }
    : { estado: 'nao_se_aplica', motivo, detalhe };
}

export function ehOk<T>(v: Valor<T>): v is { estado: 'ok'; valor: T } {
  return v.estado === 'ok';
}

export function valorOuNull<T>(v: Valor<T>): T | null {
  return v.estado === 'ok' ? v.valor : null;
}

/** null/undefined/NaN/±Infinity ⇒ ausente; 0 ⇒ ok(0). */
export function deNumero(
  n: number | null | undefined,
  motivo: MotivoAusente = 'sem_dado_fonte',
): Valor<number> {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ausente(motivo);
  return ok(n);
}

export function mapearValor<T, U>(v: Valor<T>, f: (x: T) => U): Valor<U> {
  return v.estado === 'ok' ? ok(f(v.valor)) : v;
}

/** Combina dois valores. "Não se aplica" vence "ausente" (o critério some da conta, não vira zero). */
export function combinar<A, B, C>(a: Valor<A>, b: Valor<B>, f: (a: A, b: B) => C): Valor<C> {
  if (a.estado === 'nao_se_aplica') return a;
  if (b.estado === 'nao_se_aplica') return b;
  if (a.estado === 'ausente') return a;
  if (b.estado === 'ausente') return b;
  return ok(f(a.valor, b.valor));
}
