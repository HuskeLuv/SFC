/**
 * Receita prevista do Orçamento v2 (P2/Q2; desenho técnico §6.2), mês a mês.
 *
 * - Entradas do mês no modo **Lançado** (toda célula das seções de Entradas da árvore MESCLADA,
 *   inclusive as previstas não pintadas), sempre, independente do toggle Lançado/Consolidado:
 *   receita prevista é previsão.
 * - Mês sem entrada (> 0): média dos meses com entrada > 0 entre os 3 imediatamente anteriores,
 *   cruzando o ano (jan–mar olham out–dez do ano anterior). Só nesse caso a árvore do ano anterior
 *   é montada, com `getMergedCashflowGroups`: SQL cru contaria seções e itens ocultos (o
 *   `hideTemplateGroup` só marca `hidden`; quem tira da árvore é o merge).
 * - Nenhum dos 3 com entrada → `{valor: null, origem: 'nenhuma'}` (pct, sobra e índice ficam
 *   `null` e orçados em % valem 0, spec §12.1).
 */
import type { CashflowGroup } from '@/types/cashflow';
import type { AnoMes, OrigemReceita } from '@/types/orcamentoV2';
import { arred2 } from '@/lib/orcamento/regras';
import { getMergedCashflowGroups } from '../getCashflowTree';
import { entradasPorMes } from '../orcamentoVsReal';

export interface ReceitaMes {
  valor: number | null;
  origem: OrigemReceita;
  /** Meses (API 1–12) usados na média, do mais antigo ao mais novo; só em `media3m`. */
  mesesBase?: AnoMes[];
}

/** Quantos meses anteriores a média olha. */
export const JANELA_MEDIA_MESES = 3;

/** Entradas do Lançado por mês (0–11) da árvore mesclada. */
export function entradasLancadas(arvore: CashflowGroup[]): number[] {
  return entradasPorMes(arvore).lancado;
}

/** O fallback de jan–mar precisa do ano anterior só se algum desses meses estiver sem entrada. */
export function precisaDoAnoAnterior(entradasAno: number[]): boolean {
  return entradasAno.slice(0, JANELA_MEDIA_MESES).some((v) => !(v > 0));
}

/**
 * Pura: receita de cada mês (0–11) de `ano` a partir das entradas do ano e (opcional) do ano
 * anterior. `entradasAnoAnterior` nulo = desconhecido (jan–mar sem entrada e sem base caem em
 * `nenhuma` se a janela do próprio ano também não tiver).
 */
export function calcularReceitaPrevista(
  ano: number,
  entradasAno: number[],
  entradasAnoAnterior: number[] | null,
): ReceitaMes[] {
  return Array.from({ length: 12 }, (_, m): ReceitaMes => {
    const doMes = entradasAno[m] ?? 0;
    if (doMes > 0) return { valor: arred2(doMes), origem: 'fluxo' };

    const base: { ano: number; mes: number; valor: number }[] = [];
    for (let k = JANELA_MEDIA_MESES; k >= 1; k--) {
      const idx = m - k;
      const valor = idx >= 0 ? (entradasAno[idx] ?? 0) : (entradasAnoAnterior?.[12 + idx] ?? 0);
      if (valor > 0) {
        base.push(idx >= 0 ? { ano, mes: idx + 1, valor } : { ano: ano - 1, mes: 13 + idx, valor });
      }
    }
    if (base.length === 0) return { valor: null, origem: 'nenhuma' };
    return {
      valor: arred2(base.reduce((a, b) => a + b.valor, 0) / base.length),
      origem: 'media3m',
      mesesBase: base.map(({ ano: a, mes }) => ({ ano: a, mes })),
    };
  });
}

/** Receita prevista dos 12 meses de `ano` para o dono dos dados, a partir da árvore já montada. */
export async function receitaPrevistaPorMes(
  userId: string,
  ano: number,
  arvoreAno: CashflowGroup[],
): Promise<ReceitaMes[]> {
  const entradasAno = entradasLancadas(arvoreAno);
  const entradasAnoAnterior = precisaDoAnoAnterior(entradasAno)
    ? entradasLancadas(await getMergedCashflowGroups(userId, ano - 1))
    : null;
  return calcularReceitaPrevista(ano, entradasAno, entradasAnoAnterior);
}
