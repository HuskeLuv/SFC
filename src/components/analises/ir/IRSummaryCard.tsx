import React from 'react';

interface IRSummaryCardProps {
  label: string;
  value: string;
  subtext?: string;
  color?: string;
  highlight?: boolean;
}

export default function IRSummaryCard({
  label,
  value,
  subtext,
  color,
  highlight,
}: IRSummaryCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight
          ? 'border-brand-200 bg-brand-50/50 dark:border-brand-900/40 dark:bg-brand-900/10'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${color ?? 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
      {subtext && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{subtext}</p>}
    </div>
  );
}
