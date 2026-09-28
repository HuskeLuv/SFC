'use client';
import React, { useState, lazy, Suspense, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useCarteira } from '@/hooks/useCarteira';
import { useAlocacaoConfig } from '@/hooks/useAlocacaoConfig';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { CarteiraResumoProvider } from '@/context/CarteiraResumoContext';
import type { NecessidadeAporteMap } from '@/context/CarteiraResumoContext';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import ConectarBancoCard from '@/components/conexoes/ConectarBancoCard';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import { QUICK_LAUNCH_EVENT, takePendingQuickLaunch } from '@/layout/mobile/quickLaunch';
import { CarteiraLaunchProvider, type CarteiraLaunchValue } from './CarteiraLaunchContext';
import CarteiraSkeleton from './CarteiraSkeleton';
import {
  CARTEIRA_ABA_ANALISE,
  CARTEIRA_ABA_PARAM,
  parseCarteiraAba,
  useReplaceCarteiraAba,
} from './carteiraTabsConfig';

// Lazy loading dos componentes de conteúdo
const CarteiraResumo = lazy(() => import('./CarteiraResumo'));
const CarteiraAnalise = lazy(() => import('./CarteiraAnalise'));

// Wizards sob demanda (PWA fase 1): o chunk só baixa na 1ª abertura ou no prefetch em idle.
const loadAddAssetWizard = () => import('./AddAssetWizard');
const loadRedeemAssetWizard = () => import('./RedeemAssetWizard');
const AddAssetWizard = lazy(loadAddAssetWizard);
const RedeemAssetWizard = lazy(loadRedeemAssetWizard);

interface MainTabContentProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}

const MainTabContent: React.FC<MainTabContentProps> = ({ isActive, children }) => {
  if (!isActive) return null;
  return <div>{children}</div>;
};

type MainTabId = 'resumo' | 'analise';

const mainTabs: { id: MainTabId; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'analise', label: 'Análise' },
];

/** Título da /carteira no celular (18px). No desktop ele continua no cabeçalho do Resumo. */
const MobileTitle = () => (
  <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
    Carteira de Investimentos
  </h1>
);

/** Segmentado Resumo | Análise que gruda sob o cabeçalho mobile (borda só quando grudado). */
function MobileMainNav({
  activeId,
  onChange,
}: {
  activeId: MainTabId;
  onChange: (id: string) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    // 3.5rem do cabeçalho + 1px: o sentinela sai de vista exatamente quando o nav gruda.
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      rootMargin: '-57px 0px 0px 0px',
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      <div
        data-mf-carteira-ready=""
        data-stuck={stuck ? '' : undefined}
        className={`sticky top-[var(--mf-header-h,0px)] z-20 -mx-4 border-b bg-gray-50 px-4 py-1 dark:bg-gray-900 ${
          stuck ? 'border-gray-200 dark:border-gray-800' : 'border-transparent'
        }`}
      >
        <ResponsiveTabNav
          tabs={mainTabs}
          activeId={activeId}
          onChange={onChange}
          ariaLabel="Seções da carteira"
          variant="main"
        />
      </div>
    </>
  );
}

const ErrorIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WalletIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M3 7.5A2.5 2.5 0 0 1 5.5 5h12A1.5 1.5 0 0 1 19 6.5V8M3 7.5v10A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 18.5 8H5.5A2.5 2.5 0 0 1 3 7.5Zm13.5 6.5h.01"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MOBILE_STATE_CARD =
  'mt-3 flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center dark:border-gray-800 dark:bg-white/[0.03]';
const MOBILE_STATE_ICON =
  'flex h-16 w-16 items-center justify-center rounded-full bg-mf-tranquilidade/[0.18] text-mf-seguranca dark:bg-mf-tranquilidade/[0.14] dark:text-mf-escolha';
const MOBILE_PRIMARY_BUTTON =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-mf-patrimonio px-4 text-base font-semibold text-white';

