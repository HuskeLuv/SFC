'use client';
import React from 'react';
import { InfoIcon } from '@/icons';

interface ProventosKpiCardProps {
  title: string;
  bigValue: string;
  subLabel: string;
  subValue: string;
  tooltip?: string;
}

export default function ProventosKpiCard({
  title,
  bigValue,
  subLabel,
  subValue,
  tooltip,
}: ProventosKpiCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-brand-500" aria-hidden />
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        </div>
        {tooltip ? (
          <span className="text-gray-400" title={tooltip}>
            <InfoIcon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">{bigValue}</p>
      <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">{subLabel}</p>
        <p className="mt-1 text-sm font-semibold text-brand-500">{subValue}</p>
      </div>
    </div>
  );
}
