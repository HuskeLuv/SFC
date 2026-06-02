'use client';

import MetricCard from '@/components/carteira/shared/MetricCard';
import type { ProjecaoResult } from '@/services/planejamento/aposentadoria';
import type { PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import { formatBRL, formatBRLCompact } from '../utils';
import ProjecaoChart from '../charts/ProjecaoChart';

interface ProjecaoTabProps {
  params: PlanoUpsertPayload;
  projection: ProjecaoResult | null;
}

export default function ProjecaoTab({ params, projection }: ProjecaoTabProps) {
  if (!projection) {
    return (
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
        ⚠ A expectativa de vida deve ser maior que a idade de aposentadoria.
      </div>
    );
  }

  const { Pr, sacPres, sacCons, idadeAcaba, isNow } = projection;
  const diff = sacCons - sacPres;
  const nuncaAcaba = !Number.isFinite(idadeAcaba) || idadeAcaba > 110;

  const p1 = isNow
    ? `Patrimônio atual de ${formatBRL(Pr)} disponível agora.`
    : `Aos seus ${params.apos} anos você atingiria ${formatBRL(Pr)} em R$ de hoje.`;
  const p2 = `Preservando como herança: ${formatBRL(sacPres)}/mês.`;
  const p3 = `Consumindo até ${params.vida} anos: ${formatBRL(sacCons)}/mês (+${formatBRLCompact(diff)}/mês vs preservar).`;
  const p4 =
    params.renda > 0
      ? nuncaAcaba
        ? `Renda desejada de ${formatBRL(params.renda)}/mês: o patrimônio nunca se esgota.`
        : `Renda desejada de ${formatBRL(params.renda)}/mês: dura até ${idadeAcaba.toFixed(0)} anos.`
      : '';

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">
          Análise do cenário
        </p>
        <h3 className="mb-1.5 text-lg font-semibold text-gray-900 dark:text-white/90">
          O que isso significa?
        </h3>
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {p1} {p2} {p3}
          {p4 ? ` ${p4}` : ''}
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          title={
            isNow ? 'Patrimônio disponível agora' : `Patrimônio acumulado aos ${params.apos} anos`
          }
          value={formatBRLCompact(Pr)}
          color="primary"
          change="em R$ de hoje"
        />
        <MetricCard
          title="Saque preservando patrimônio"
          value={`${formatBRLCompact(sacPres)}/mês`}
          color="success"
          change={diff > 0 ? `+${formatBRLCompact(diff)}/mês consumindo` : 'herança intacta'}
        />
        <MetricCard
          title={`Saque consumindo até ${params.vida} anos`}
          value={`${formatBRLCompact(sacCons)}/mês`}
          color="primary"
          change={`${params.vida - params.apos} anos de aposentadoria`}
        />
        <MetricCard
          title="Renda desejada dura até"
          value={nuncaAcaba ? '∞ Nunca acaba' : `${idadeAcaba.toFixed(1).replace('.', ',')} anos`}
          color={nuncaAcaba ? 'success' : 'warning'}
          change={
            nuncaAcaba
              ? 'juros cobrem a renda'
              : `${(idadeAcaba - params.apos).toFixed(1).replace('.', ',')} anos de apos.`
          }
        />
      </div>

      {/* Gráfico */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500">
          Patrimônio — R$ de hoje (real)
        </p>
        <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white/90">
          Valor do patrimônio
        </h3>
        <ProjecaoChart data={projection} apos={params.apos} vida={params.vida} />
      </div>
    </div>
  );
}
