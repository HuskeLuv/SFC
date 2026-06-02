'use client';

import { useMemo } from 'react';
import {
  planTraj,
  revisedTraj,
  off2date,
  entryByOff,
  prevPat,
  calcRent,
  maxEOff,
  nomM,
  type AposentadoriaEntry,
} from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload, AposentadoriaEntryDTO } from '@/hooks/useAposentadoria';
import { fMonth } from '../utils';
import EvolucaoPatrimonioChart from '../charts/EvolucaoPatrimonioChart';
import EvolucaoAportesChart from '../charts/EvolucaoAportesChart';
import EvolucaoRentChart from '../charts/EvolucaoRentChart';

interface EvolucaoTabProps {
  params: PlanoUpsertPayload;
  entries: AposentadoriaEntryDTO[];
}

function ChartCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">{eyebrow}</p>
      <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white/90">{title}</h3>
      {children}
    </div>
  );
}

export default function EvolucaoTab({ params, entries }: EvolucaoTabProps) {
  const svcEntries = entries as AposentadoriaEntry[];
  const { T, C, retM } = useMemo(() => planTraj(params), [params]);
  const maxOff = maxEOff(svcEntries);
  const reqRentM = nomM(params) * 100;

  // ── Patrimônio: planejado / realizado / revisado ──
  const patrimonio = useMemo(() => {
    const showMax = retM + 12;
    const currPat = entryByOff(svcEntries, maxOff)?.patFinal ?? params.patrimonio;
    const RT = revisedTraj(params, currPat, maxOff);

    const categories: string[] = [];
    const planejado: number[] = [];
    const realizado: (number | null)[] = new Array(showMax + 1).fill(null);
    const revisado: (number | null)[] = new Array(showMax + 1).fill(null);

    for (let off = 0; off <= showMax; off++) {
      const { year, month } = off2date(params, off);
      categories.push(fMonth(month, year));
      planejado.push(T[off] ?? 0);
    }
    realizado[0] = params.patrimonio;
    svcEntries.forEach((e) => {
      if (e.off <= showMax) realizado[e.off] = e.patFinal;
    });
    RT.forEach((v, i) => {
      if (maxOff + i <= showMax) revisado[maxOff + i] = v;
    });

    return { categories, planejado, realizado, revisado, retIndex: retM, hojeIndex: maxOff };
  }, [params, svcEntries, T, retM, maxOff]);

  // ── Aportes: projetado vs realizado (só meses registrados) ──
  const aportes = useMemo(() => {
    const categories: string[] = [];
    const projetado: number[] = [];
    const realizado: number[] = [];
    svcEntries.forEach((e) => {
      categories.push(fMonth(e.month, e.year));
      projetado.push(C[e.off] ?? 0);
      realizado.push(e.aporteReal);
    });
    return { categories, projetado, realizado };
  }, [svcEntries, C]);

  // ── Rentabilidade realizada vs meta ──
  const rentabilidade = useMemo(() => {
    const categories: string[] = [];
    const rent: number[] = [];
    svcEntries.forEach((e) => {
      const p = prevPat(params, svcEntries, e.off);
      const r = p != null ? calcRent(p, e.aporteReal, e.patFinal) : null;
      if (r != null) {
        categories.push(fMonth(e.month, e.year));
        rent.push(r);
      }
    });
    return { categories, rent };
  }, [params, svcEntries]);

  const hasEntries = entries.length > 0;
  const hasRent = rentabilidade.rent.length > 0;

  return (
    <div className="space-y-4">
      <ChartCard eyebrow="Evolução patrimonial" title="Planejado vs Realizado">
        <EvolucaoPatrimonioChart {...patrimonio} />
      </ChartCard>

      <ChartCard eyebrow="Aportes mensais" title="Projetado vs Realizado">
        {hasEntries ? (
          <EvolucaoAportesChart {...aportes} />
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            Registre meses no Acompanhamento para ver este gráfico.
          </p>
        )}
      </ChartCard>

      <ChartCard eyebrow="Rentabilidade mensal" title="Realizada vs Meta">
        {hasRent ? (
          <EvolucaoRentChart {...rentabilidade} meta={reqRentM} />
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            Registre meses no Acompanhamento para ver este gráfico.
          </p>
        )}
      </ChartCard>
    </div>
  );
}
