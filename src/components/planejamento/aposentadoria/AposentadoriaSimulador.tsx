'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { calc } from '@/services/planejamento/aposentadoria';
import {
  usePlanoAposentadoria,
  useSavePlano,
  useUpsertEntry,
  useDeleteEntry,
  type PlanoUpsertPayload,
  type AposentadoriaPlanoDTO,
} from '@/hooks/useAposentadoria';
import { usePlanejamentoContexto } from '@/hooks/usePlanejamentoContexto';
import { AUTO_FIELDS, deriveAutoValues, buildAutoSyncPatch, type AutoField } from './autoFields';
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
    fieldLocks: p.fieldLocks ?? [],
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
  // Contexto financeiro (carteira + fluxo de caixa) para auto-preencher/sincronizar.
  const { contexto } = usePlanejamentoContexto(!loading);
  const savePlano = useSavePlano();
  const upsertEntry = useUpsertEntry();
  const deleteEntry = useDeleteEntry();

  const [params, setParams] = useState<PlanoUpsertPayload | null>(null);
  const [tab, setTab] = useState<TabValue>('proj');
  const [savedTick, setSavedTick] = useState(false);
  const seededRef = useRef(false);
  const resyncedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoValues = useMemo(() => deriveAutoValues(contexto), [contexto]);

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

  // Seed inicial: do plano salvo, ou do contexto (com fallback do protótipo).
  // Para um plano novo, aguardamos o contexto para já nascer auto-preenchido.
  useEffect(() => {
    if (seededRef.current || loading) return;
    if (plano) {
      setParams(planoToParams(plano));
      seededRef.current = true;
      return;
    }
    // plano === null: nasce do contexto (auto) com fallback do protótipo se
    // o contexto estiver indisponível.
    const now = new Date();
    const pick = (field: AutoField, fallback: number) => autoValues[field].autoValue ?? fallback;
    const seed: PlanoUpsertPayload = {
      idade: 30,
      apos: 65,
      vida: 90,
      rentNom: pick('rentNom', 12),
      inflacao: pick('inflacao', 5),
      rentNomRetiro: null,
      patrimonio: pick('patrimonio', 10000),
      aporteM: pick('aporteM', 1000),
      renda: pick('renda', 5000),
      trackStartMonth: now.getMonth() + 1,
      trackStartYear: now.getFullYear(),
      eventos: [],
      // Tudo nasce auto (sem locks): o usuário trava ao editar.
      fieldLocks: [],
    };
    setParams(seed);
    seededRef.current = true;
    // Persiste o seed para o plano existir (o autosave normal só dispara em edição).
    if (contexto) scheduleSave(seed);
  }, [plano, contexto, autoValues, loading, scheduleSave]);

  // Re-sincroniza (uma vez) os campos auto NÃO travados de um plano existente
  // com o contexto ao vivo — patrimônio/sobra/CDI mudam entre sessões.
  useEffect(() => {
    if (resyncedRef.current) return;
    if (!plano || !contexto || !seededRef.current) return;
    setParams((prev) => {
      if (!prev) return prev;
      const patch = buildAutoSyncPatch(prev, autoValues, prev.fieldLocks);
      resyncedRef.current = true;
      if (Object.keys(patch).length === 0) return prev;
      const next = { ...prev, ...patch };
      scheduleSave(next);
      return next;
    });
  }, [plano, contexto, autoValues, scheduleSave]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Edição do usuário: trava (lock) os campos auto presentes no patch.
  const handleChange = useCallback(
    (patch: Partial<PlanoUpsertPayload>) => {
      setParams((prev) => {
        if (!prev) return prev;
        const touchedAuto = (Object.keys(patch) as AutoField[]).filter((k) =>
          (AUTO_FIELDS as readonly string[]).includes(k),
        );
        const fieldLocks = touchedAuto.length
          ? Array.from(new Set([...prev.fieldLocks, ...touchedAuto]))
          : prev.fieldLocks;
        const next = { ...prev, ...patch, fieldLocks };
        setSavedTick(false);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  // "Voltar ao automático": destrava o campo e aplica o valor do contexto.
  const handleResync = useCallback(
    (field: AutoField) => {
      const auto = autoValues[field].autoValue;
      setParams((prev) => {
        if (!prev) return prev;
        const fieldLocks = prev.fieldLocks.filter((f) => f !== field);
        const next = { ...prev, fieldLocks, ...(auto != null ? { [field]: auto } : {}) };
        setSavedTick(false);
        scheduleSave(next);
        return next;
      });
    },
    [autoValues, scheduleSave],
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
          <LeftPanel
            params={params}
            onChange={handleChange}
            autoValues={autoValues}
            onResync={handleResync}
          />
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
