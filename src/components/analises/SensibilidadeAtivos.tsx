'use client';
import React from 'react';
import ComponentCard from '@/components/common/ComponentCard';

interface SensibilidadeItem {
  ticker: string;
  nome: string;
  beta: number;
}

interface SensibilidadeAtivosProps {
  data: SensibilidadeItem[];
}

function betaColor(beta: number): string {
  if (beta > 1.5) return 'bg-error-500';
  if (beta > 1) return 'bg-warning-500';
  if (beta > 0.5) return 'bg-brand-500';
  return 'bg-success-500';
}

export default function SensibilidadeAtivos({ data }: SensibilidadeAtivosProps) {
  const maxBeta = data.length > 0 ? Math.max(...data.map((d) => d.beta), 1) : 1;

  return (
    <ComponentCard title="Sensibilidade ao Mercado (Beta)">
      <div className="space-y-4">
        {/* Asset list */}
        <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
          {data.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              Nenhum ativo com dados de beta disponível.
            </div>
          ) : (
            <div className="space-y-4">
              {data.map((item) => {
                const barWidth = Math.max(5, (item.beta / maxBeta) * 100);
                return (
                  <div key={item.ticker}>
                    {/* Asset name + beta value */}
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.ticker} - {item.nome}
                      </span>
                      <span className="text-sm font-semibold text-[#465FFF]">
                        {item.beta.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                    {/* Bar */}
                    <div className="relative h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-800">
                      <div
                        className={`absolute left-0 h-full rounded-full transition-all ${betaColor(item.beta)}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ComponentCard>
  );
}
