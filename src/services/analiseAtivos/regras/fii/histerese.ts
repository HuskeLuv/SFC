/**
 * Histerese do tipo de FII (regra 23, decisão 9): o tipo vigente só troca depois de N meses
 * SEGUIDOS (params.fiiTipo.mesesHisterese = 3) com o mesmo tipo novo pela composição. Override
 * manual (FiiTipoOverride) vence sempre. Função pura.
 *
 * - Sem vigente anterior (1º mês do fundo): o vigente nasce com o tipo do mês.
 * - 'indefinido' no mês (composição ausente/PL ≤ 0) não derruba um vigente definido: conta como
 *   mais um mês "diferente", como qualquer outro tipo, e só vira vigente após N meses seguidos.
 * - Lacuna de mês no histórico quebra a sequência (meses precisam ser consecutivos).
 */
import type { FiiTipo, ScoringParams } from '@/services/analiseAtivos/tipos';

export interface MesTipo {
  refMonth: string; // 'AAAA-MM-01'
  tipoComposicao: FiiTipo;
}

export function mesAnterior(refMonth: string): string {
  const [a, m] = refMonth.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * @param historico meses em ordem crescente; o ÚLTIMO é o mês que está sendo decidido.
 * @param vigenteAnterior tipo vigente do mês anterior ao último (null = fundo novo).
 */
export function aplicarHisterese(
  historico: MesTipo[],
  vigenteAnterior: FiiTipo | null,
  override: FiiTipo | null,
  p: ScoringParams,
): { tipoVigente: FiiTipo; mudouEm: string | null } {
  if (historico.length === 0) {
    throw new Error('aplicarHisterese: histórico vazio');
  }
  const atual = historico[historico.length - 1];
  if (override) {
    return {
      tipoVigente: override,
      mudouEm: override !== vigenteAnterior ? atual.refMonth : null,
    };
  }
  if (vigenteAnterior === null) return { tipoVigente: atual.tipoComposicao, mudouEm: null };
  if (atual.tipoComposicao === vigenteAnterior) {
    return { tipoVigente: vigenteAnterior, mudouEm: null };
  }

  const n = p.fiiTipo.mesesHisterese;
  let seguidos = 1;
  for (let i = historico.length - 2; i >= 0 && seguidos < n; i--) {
    const esperado = mesAnterior(historico[i + 1].refMonth);
    if (historico[i].refMonth !== esperado) break;
    if (historico[i].tipoComposicao !== atual.tipoComposicao) break;
    seguidos++;
  }
  if (seguidos >= n) return { tipoVigente: atual.tipoComposicao, mudouEm: atual.refMonth };
  return { tipoVigente: vigenteAnterior, mudouEm: null };
}
