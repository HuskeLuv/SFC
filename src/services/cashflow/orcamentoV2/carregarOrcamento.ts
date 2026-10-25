/**
 * Carrega os dados do Orçamento v2 para o dono dos dados e chama a montagem pura (desenho técnico
 * §6.2): árvore mesclada do ano (`getMergedCashflowGroups`, que já traz `isGeral`/`orcamentoFixa`/
 * `icone`), orçados do ano (+ dez do ano anterior para o "Copiar de"), prefs e receita prevista.
 *
 * Não chama `computeInvestimentosPorMes`: Investimentos fica fora do Orçamento (D12).
 */
import { prisma } from '@/lib/prisma';
import type { HojeSP } from '@/lib/orcamento/regras';
import type { FonteOrcamento, OrcamentoV2Response, VisaoOrcamento } from '@/types/orcamentoV2';
import { getMergedCashflowGroups } from '../getCashflowTree';
import { montarOrcamentoV2, type OrcadoRow, type PrefsRow } from './montarOrcamento';
import { receitaPrevistaPorMes } from './receitaPrevista';

export interface ParamsOrcamentoV2 {
  ano: number;
  /** 0–11. */
  mes0: number;
  visao: VisaoOrcamento;
  /** Ausente = a fonte salva nas prefs (padrão 'lancado'). */
  fonte?: FonteOrcamento;
}

/**
 * "Hoje" em America/Sao_Paulo (UTC−3 fixo, sem horário de verão desde 2019) — mesmo critério de
 * `orcamentoAlertas`.
 */
export function hojeEmSaoPaulo(agora: Date): HojeSP {
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return { ano: brt.getUTCFullYear(), mes0: brt.getUTCMonth(), dia: brt.getUTCDate() };
}

const numeroOuNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

const fonteValida = (f: string | null | undefined): FonteOrcamento | null =>
  f === 'lancado' || f === 'consolidado' ? f : null;

export async function carregarOrcamentoV2(
  userId: string,
  params: ParamsOrcamentoV2,
  agora: Date,
): Promise<OrcamentoV2Response> {
  const { ano, mes0, visao } = params;

  const [arvore, orcadosRows, prefsRow] = await Promise.all([
    getMergedCashflowGroups(userId, ano),
    prisma.cashflowOrcamentoItem.findMany({
      where: { userId, OR: [{ ano }, { ano: ano - 1, mes: 11 }] },
      select: { itemId: true, ano: true, mes: true, valor: true, pct: true },
    }),
    prisma.cashflowOrcamentoPrefs.findUnique({
      where: { userId },
      select: {
        categoriasRecolhidas: true,
        graficoVisivel: true,
        fonte: true,
        estruturaCriadaEm: true,
        avisoGeralVistoEm: true,
      },
    }),
  ]);

  const receitaPorMes = await receitaPrevistaPorMes(userId, ano, arvore);

  const orcados: OrcadoRow[] = orcadosRows.map((r) => ({
    itemId: r.itemId,
    ano: r.ano,
    mes: r.mes,
    valor: numeroOuNull(r.valor),
    pct: numeroOuNull(r.pct),
  }));
  const prefs: PrefsRow | null = prefsRow
    ? {
        categoriasRecolhidas: prefsRow.categoriasRecolhidas,
        graficoVisivel: prefsRow.graficoVisivel,
        estruturaCriadaEm: prefsRow.estruturaCriadaEm,
        avisoGeralVistoEm: prefsRow.avisoGeralVistoEm,
      }
    : null;

  return montarOrcamentoV2({
    arvore,
    orcados,
    receitaPorMes,
    ano,
    mes0,
    visao,
    fonte: params.fonte ?? fonteValida(prefsRow?.fonte) ?? 'lancado',
    hojeSP: hojeEmSaoPaulo(agora),
    prefs,
    atualizadoEm: agora,
  });
}
