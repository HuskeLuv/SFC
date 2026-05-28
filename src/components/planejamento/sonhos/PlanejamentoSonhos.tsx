'use client';

import { useCallback, useMemo, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useObjetivos, type PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import SonhosDashboard from './SonhosDashboard';
import SonhosObjetivoDetail from './SonhosObjetivoDetail';
import SonhosRegistrarMesModal from './SonhosRegistrarMesModal';

type View = { type: 'dashboard' } | { type: 'detail'; id: string };

/**
 * Container raiz: orquestra views (dashboard / detail) e modal de registrar mês.
 *
 * Criação e edição de objetivos são INLINE (dashboard pra criar, detail pra
 * editar) — não há mais view dedicada de form, pra UX mais direta como o
 * HTML original.
 */
export default function PlanejamentoSonhos() {
  const { objetivos, loading, error } = useObjetivos();
  const [view, setView] = useState<View>({ type: 'dashboard' });
  const [registrarMesObjId, setRegistrarMesObjId] = useState<string | null>(null);

  const goDashboard = useCallback(() => setView({ type: 'dashboard' }), []);
  const goDetail = useCallback((id: string) => setView({ type: 'detail', id }), []);

  const selectedObjetivo: PlanejamentoObjetivoDTO | null = useMemo(() => {
    if (view.type === 'detail') {
      return objetivos.find((g) => g.id === view.id) ?? null;
    }
    return null;
  }, [objetivos, view]);

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
    content = <SonhosDashboard objetivos={objetivos} onSelectObjetivo={goDetail} />;
  } else if (view.type === 'detail') {
    if (!selectedObjetivo) {
      content = <SonhosDashboard objetivos={objetivos} onSelectObjetivo={goDetail} />;
    } else {
      content = (
        <SonhosObjetivoDetail
          objetivo={selectedObjetivo}
          onBack={goDashboard}
          onDeleted={goDashboard}
          onRegistrarMes={() => setRegistrarMesObjId(selectedObjetivo.id)}
        />
      );
    }
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
