/**
 * Seção 5 (Planejamento financeiro) do Relatório financeiro. Plano Pro.
 *
 * Leitura pura do plano (aposentadoriaPlano + entries). NUNCA chama GET /api/aposentadoria nem
 * sincronizarAcompanhamentoAuto (gravam): o acompanhamento é derivado em memória, como em
 * deriveAcompanhamentoEntries, só que sobre os insumos da janela.
 *
 *  - Planejado e investimento projetado: planTraj (nominal) do plano, pelo offset do mês desde o
 *    início do acompanhamento.
 *  - Realizado: registro manual do mês, senão o último snapshot do mês, senão o registro auto.
 *  - Investimento realizado: aportesMensais com as regras de vínculo do Acompanhamento (a 4a e o
 *    Resumo usam a mesma função sobre a carteira toda).
 *  - Rentabilidade do mês: TWR de portfolio_performance (difere da aba Acompanhamento).
 *  - Meta mensal = nomM(rentNom) do plano; meta de independência = calc().Pr (R$ de hoje) no mês
 *    da aposentadoria (off2date).
 */
import { prisma } from '@/lib/prisma';
import type { BlocoPlanejamento, PontoPlanejamentoRelatorio } from '@/types/relatorioFinanceiro';
import { serializePlano } from '@/app/api/aposentadoria/_lib/serializer';
import {
  calc,
  nomM,
  off2date,
  planTraj,
  type AposentadoriaPlanoInput,
} from '@/services/planejamento/aposentadoria';
import type { ContextoMontador } from './insumos';
import { mesesDaJanela } from './periodo';
import { MESES_HISTORICO_MINIMO, patrimonioInvestido, ultimoSnapshotPorMes } from './carteira';
import { twrMensal } from './carteiraAvancada';

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const chaveMes = (ano: number, mes1: number) => `${ano}-${String(mes1).padStart(2, '0')}`;

/** Offset do mês 'YYYY-MM' desde o início do acompanhamento (o 0 é o mês do início). */
export function offsetDoMes(
  s: Pick<AposentadoriaPlanoInput, 'trackStartMonth' | 'trackStartYear'>,
  mes: string,
): number {
  const [a, m] = mes.split('-').map(Number);
  return (a - s.trackStartYear) * 12 + (m - s.trackStartMonth);
}

export async function montarPlanejamento(ctx: ContextoMontador): Promise<BlocoPlanejamento> {
  const [row, base, snaps, aportes13m, perf] = await Promise.all([
    prisma.aposentadoriaPlano.findUnique({
      where: { userId: ctx.userId },
      include: { entries: true },
    }),
    ctx.insumos.saudeBase(),
    ctx.insumos.snapshots13m(),
    ctx.insumos.aportesMensais13m(),
    ctx.insumos.performance13m(),
  ]);

  const patrimonioRealizado = patrimonioInvestido(base);
  if (!row) {
    return {
      temPlano: false,
      patrimonioRealizado,
      patrimonioPlanejadoHoje: null,
      metaIndependencia: null,
      metaMensal: null,
      serie: [],
    };
  }

  const plano = serializePlano(row);
  const s: AposentadoriaPlanoInput = plano;
  const traj = planTraj(s);
  const ultimoIndice = traj.T.length - 1;

  // Com n=1 a série mostra os últimos 6 meses (o front recorta os gráficos do período).
  const meses = mesesDaJanela(ctx.hojeSP, Math.max(ctx.meses, MESES_HISTORICO_MINIMO));
  const snapPorMes = ultimoSnapshotPorMes(snaps);
  const aportePorMes = new Map(aportes13m.map((a) => [a.mes, a.valor]));
  const entryPorMes = new Map(plano.entries.map((e) => [chaveMes(e.year, e.month), e]));
  const rent = twrMensal(perf, meses);

  const serie: PontoPlanejamentoRelatorio[] = meses.map((mes, i) => {
    const off = offsetDoMes(s, mes);
    const entry = entryPorMes.get(mes);
    const snap = snapPorMes.get(mes);
    const realizado =
      entry && entry.origem === 'manual'
        ? entry.patFinal
        : snap
          ? snap.totalValue
          : entry
            ? entry.patFinal
            : null;
    return {
      mes,
      planejado: off >= 0 && off <= ultimoIndice ? round2(traj.T[off]) : null,
      realizado: realizado === null ? null : round2(realizado),
      aporteProjetado: off >= 1 && off <= ultimoIndice ? round2(traj.C[off]) : null,
      aporteRealizado: aportePorMes.has(mes) ? round2(aportePorMes.get(mes)!) : null,
      rentabilidade: rent[i],
    };
  });

  const offHoje = offsetDoMes(s, ctx.periodo.fim);
  const patrimonioPlanejadoHoje =
    offHoje < 0 ? round2(s.patrimonio) : round2(traj.T[Math.min(offHoje, ultimoIndice)]);

  const projecao = calc(s);
  const retM = Math.max(0, Math.round((s.apos - s.idade) * 12));
  const fimAcumulacao = off2date(s, retM);
  const metaIndependencia = projecao
    ? { valor: round2(projecao.Pr), mes: chaveMes(fimAcumulacao.year, fimAcumulacao.month) }
    : null;

  return {
    temPlano: true,
    patrimonioRealizado,
    patrimonioPlanejadoHoje,
    metaIndependencia,
    metaMensal: round4(nomM(s) * 100),
    serie,
  };
}
