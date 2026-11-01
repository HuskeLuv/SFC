import React from 'react';
import { ConteudoSensivel } from '@/components/common/valores/Sensivel';
import type { SensibilidadeValor } from '@/utils/valoresOcultos';

interface IRSummaryCardProps {
  label: string;
  value: string;
  subtext?: React.ReactNode;
  color?: string;
  highlight?: boolean;
  /**
   * Esconder valores: como `value` reage ao olho. 'auto' (padrão) esconde só o que tem R$/US$;
   * 'visivel' para regra pública (ex.: limite de isenção). O `subtext` em texto esconde só os R$.
   */
  valor?: SensibilidadeValor;
}

export default function IRSummaryCard({
  label,
  value,
  subtext,
  color,
  highlight,
  valor = 'auto',
}: IRSummaryCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 max-lg:p-4 ${
        highlight
          ? 'border-brand-200 bg-brand-50/50 dark:border-brand-900/40 dark:bg-brand-900/10'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold max-lg:text-xl max-lg:break-words ${color ?? 'text-gray-900 dark:text-white'}`}
      >
        <ConteudoSensivel modo={valor}>{value}</ConteudoSensivel>
      </p>
      {subtext && (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          <ConteudoSensivel>{subtext}</ConteudoSensivel>
        </p>
      )}
    </div>
  );
}
