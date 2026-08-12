'use client';

import { useCallback, useMemo, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useDividas, type DividaDTO } from '@/hooks/useDividas';
import DividasDashboard from './DividasDashboard';
import DividaDetail from './DividaDetail';
import DividaRegistrarPagamentoModal from './DividaRegistrarPagamentoModal';

type View = { type: 'dashboard' } | { type: 'detail'; id: string };

/**
 * Container raiz de Dívidas: orquestra views (dashboard / detail) e o modal
 * de registrar pagamento. Criação e edição são inline (mesmo padrão de
 * Planejamento Sonhos).
 */
export default function DividasRoot() {
  const { dividas, loading, error } = useDividas();
  const [view, setView] = useState<View>({ type: 'dashboard' });
  const [pagamentoDividaId, setPagamentoDividaId] = useState<string | null>(null);

  const goDashboard = useCallback(() => setView({ type: 'dashboard' }), []);
  const goDetail = useCallback((id: string) => setView({ type: 'detail', id }), []);

  const selected: DividaDTO | null = useMemo(() => {
    if (view.type === 'detail') return dividas.find((d) => d.id === view.id) ?? null;
    return null;
  }, [dividas, view]);

  const pagamentoDivida = useMemo(
    () => (pagamentoDividaId ? (dividas.find((d) => d.id === pagamentoDividaId) ?? null) : null),
    [dividas, pagamentoDividaId],
  );

  if (loading) {
    return <LoadingSpinner size="lg" text="Carregando dívidas..." />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div>
      {view.type === 'detail' && selected ? (
        <DividaDetail
          divida={selected}
          onBack={goDashboard}
          onDeleted={goDashboard}
          onRegistrarPagamento={() => setPagamentoDividaId(selected.id)}
        />
      ) : (
        <DividasDashboard dividas={dividas} onSelectDivida={goDetail} />
      )}
      {pagamentoDivida ? (
        <DividaRegistrarPagamentoModal
          divida={pagamentoDivida}
          isOpen={true}
          onClose={() => setPagamentoDividaId(null)}
        />
      ) : null}
    </div>
  );
}
