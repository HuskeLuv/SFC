'use client';

import React from 'react';
import { MobilePageState } from '@/components/ui/mobile/MobilePageState';

/**
 * Carregando da Saúde Financeira no celular (PWA fase 3): o esqueleto já tem a forma do Status,
 * dos 4 números do fluxo e das metas. O desktop continua com o spinner de hoje.
 */

const BAR = 'animate-pulse rounded bg-gray-100 dark:bg-white/5';
const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]';

export default function SaudeSkeleton() {
  return (
    <MobilePageState
      kind="loading"
      busyLabel="Calculando sua saúde financeira"
      skeleton={
        <div className="space-y-4" aria-hidden="true">
          <div className={`${CARD} space-y-3`}>
            <div className={`${BAR} h-3.5 w-2/5`} />
            <div className={`${BAR} h-7 w-3/5`} />
            <div className={`${BAR} h-1.5 w-full`} />
            <div className={`${BAR} h-11 w-full`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`${CARD} space-y-2 px-3.5 py-3`}>
                <div className={`${BAR} h-3 w-3/4`} />
                <div className={`${BAR} h-5 w-1/2`} />
              </div>
            ))}
          </div>
          <div className={`${CARD} space-y-3`}>
            <div className={`${BAR} h-3.5 w-1/2`} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`${BAR} h-2 w-full`} />
            ))}
          </div>
        </div>
      }
    />
  );
}
