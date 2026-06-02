'use client';

import { useEffect, useState } from 'react';
import PlanejamentoSonhos from './sonhos/PlanejamentoSonhos';
import AposentadoriaSimulador from './aposentadoria/AposentadoriaSimulador';

type Modo = 'sonhos' | 'aposentadoria';

const MODOS: { value: Modo; label: string }[] = [
  { value: 'sonhos', label: 'Meus Sonhos' },
  { value: 'aposentadoria', label: 'Aposentadoria' },
];

/**
 * Hub de Planejamento Financeiro. Reúne duas ferramentas independentes:
 *  - "Meus Sonhos": CRUD de objetivos financeiros (F3.3).
 *  - "Aposentadoria": simulador de projeção + acompanhamento mensal.
 *
 * O modo selecionado fica na URL (?modo=) pra ser linkável e sobreviver a
 * reload, sem disparar navegação completa do Next (history.replaceState).
 */
export default function PlanejamentoFinanceiro() {
  const [modo, setModo] = useState<Modo>('sonhos');

  // Lê o modo inicial da URL no client (evita useSearchParams + Suspense).
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('modo');
    if (param === 'aposentadoria' || param === 'sonhos') setModo(param);
  }, []);

  const selectModo = (value: Modo) => {
    setModo(value);
    const url = new URL(window.location.href);
    url.searchParams.set('modo', value);
    window.history.replaceState(null, '', url.toString());
  };

  return (
    <div className="space-y-5">
      {/* Seletor de ferramenta */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]">
        {MODOS.map((m) => {
          const isActive = m.value === modo;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => selectModo(m.value)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              aria-pressed={isActive}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {modo === 'sonhos' ? <PlanejamentoSonhos /> : <AposentadoriaSimulador />}
    </div>
  );
}
