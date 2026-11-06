/**
 * Seção 6 (Sonhos) do Relatório financeiro. Plano Pro.
 *
 * Leitura pura de planejamentoObjetivo + entries: NUNCA chama GET /api/planejamento-sonhos (que
 * provisiona os sonhos padrão e grava no fluxo). Só sonhos com meta > 0 e não concluídos.
 *
 *  - Acumulado: saldo do último registro (progress), senão o disponível inicial.
 *  - Depósito mensal necessário: pmt; conclusão: início + prazo.
 *  - Status: sonhoRitmo (decisão 5).
 *  - Histórico: saldo no fim de cada mês (com n=1, os últimos 6 meses).
 */
import { prisma } from '@/lib/prisma';
import type { SonhoRelatorio, ValorMensal } from '@/types/relatorioFinanceiro';
import { decimalToNumber } from '@/app/api/planejamento-sonhos/_lib/serializer';
import {
  addMonths,
  pmt,
  progress,
  type PlanejamentoEntry,
  type PlanejamentoObjetivoInput,
} from '@/services/planejamento/planejamentoSonhos';
import { mesesEntre, mesesSemDeposito, sonhoRitmo } from '@/services/planejamento/sonhoRitmo';
import type { ContextoMontador } from './insumos';
import { mesesDaJanela } from './periodo';
import { MESES_HISTORICO_MINIMO } from './carteira';

const round2 = (v: number) => Math.round(v * 100) / 100;

const PRAZO: Record<string, string> = { c: 'Curto', m: 'Médio', l: 'Longo' };
const ORDEM_PRIORIDADE: Record<string, number> = { Alta: 0, Moderado: 1, Baixa: 2 };

/** Saldo no fim de cada mês: último registro até o mês, senão o disponível inicial. */
export function historicoDoSonho(
  entries: PlanejamentoEntry[],
  disponivel: number,
  meses: string[],
): ValorMensal[] {
  const ordenados = [...entries].sort((a, b) => a.month.localeCompare(b.month));
  return meses.map((mes) => {
    let saldo = disponivel;
    for (const e of ordenados) {
      if (e.month <= mes) saldo = e.balance;
      else break;
    }
    return { mes, valor: round2(saldo) };
  });
}

export async function montarSonhos(ctx: ContextoMontador): Promise<SonhoRelatorio[]> {
  const rows = await prisma.planejamentoObjetivo.findMany({
    where: { userId: ctx.userId },
    include: { entries: true },
    orderBy: { createdAt: 'asc' },
  });

  const mesCorrente = ctx.periodo.fim;
  const periodo = new Set(ctx.mesesDoPeriodo);
  const mesesHistorico = mesesDaJanela(ctx.hojeSP, Math.max(ctx.meses, MESES_HISTORICO_MINIMO));

  const sonhos = rows
    .map((r) => ({ r, target: decimalToNumber(r.target) }))
    .filter(({ r, target }) => target > 0 && r.status !== 'Concluído')
    .map(({ r, target }): SonhoRelatorio => {
      const entries: PlanejamentoEntry[] = r.entries.map((e) => ({
        month: e.month,
        aporte: decimalToNumber(e.aporte),
        balance: decimalToNumber(e.balance),
      }));
      const available = decimalToNumber(r.available);
      const objetivo: PlanejamentoObjetivoInput = {
        target,
        months: r.months,
        available,
        rate: decimalToNumber(r.rate),
        entries,
      };
      const saldo = progress(objetivo).balance;
      const inicio = r.startDate ?? r.createdAt.toISOString().slice(0, 7);
      const semAporte = mesesSemDeposito(entries, inicio, mesCorrente);
      const ritmo = sonhoRitmo({
        statusApp: r.status,
        objetivo,
        saldo,
        mesesDecorridos: mesesEntre(inicio, mesCorrente),
        mesesSemAporte: semAporte,
      });
      return {
        id: r.id,
        nome: r.name,
        prioridade: r.priority,
        prazo: PRAZO[r.category] ?? r.category,
        meta: round2(target),
        acumulado: round2(saldo),
        aporteMensal: round2(pmt(objetivo)),
        aportadoPeriodo: round2(
          entries.filter((e) => periodo.has(e.month)).reduce((s, e) => s + e.aporte, 0),
        ),
        conclusao: r.months > 0 ? addMonths(inicio, r.months) : null,
        status: ritmo.status,
        rotuloStatus: ritmo.rotulo,
        mesesSemAporte: ritmo.mesesSemAporte,
        historico: historicoDoSonho(entries, available, mesesHistorico),
      };
    });

  return sonhos.sort(
    (a, b) => (ORDEM_PRIORIDADE[a.prioridade] ?? 9) - (ORDEM_PRIORIDADE[b.prioridade] ?? 9),
  );
}
