'use client';
import React from 'react';
import ComponentCard from '@/components/common/ComponentCard';
import type {
  SensibilidadeBucket,
  SensibilidadeCarteiraItem,
  SensibilidadeCarteiraExcluido,
} from '@/types/analises';

interface Props {
  ativos: SensibilidadeCarteiraItem[];
  excluidos: SensibilidadeCarteiraExcluido[];
  mesesUtilizados: number;
  windowMonths: number;
}

const bucketColor: Record<SensibilidadeBucket, string> = {
  alta: 'bg-brand-500',
  media: 'bg-warning-500',
  baixa: 'bg-success-500',
  negativa: 'bg-error-500',
};

const bucketLabel: Record<SensibilidadeBucket, string> = {
  alta: 'Ofensivo',
  media: 'Moderado',
  baixa: 'Defensivo',
  negativa: 'Hedge',
};

const formatPct = (v: number): string => `${(v * 100).toFixed(1).replace('.', ',')}%`;

const formatCorrel = (v: number): string => v.toFixed(2).replace('.', ',');

export default function SensibilidadeCarteira({
  ativos,
  excluidos,
  mesesUtilizados,
  windowMonths,
}: Props) {
  return (
    <ComponentCard title="Sensibilidade à Carteira">
      <div className="space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Correlação dos retornos mensais de cada ativo com os retornos da sua carteira (janela de{' '}
          {windowMonths}m; {mesesUtilizados}m utilizados).
        </p>

        <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
          {ativos.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              Nenhum ativo com histórico suficiente (mínimo 12 meses).
            </div>
          ) : (
            <div className="space-y-4">
              {ativos.map((item) => {
                const barWidth = Math.max(4, Math.min(100, Math.abs(item.correlacao) * 100));
                return (
                  <div key={item.ticker}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {item.ticker} — {item.nome}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-[#465FFF]">
                        {formatCorrel(item.correlacao)}
                      </span>
                    </div>
                    <div className="relative h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-800">
                      <div
                        className={`absolute left-0 h-full rounded-full transition-all ${bucketColor[item.bucket]}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{bucketLabel[item.bucket]}</span>
                      <span>Contribuição ao risco: {formatPct(item.contribuicaoRisco)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {excluidos.length > 0 && (
          <div className="border-t border-gray-100 pt-3 dark:border-gray-800">
            <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
              Ativos com histórico insuficiente
            </p>
            <ul className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
              {excluidos.map((e) => (
                <li key={e.ticker} className="flex items-center justify-between">
                  <span className="truncate">
                    {e.ticker} — {e.nome}
                  </span>
                  <span className="shrink-0">{e.mesesDisponiveis}m disponíveis</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500">
          Renda fixa, reservas e conta-corrente não entram no cálculo.
        </p>
      </div>
    </ComponentCard>
  );
}
