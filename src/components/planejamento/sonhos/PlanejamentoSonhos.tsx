'use client';

import { useCallback, useMemo, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useObjetivos, type PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import SonhosDashboard from './SonhosDashboard';
import SonhosObjetivoDetail from './SonhosObjetivoDetail';
import SonhosObjetivoForm from './SonhosObjetivoForm';
import SonhosRegistrarMesModal from './SonhosRegistrarMesModal';

type View =
  | { type: 'dashboard' }
  | { type: 'detail'; id: string }
  | { type: 'new' }
  | { type: 'edit'; id: string };

/**
 * Container raiz: orquestra views (dashboard / detail / form) e modal de
 * registrar mês. Estado de navegação fica no client; sem rotas filhas pra
 * evitar refactor de routes/middlewares — toda navegação é interna.
 */
export default function PlanejamentoSonhos() {
  const { objetivos, loading, error } = useObjetivos();
  const [view, setView] = useState<View>({ type: 'dashboard' });
  const [registrarMesObjId, setRegistrarMesObjId] = useState<string | null>(null);

  const goDashboard = useCallback(() => setView({ type: 'dashboard' }), []);
  const goDetail = useCallback((id: string) => setView({ type: 'detail', id }), []);
  const goNew = useCallback(() => setView({ type: 'new' }), []);
  const goEdit = useCallback((id: string) => setView({ type: 'edit', id }), []);

  const selectedObjetivo: PlanejamentoObjetivoDTO | null = useMemo(() => {
    if (view.type === 'detail' || view.type === 'edit') {
      return objetivos.find((g) => g.id === view.id) ?? null;
    }
    return null;
  }, [objetivos, view]);

  // Modal de registrar mês — usa id dedicado pra não acoplar com o view atual
  const registrarMesObjetivo = useMemo(
    () => (registrarMesObjId ? (objetivos.find((g) => g.id === registrarMesObjId) ?? null) : null),
    [objetivos, registrarMesObjId],
  );

  if (loading) {
    return <LoadingSpinner size="lg" text="Carregando objetivos..." />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  let content: React.ReactNode = null;
  if (view.type === 'dashboard') {
    content = <SonhosDashboard objetivos={objetivos} onSelectObjetivo={goDetail} onNew={goNew} />;
  } else if (view.type === 'detail') {
    if (!selectedObjetivo) {
      // Objetivo sumiu (deleção concorrente, refetch). Volta pro dashboard.
      content = <SonhosDashboard objetivos={objetivos} onSelectObjetivo={goDetail} onNew={goNew} />;
    } else {
      content = (
        <SonhosObjetivoDetail
          objetivo={selectedObjetivo}
          onBack={goDashboard}
          onEdit={() => goEdit(selectedObjetivo.id)}
          onRegistrarMes={() => setRegistrarMesObjId(selectedObjetivo.id)}
        />
      );
    }
  } else if (view.type === 'new' || view.type === 'edit') {
    const editing = view.type === 'edit' ? selectedObjetivo : null;
    content = (
      <SonhosObjetivoForm
        objetivo={editing}
        onCancel={() => (editing ? goDetail(editing.id) : goDashboard())}
        onSaved={(id) => goDetail(id)}
        onDeleted={goDashboard}
      />
    );
  }

  return (
    <div>
      {content}
      {registrarMesObjetivo ? (
        <SonhosRegistrarMesModal
          objetivo={registrarMesObjetivo}
          isOpen={true}
          onClose={() => setRegistrarMesObjId(null)}
        />
      ) : null}
    </div>
  );
}