export default function CarteiraTabs() {
  const [activeMainTab, setActiveMainTab] = useState<MainTabId>('resumo');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);
  // Wizard montado só depois da 1ª abertura (o chunk lazy baixa aí ou no prefetch em idle).
  const [addMounted, setAddMounted] = useState(false);
  const [redeemMounted, setRedeemMounted] = useState(false);
  const isBelowLg = useIsBelowLg();
  const replaceAba = useReplaceCarteiraAba();
  const queryClient = useQueryClient();
  const {
    resumo,
    loading,
    error,
    formatCurrency,
    formatPercentage,
    refetch,
    updateMeta,
    updateCaixaParaInvestir,
    distribuirCaixaLivre,
    definirCaixaProventos,
  } = useCarteira();
  const alocacaoConfig = useAlocacaoConfig();

  const invalidateAssets = useCallback(() => {
    invalidatePortfolioDerivedQueries(queryClient);
  }, [queryClient]);

  const openAdd = useCallback(() => {
    setAddMounted(true);
    setIsAddOpen(true);
  }, []);
  const openRedeem = useCallback(() => {
    setRedeemMounted(true);
    setIsRedeemOpen(true);
  }, []);
  const launchValue = useMemo<CarteiraLaunchValue>(
    () => ({ openAdd, openRedeem }),
    [openAdd, openRedeem],
  );

  // Atalhos do "+ Lançar" da casca mobile: /carteira?acao=novo|resgate abre o wizard e limpa o
  // parâmetro (Voltar/refresh não reabrem). Já na Carteira, o atalho chega pelo evento
  // QUICK_LAUNCH_EVENT (o Link não remonta a página). O listener vive AQUI (e não no Resumo) para
  // funcionar também com a Análise aberta e com a carteira ainda carregando; um toque anterior à
  // montagem fica pendente e é consumido ao montar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const acao = params.get('acao');
    const pending = takePendingQuickLaunch();
    if (acao === 'novo' || acao === 'resgate') {
      if (acao === 'novo') openAdd();
      else openRedeem();
      params.delete('acao');
      const qs = params.toString();
      window.history.replaceState(
        null,
        '',
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      );
    } else if (pending === 'novo-ativo') openAdd();
    else if (pending === 'resgate') openRedeem();

    // Aba na URL (/carteira?aba=analise): lida na montagem e validada contra a lista.
    if (parseCarteiraAba(params.get(CARTEIRA_ABA_PARAM))?.main === 'analise') {
      setActiveMainTab('analise');
    }

    const onQuickLaunch = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      takePendingQuickLaunch(); // tratado aqui: não reabrir numa montagem futura
      if (id === 'novo-ativo') openAdd();
      else if (id === 'resgate') openRedeem();
    };
    window.addEventListener(QUICK_LAUNCH_EVENT, onQuickLaunch);
    return () => window.removeEventListener(QUICK_LAUNCH_EVENT, onQuickLaunch);
  }, [openAdd, openRedeem]);

  // Prefetch dos wizards quando o navegador fica ocioso depois de a carteira carregar.
  const hasResumo = !!resumo;
  useEffect(() => {
    if (!hasResumo) return;
    const prefetch = () => {
      void loadAddAssetWizard();
      void loadRedeemAssetWizard();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 8000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(prefetch, 3000);
    return () => window.clearTimeout(timer);
  }, [hasResumo]);

  const handleMainTabChange = useCallback(
    (id: string) => {
      const next: MainTabId = id === 'analise' ? 'analise' : 'resumo';
      setActiveMainTab(next);
      // O Resumo reescreve a aba de classe ao montar; a Análise é gravada aqui.
      replaceAba(next === 'analise' ? CARTEIRA_ABA_ANALISE : '');
    },
    [replaceAba],
  );

  const necessidadeAporteMap = useMemo<NecessidadeAporteMap>(() => {
    if (!resumo) return {};
    // Denominador único do backend (dinheiro, sem imóveis) — o mesmo da tabela
    // de alocação e da pizza. A soma local antiga incluía imóveis, então o
    // card da aba e a coluna da tabela pediam aportes diferentes. Fallback
    // local só para resposta cacheada antiga sem `totais`.
    const totalCarteira =
      resumo.totais?.dinheiro ??
      Object.entries(resumo.distribuicao).reduce(
        (sum, [key, item]) => (key === 'imoveisBens' ? sum : sum + item.valor),
        0,
      );
    if (totalCarteira <= 0) return {};
    const targetMap = alocacaoConfig.configuracoes.reduce<Record<string, number>>((acc, config) => {
      acc[config.categoria] = config.target;
      return acc;
    }, {});
    return Object.entries(resumo.distribuicao).reduce<NecessidadeAporteMap>(
      (acc, [categoria, info]) => {
        const targetPercentual = targetMap[categoria];
        if (targetPercentual === undefined) {
          acc[categoria] = 0;
          return acc;
        }
        const percentualAtual = totalCarteira > 0 ? (info.valor / totalCarteira) * 100 : 0;
        const diferenca = targetPercentual - percentualAtual;
        const necessidade = diferenca > 0 ? (diferenca / 100) * totalCarteira : 0;
        acc[categoria] = Number.isFinite(necessidade) ? necessidade : 0;
        return acc;
      },
      {},
    );
  }, [resumo, alocacaoConfig.configuracoes]);

  const providerValue = useMemo(
    () =>
      resumo
        ? {
            resumo,
            loading,
            error,
            formatCurrency,
            formatPercentage,
            updateMeta,
            updateCaixaParaInvestir,
            distribuirCaixaLivre,
            definirCaixaProventos,
            refetch,
            necessidadeAporteMap,
            isAlocacaoLoading: alocacaoConfig.loading,
            invalidateAssets,
          }
        : null,
    [
      resumo,
      loading,
      error,
      formatCurrency,
      formatPercentage,
      updateMeta,
      updateCaixaParaInvestir,
      distribuirCaixaLivre,
      definirCaixaProventos,
      refetch,
      necessidadeAporteMap,
      alocacaoConfig.loading,
      invalidateAssets,
    ],
  );

  const renderContent = () => {
    if (loading) {
      return isBelowLg ? (
        <CarteiraSkeleton />
      ) : (
        <LoadingSpinner text="Carregando dados da carteira..." />
      );
    }

    if (error) {
      if (isBelowLg) {
        return (
          <div role="alert" className={MOBILE_STATE_CARD}>
            <span className={MOBILE_STATE_ICON}>
              <ErrorIcon />
            </span>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Não deu para carregar a carteira
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              A conexão caiu no meio do caminho. Seus dados estão salvos; tente de novo quando o
              sinal voltar.
            </p>
            <button type="button" onClick={() => void refetch()} className={MOBILE_PRIMARY_BUTTON}>
              Tentar de novo
            </button>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
              Erro ao carregar dados
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
          </div>
        </div>
      );
    }

    if (!resumo || !providerValue) {
      if (isBelowLg) {
        return (
          <div className={MOBILE_STATE_CARD}>
            <span className={MOBILE_STATE_ICON}>
              <WalletIcon />
            </span>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Sua carteira ainda está vazia
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Cadastre o primeiro investimento para ver patrimônio, rentabilidade e alocação por
              classe.
            </p>
            <button type="button" onClick={openAdd} className={MOBILE_PRIMARY_BUTTON}>
              Adicionar investimento
            </button>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Nenhum dado encontrado
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Adicione seus primeiros investimentos para começar a acompanhar sua carteira.
            </p>
          </div>
        </div>
      );
    }

    return (
      <CarteiraResumoProvider value={providerValue}>
        <div>
          {isBelowLg && <MobileTitle />}

          {/* Entrada do Open Finance (só sem banco conectado e com a integração ligada). */}
          <ConectarBancoCard contexto="carteira" className="mb-4" />

          {/* Main Tabs Navigation */}
          {isBelowLg ? (
            <MobileMainNav activeId={activeMainTab} onChange={handleMainTabChange} />
          ) : (
            <div className="mb-6" data-mf-carteira-ready="">
              <div className="border-b border-gray-200 dark:border-gray-800">
                <ResponsiveTabNav
                  tabs={mainTabs}
                  activeId={activeMainTab}
                  onChange={handleMainTabChange}
                  ariaLabel="Seções da carteira"
                  variant="main"
                />
              </div>
            </div>
          )}

          {/* Main Tab Content with Lazy Loading */}
          <div>
            <MainTabContent id="resumo" isActive={activeMainTab === 'resumo'}>
              <Suspense fallback={<LoadingSpinner text="Carregando resumo da carteira..." />}>
                <CarteiraResumo />
              </Suspense>
            </MainTabContent>

            <MainTabContent id="analise" isActive={activeMainTab === 'analise'}>
              <Suspense fallback={<LoadingSpinner text="Carregando análises..." />}>
                <CarteiraAnalise />
              </Suspense>
            </MainTabContent>
          </div>
        </div>
      </CarteiraResumoProvider>
    );
  };

  return (
    <CarteiraLaunchProvider value={launchValue}>
      {renderContent()}

      {/* Wizards (lazy): montados na 1ª abertura, fora dos estados da página — abrem com a
          Análise aberta, com a carteira carregando e a partir do vazio. O sucesso invalida tudo
          que deriva da carteira (resumo, abas, reservas). */}
      <Suspense fallback={null}>
        {addMounted && (
          <AddAssetWizard
            isOpen={isAddOpen}
            onClose={() => setIsAddOpen(false)}
            onSuccess={invalidateAssets}
          />
        )}
        {redeemMounted && (
          <RedeemAssetWizard
            isOpen={isRedeemOpen}
            onClose={() => setIsRedeemOpen(false)}
            onSuccess={invalidateAssets}
          />
        )}
      </Suspense>
    </CarteiraLaunchProvider>
  );
}
