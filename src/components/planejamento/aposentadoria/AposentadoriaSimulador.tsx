'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { calc } from '@/services/planejamento/aposentadoria';
import {
  usePlanoAposentadoria,
  useAposentadoriaDefaults,
  useSavePlano,
  useUpsertEntry,
  useDeleteEntry,
  type PlanoUpsertPayload,
  type AposentadoriaPlanoDTO,
} from '@/hooks/useAposentadoria';
import LeftPanel from './LeftPanel';
import ProjecaoTab from './tabs/ProjecaoTab';
import AcompanhamentoTab from './tabs/AcompanhamentoTab';
import EvolucaoTab from './tabs/EvolucaoTab';

type TabValue = 'proj' | 'track' | 'evol';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'proj', label: '📊 Projeção' },
  { value: 'track', label: '📅 Acompanhamento' },
  { value: 'evol', label: '📈 Evolução' },
];

const AUTOSAVE_DELAY = 800;

function planoToParams(p: AposentadoriaPlanoDTO): PlanoUpsertPayload {
  return {
    idade: p.idade,
    apos: p.apos,
    vida: p.vida,
    rentNom: p.rentNom,
    inflacao: p.inflacao,
    rentNomRetiro: p.rentNomRetiro,
    patrimonio: p.patrimonio,
    aporteM: p.aporteM,
    renda: p.renda,
    trackStartMonth: p.trackStartMonth,
    trackStartYear: p.trackStartYear,
    eventos: p.eventos,
  };
}

/**
 * Simulador de Aposentadoria — container.
 *
 * Mantém os parâmetros do plano em estado local (pra projeção reativa enquanto
 * os sliders se movem) e persiste no backend com autosave debounced. Os
 * registros mensais (entries) vêm do plano carregado e são mutados via API.
 */
export default function AposentadoriaSimulador() {
  const { plano, loading } = usePlanoAposentadoria();
  const { data: defaults } = useAposentadoriaDefaults(!loading && plano === null);
  const savePlano = useSavePlano();
  const upsertEntry = useUpsertEntry();
  const deleteEntry = useDeleteEntry();

  const [params, setParams] = useState<PlanoUpsertPayload | null>(null);
  const [tab, setTab] = useState<TabValue>('proj');
  const [savedTick, setSavedTick] = useState(false);
  const seededRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed inicial: do plano salvo, ou dos defaults (com fallback do protótipo).
  useEffect(() => {
    if (seededRef.current || loading) return;
    if (plano) {
      setParams(planoToParams(plano));
      seededRef.current = true;
    } else if (defaults !== undefined || plano === null) {
      const now = new Date();
      setParams({
        idade: 30,
        apos: 65,
        vida: 90,
        rentNom: defaults?.rentNom ?? 12,
        inflacao: defaults?.inflacao ?? 5,
        rentNomRetiro: null,
        patrimonio: defaults?.patrimonio && defaults.patrimonio > 0 ? defaults.patrimonio : 10000,
        aporteM: 1000,
        renda: 5000,
        trackStartMonth: now.getMonth() + 1,
        trackStartYear: now.getFullYear(),
        eventos: [],
      });
      if (defaults !== undefined) seededRef.current = true;
    }
  }, [plano, defaults, loading]);

  // Autosave debounced sempre que os parâmetros mudam (após o seed).
  const scheduleSave = useCallback(
    (next: PlanoUpsertPayload) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        savePlano.mutate(next, { onSuccess: () => setSavedTick(true) });
      }, AUTOSAVE_DELAY);
    },
    [savePlano],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (patch: Partial<PlanoUpsertPayload>) => {
      setParams((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        setSavedTick(false);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const projection = useMemo(() => (params ? calc(params) : null), [params]);

  const handleSaveEntry = useCallback(
    async (off: number, aporteReal: number, patFinal: number) => {
      if (!params) return;
      // Garante que o plano existe/está atualizado antes de anexar o entry.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      await savePlano.mutateAsync(params);
      await upsertEntry.mutateAsync({ off, aporteReal, patFinal });
    },
    [params, savePlano, upsertEntry],
  );

  const handleDeleteEntry = useCallback(
    async (off: number) => {
      if (!window.confirm('Remover este registro?')) return;
      await deleteEntry.mutateAsync(off);
    },
    [deleteEntry],
  );

  if (loading || !params) {
    return <LoadingSpinner size="lg" text="Carregando simulador..." />;
  }

  const entries = plano?.entries ?? [];
  const mutating = savePlano.isPending || upsertEntry.isPending || deleteEntry.isPending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
            Planejamento de Aposentadoria
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Projete sua acumulação e acompanhe mês a mês. Valores em R$ de hoje.
          </p>
        </div>
        <span className="text-xs text-gray-400">
          {savePlano.isPending ? 'Salvando…' : savedTick ? '✔ Salvo' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Painel esquerdo */}
        <aside className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <LeftPanel params={params} onChange={handleChange} />
        </aside>

        {/* Área direita */}
        <div className="min-w-0">
          <div className="mb-4 border-b border-gray-200 dark:border-gray-800">
            <nav className="-mb-px flex flex-wrap gap-1">
              {TABS.map((t) => {
                const isActive = t.value === tab;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                    aria-pressed={isActive}
                  >
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {tab === 'proj' ? <ProjecaoTab params={params} projection={projection} /> : null}
          {tab === 'track' ? (
            <AcompanhamentoTab
              params={params}
              entries={entries}
              onSaveEntry={handleSaveEntry}
              onDeleteEntry={handleDeleteEntry}
              saving={mutating}
            />
          ) : null}
          {tab === 'evol' ? <EvolucaoTab params={params} entries={entries} /> : null}
        </div>
      </div>
    </div>
  );
}
