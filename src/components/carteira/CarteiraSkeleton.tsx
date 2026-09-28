import React from 'react';

/**
 * Carregando a /carteira no celular (PWA fase 1): blocos com as medidas do Resumo (Carteira total,
 * histórico, mercado 2x2 e cartões), para a tela não pular quando os dados chegam. Não promete
 * velocidade — o gargalo é a /api/carteira/resumo. Só usado abaixo de lg (o desktop mantém o
 * LoadingSpinner). O brilho some com prefers-reduced-motion.
 */
const Block = ({ className = '' }: { className?: string }) => (
  <div
    className={`rounded-md bg-gray-200 motion-safe:animate-pulse dark:bg-white/[0.08] ${className}`}
  />
);

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]';

export default function CarteiraSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando a carteira"
      data-testid="carteira-skeleton"
      className="flex flex-col gap-3"
    >
      <span role="status" className="sr-only">
        Carregando a carteira…
      </span>
      {/* Segmentado Resumo | Análise + trilho de classes */}
      <Block className="h-11 rounded-xl" />
      <div className="flex gap-2 overflow-hidden">
        <Block className="h-9 w-20 shrink-0 rounded-full" />
        <Block className="h-9 w-40 shrink-0 rounded-full" />
        <Block className="h-9 w-36 shrink-0 rounded-full" />
      </div>
      {/* Carteira total */}
      <div className={`${CARD} flex flex-col gap-2.5`}>
        <Block className="h-3 w-2/5" />
        <Block className="h-8 w-3/4" />
        <div className="mt-1 grid grid-cols-2 gap-3">
          <Block className="h-7" />
          <Block className="h-7" />
        </div>
      </div>
      {/* Histórico */}
      <div className={CARD}>
        <Block className="h-3.5 w-1/2" />
        <Block className="mt-3 h-[150px] w-full" />
      </div>
      {/* Mercado 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${CARD} p-3`}>
            <Block className="h-2.5 w-1/2" />
            <Block className="mt-2 h-4 w-4/5" />
          </div>
        ))}
      </div>
      {/* Alocação */}
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${CARD} flex justify-between gap-3`}>
          <div className="flex flex-1 flex-col gap-2">
            <Block className="h-3.5 w-2/5" />
            <Block className="h-3 w-3/4" />
          </div>
          <div className="flex w-1/3 flex-col items-end gap-2">
            <Block className="h-3.5 w-full" />
            <Block className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
