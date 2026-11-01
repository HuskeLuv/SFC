'use client';

import React from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { ConteudoSensivel } from '@/components/common/valores/Sensivel';
import type { SensibilidadeValor } from '@/utils/valoresOcultos';

interface DashboardMetricCardProps {
  title: string;
  value: string | number;
  formatter?: (value: number) => string;
  subtitle?: string;
  /**
   * Esconder valores: 'auto' (padrão) esconde só o que sai com R$/US$ (contagens e % ficam);
   * 'sensivel' sempre; 'visivel' nunca.
   */
  valor?: SensibilidadeValor;
}

const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  title,
  value,
  formatter,
  subtitle,
  valor = 'auto',
}) => {
  const displayValue = typeof value === 'number' && formatter ? formatter(value) : String(value);

  return (
    <Card>
      <CardTitle>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</span>
      </CardTitle>
      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
        <ConteudoSensivel modo={valor}>{displayValue}</ConteudoSensivel>
      </p>
      {subtitle && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </Card>
  );
};

export default DashboardMetricCard;
