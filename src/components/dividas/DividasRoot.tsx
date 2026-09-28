'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useDividas, type DividaDTO } from '@/hooks/useDividas';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryView } from '@/hooks/useMobileHistoryView';
import DividasDashboard from './DividasDashboard';
import DividaDetail from './DividaDetail';
import DividaRegistrarPagamentoModal from './DividaRegistrarPagamentoModal';

type View = { type: 'dashboard' } | { type: 'detail'; id: string };

/**
 * Container raiz de Dívidas: orquestra views (dashboard / detail) e o modal
 * de registrar pagamento. Criação e edição são inline (mesmo padrão de
 * Planejamento Sonhos).
 *
 * PWA fase 3: no celular o detalhe é uma entrada do histórico (`?divida=id`, pushState), para o
 * voltar do Android e o gesto do iPhone voltarem à lista. No desktop continua o estado local; o
 * deep link `?divida=` (vindo da Agenda) abre o detalhe uma vez e sai da URL ao voltar para a
 * lista. Cadastro e edição no celular abrem em sheet (DividasDashboard / DividaDetail).
 */
export default function DividasRoot() {
  const { dividas, loading, error } = useDividas();
  const [view, setView] = useState<View>({ type: 'dashboard' });
  const [pagamentoDividaId, setPagamentoDividaId] = useState<string | null>(null);
  const isBelowLg = useIsBelowLg();
  const {
    value: histValue,
    open: histOpen,
    close: histClose,
  } = useMobileHistoryView('divida', isBelowLg);

  // Desktop: deep link `?divida=` abre o detalhe uma vez. Não limpa a URL aqui — na hidratação o
  // celular também passa por isBelowLg=false e o hook do celular ainda precisa ler o parâmetro.
  const deepLinkReadRef = useRef(false);
  useEffect(() => {
    if (isBelowLg || deepLinkReadRef.current) return;
    deepLinkReadRef.current = true;
    const id = new URLSearchParams(window.location.search).get('divida');
    if (id) setView({ type: 'detail', id });
  }, [isBelowLg]);

  const goDashboard = useCallback(() => {
    if (isBelowLg) {
      histClose();
      return;
    }
    setView({ type: 'dashboard' });
    const url = new URL(window.location.href);
    if (url.searchParams.has('divida')) {
      url.searchParams.delete('divida');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, [isBelowLg, histClose]);
  const goDetail = useCallback(
    (id: string) => {
      if (isBelowLg) histOpen(id);
      else setView({ type: 'detail', id });
    },
    [isBelowLg, histOpen],
  );

  const detailId = isBelowLg ? histValue : view.type === 'detail' ? view.id : null;

  // Celular: o detalhe abre no topo (a lista pode estar rolada).
  useEffect(() => {
    if (isBelowLg && histValue) window.scrollTo({ top: 0 });
  }, [isBelowLg, histValue]);

  const selected: DividaDTO | null = useMemo(() => {
    if (detailId) return dividas.find((d) => d.id === detailId) ?? null;
    return null;
  }, [dividas, detailId]);

  // O pagamento só abre a partir do detalhe: se o detalhe sai (voltar do sistema no celular
  // desempilha o `?divida=`), o sheet fecha junto em vez de ficar sobre a lista.
  useEffect(() => {
    if (!detailId) setPagamentoDividaId(null);
  }, [detailId]);

  const pagamentoDivida = useMemo(
    () =>
      pagamentoDividaId && pagamentoDividaId === detailId
        ? (dividas.find((d) => d.id === pagamentoDividaId) ?? null)
        : null,
    [dividas, pagamentoDividaId, detailId],
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
      {detailId && selected ? (
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
