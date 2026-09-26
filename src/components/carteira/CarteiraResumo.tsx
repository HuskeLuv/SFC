'use client';
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import AlocacaoAtivosTable from './AlocacaoAtivosTable';
import LineChartCarteiraHistorico from '@/components/charts/line/LineChartCarteiraHistorico';
import PieChartCarteiraInvestimentos from '@/components/charts/pie/PieChartCarteiraInvestimentos';
import ComponentCard from '@/components/common/ComponentCard';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MarketIndicatorsCards from './MarketIndicatorsCards';
import CaixaParaInvestirCard from '@/components/carteira/shared/CaixaParaInvestirCard';
import MetricCard from '@/components/carteira/shared/MetricCard';
import { CARD_HERO_VALUE_CLASS } from '@/components/carteira/shared/cardStyles';
import { DownloadIcon, PlusIcon } from '@/icons';
import { useReservaEmergencia } from '@/hooks/useReservaEmergencia';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useCarteiraResumoContext } from '@/context/CarteiraResumoContext';
import { useAlocacaoConfig } from '@/hooks/useAlocacaoConfig';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { useCarteiraLaunch } from './CarteiraLaunchContext';
import ClassePickerSheet from './ClassePickerSheet';
import {
  CARTEIRA_ABA_PARAM,
  CARTEIRA_CLASS_TABS,
  DEFAULT_CARTEIRA_CLASS_TAB,
  parseCarteiraAba,
  useReplaceCarteiraAba,
} from './carteiraTabsConfig';

// PWA fase 1: as tabelas de classe baixam só quando a aba abre (o Resumo leva só a Alocação).
const ReservaEmergenciaTable = lazy(() => import('./ReservaEmergenciaTable'));
const RendaFixaTable = lazy(() => import('./RendaFixaTable'));
const ReservaOportunidadeTable = lazy(() => import('./ReservaOportunidadeTable'));
const FimFiaTable = lazy(() => import('./FimFiaTable'));
const FiiTable = lazy(() => import('./FiiTable'));
const AcoesTable = lazy(() => import('./AcoesTable'));
const StocksTable = lazy(() => import('./StocksTable'));
const ReitTable = lazy(() => import('./ReitTable'));
const EtfTable = lazy(() => import('./EtfTable'));
const MoedasCriptosTable = lazy(() => import('./MoedasCriptosTable'));
const PrevidenciaSegurosTable = lazy(() => import('./PrevidenciaSegurosTable'));
const OpcoesTable = lazy(() => import('./OpcoesTable'));
const ImoveisBensTable = lazy(() => import('./ImoveisBensTable'));

interface TabContentProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}

const TabContent: React.FC<TabContentProps> = ({ isActive, children }) => {
  const isBelowLg = useIsBelowLg();
  if (!isActive) return null;
  // Suspense por aba: a tabela é lazy (o chunk baixa na 1ª abertura).
  return (
    <div className={isBelowLg ? undefined : 'pt-6'}>
      <Suspense fallback={<LoadingSpinner text="Carregando..." />}>{children}</Suspense>
    </div>
  );
};

/** Reserva de Emergência: o fetch da reserva só acontece com a aba aberta (antes era no topo). */
function ReservaEmergenciaTab({ totalCarteira }: { totalCarteira: number }) {
  const { data: reservaEmergenciaData } = useReservaEmergencia();
  return (
    <ReservaEmergenciaTable
      ativos={reservaEmergenciaData.ativos}
      saldoInicioMes={reservaEmergenciaData.saldoInicioMes}
      rendimento={reservaEmergenciaData.rendimento}
      rentabilidade={reservaEmergenciaData.rentabilidade}
      totalCarteira={totalCarteira}
    />
  );
}

const ListIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/** Cartão das seções do Resumo no celular. */
const MobileSection = ({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

// Marca de performance (build de produção): 1ª renderização do Resumo com dados na página.
let resumoProntoMarcado = false;

// Componente para páginas em branco das outras tabs
const BlankPage: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
        <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded"></div>
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          Esta seção está em desenvolvimento. Em breve você poderá visualizar e gerenciar seus
          investimentos em {title.toLowerCase()}.
        </p>
      </div>
    </div>
  );
};

const tabs = CARTEIRA_CLASS_TABS;

export default function CarteiraResumo() {
  // Aba na URL (/carteira?aba=acoes): lida na montagem (validada contra a lista) e trocada com
  // replace a cada toque.
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_CARTEIRA_CLASS_TAB;
    const aba = parseCarteiraAba(
      new URLSearchParams(window.location.search).get(CARTEIRA_ABA_PARAM),
    );
    return aba?.main === 'resumo' ? aba.tab : DEFAULT_CARTEIRA_CLASS_TAB;
  });
  const [isClassPickerOpen, setIsClassPickerOpen] = useState(false);
  const isBelowLg = useIsBelowLg();
  const launch = useCarteiraLaunch();
  const replaceAba = useReplaceCarteiraAba();
  const { resumo, formatCurrency, updateCaixaParaInvestir, distribuirCaixaLivre } =
    useCarteiraResumoContext();
  const alocacaoConfig = useAlocacaoConfig();

  const handleTabChange = useCallback(
    (id: string) => {
      setActiveTab(id);
      replaceAba(id);
    },
    [replaceAba],
  );

  useEffect(() => {
    if (resumoProntoMarcado || typeof performance === 'undefined') return;
    resumoProntoMarcado = true;
    performance.mark?.('mf:carteira:resumo-pronto');
  }, []);

  // Denominador ÚNICO de "Carteira Total" (decisão jul/2026): usar
  // `resumo.totais.dinheiro` do backend — patrimônio líquido investível
  // (posições valoradas + caixas por aba + caixa consolidado, SEM
  // imóveis/bens) — a MESMA base da tabela de alocação, da pizza e da
  // necessidade de aporte (CarteiraTabs). Antes as colunas "Risco por Ativo
  // (Carteira Total)" usavam `resumo.saldoBruto` (sem caixas), então "% Atual"
  // e "Risco (Carteira Total)" nunca fechavam na mesma tela.
  // Para Imóveis & Bens o risco usa `totais.dinheiroMaisBens` (base COM os
  // próprios imóveis, igual ao % da linha imoveisBens na alocação) — com a
  // base líquida um imóvel maior que a carteira saturava em 100%.
  // Fallback para payload cacheado antigo sem `totais`.
  const carteiraTotal = resumo?.totais?.dinheiro ?? resumo?.saldoBruto ?? 0;
  const carteiraTotalComBens = resumo?.totais?.dinheiroMaisBens ?? carteiraTotal;

  // Patrimônio líquido = ativos (dinheiro+bens) − dívidas ativas. Card só
  // aparece quando há dívida cadastrada; valor é live (snapshots da série
  // seguem asset-only). Saldo corrigido pelo índice realizado no backend.
  const totalDividas = resumo?.totais?.dividas ?? 0;
  const patrimonioLiquido = resumo?.totais?.patrimonioLiquido ?? carteiraTotalComBens;

  const openAdd = () => launch?.openAdd();
  const openRedeem = () => launch?.openRedeem();

  const patrimonioLiquidoCard =
    totalDividas > 0 ? (
      <div
        key="patrimonio-liquido-resumo"
        title="Ativos (dinheiro + bens) menos o saldo devedor das dívidas ativas, corrigido pelo índice realizado. Valor ao vivo — o histórico de patrimônio segue só com ativos."
      >
        <MetricCard
          title="Patrimônio Líquido"
          value={formatCurrency(patrimonioLiquido)}
          color={patrimonioLiquido >= 0 ? 'primary' : 'error'}
          change={`${formatCurrency(totalDividas)} em dívidas`}
          changeDirection="neutral"
        />
      </div>
    ) : null;

  const alocacaoTable = (
    <AlocacaoAtivosTable
      distribuicao={resumo.distribuicao}
      alocacaoConfig={alocacaoConfig}
      // Só o caixa LIVRE abate a necessidade de aporte: as reservas por aba
      // já estão dentro do valor de cada categoria.
      caixaParaInvestir={Math.max(0, resumo.caixa?.livre ?? resumo.caixaParaInvestir ?? 0)}
      totais={resumo.totais}
      onNavigateToTab={handleTabChange}
      onDistribuirCaixa={distribuirCaixaLivre}
    />
  );

  const caixaCard = (
    <CaixaParaInvestirCard
      key="caixa-para-investir-resumo"
      value={resumo.caixaParaInvestir ?? 0}
      formatCurrency={formatCurrency}
      onSave={updateCaixaParaInvestir}
      color="success"
      escopo="total"
    />
  );

  // Carteira Consolidada no celular (PWA fase 1): coluna única — Carteira total, histórico, Caixa,
  // mercado 2x2, pizza (legenda embaixo) e a Alocação em cartões. Mesmos componentes e valores.
  const consolidadaMobile = (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Carteira total"
        className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-gray-500 dark:text-gray-400">
          Carteira total
        </p>
        <p className={`${CARD_HERO_VALUE_CLASS} text-gray-900 dark:text-white`}>
          {formatCurrency(carteiraTotal)}
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <dt className="text-xs text-gray-500 dark:text-gray-400">Valor aplicado</dt>
            <dd className="text-[15px] font-semibold tabular-nums text-gray-800 dark:text-white/90">
              {formatCurrency(resumo.valorAplicado)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-gray-500 dark:text-gray-400">Saldo bruto</dt>
            <dd className="text-[15px] font-semibold tabular-nums text-gray-800 dark:text-white/90">
              {formatCurrency(resumo.saldoBruto)}
            </dd>
          </div>
        </dl>
      </section>

      <MobileSection title="Histórico de patrimônio">
        <LineChartCarteiraHistorico data={resumo.historicoPatrimonio} />
      </MobileSection>

      {caixaCard}
      {patrimonioLiquidoCard}

      <div className="flex flex-col gap-2">
        <h2 className="px-1 text-base font-semibold text-gray-800 dark:text-white/90">
          Mercado hoje
        </h2>
        <MarketIndicatorsCards />
      </div>

      <MobileSection
        title="Tipos de investimento"
        aside={
          <span className="text-[12.5px] text-gray-500 dark:text-gray-400">% da carteira</span>
        }
      >
        <PieChartCarteiraInvestimentos distribuicao={resumo.distribuicao} />
      </MobileSection>

      {alocacaoTable}
    </div>
  );

  const consolidadaDesktop = (
    <div className="space-y-4">
      {/* Grid de Gráficos */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <ComponentCard title="Histórico de Patrimônio">
            <LineChartCarteiraHistorico data={resumo.historicoPatrimonio} />
          </ComponentCard>
        </div>
        <div className="xl:col-span-4">
          <ComponentCard title="Tipos de Investimento">
            <PieChartCarteiraInvestimentos distribuicao={resumo.distribuicao} />
          </ComponentCard>
        </div>
      </div>

      {/* Tabela de Alocação de Ativos */}
      <MarketIndicatorsCards
        extraCards={[caixaCard, ...(patrimonioLiquidoCard ? [patrimonioLiquidoCard] : [])]}
      />
      {alocacaoTable}
    </div>
  );

  const tabContents = (
    <>
      {/* Carteira Consolidada */}
      <TabContent id="consolidada" isActive={activeTab === 'consolidada'}>
        {isBelowLg ? consolidadaMobile : consolidadaDesktop}
      </TabContent>

      {/* Reserva de Emergência */}
      <TabContent id="reserva-emergencia" isActive={activeTab === 'reserva-emergencia'}>
        <ReservaEmergenciaTab totalCarteira={carteiraTotal} />
      </TabContent>

      {/* Reserva de Oportunidade */}
      <TabContent id="reserva-oportunidade" isActive={activeTab === 'reserva-oportunidade'}>
        <ReservaOportunidadeTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* Renda Fixa */}
      <TabContent id="renda-fixa" isActive={activeTab === 'renda-fixa'}>
        <RendaFixaTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* FIM/FIA */}
      <TabContent id="fim-fia" isActive={activeTab === 'fim-fia'}>
        <FimFiaTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* FIIs */}
      <TabContent id="fiis" isActive={activeTab === 'fiis'}>
        <FiiTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* Ações */}
      <TabContent id="acoes" isActive={activeTab === 'acoes'}>
        <AcoesTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* Stocks */}
      <TabContent id="stocks" isActive={activeTab === 'stocks'}>
        <StocksTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* REIT */}
      <TabContent id="reit" isActive={activeTab === 'reit'}>
        <ReitTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* ETF's */}
      <TabContent id="etf" isActive={activeTab === 'etf'}>
        <EtfTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* Moedas, Criptomoedas & Outros */}
      <TabContent id="moedas-criptos" isActive={activeTab === 'moedas-criptos'}>
        <MoedasCriptosTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* Previdência e Seguros */}
      <TabContent id="previdencia" isActive={activeTab === 'previdencia'}>
        <PrevidenciaSegurosTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* Opções */}
      <TabContent id="opcoes" isActive={activeTab === 'opcoes'}>
        <OpcoesTable totalCarteira={carteiraTotal} />
      </TabContent>

      {/* Imóveis & Bens */}
      <TabContent id="imoveis" isActive={activeTab === 'imoveis'}>
        <ImoveisBensTable totalCarteira={carteiraTotalComBens} />
      </TabContent>
    </>
  );

  if (isBelowLg) {
    // Celular: o título, o segmentado e o + Lançar ficam no CarteiraTabs; aqui o trilho de
    // classes gruda logo abaixo do segmentado (52px), com "Todas" fixo à esquerda.
    const mobileTabs = tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      muted: tab.categoria !== null && (resumo.distribuicao[tab.categoria]?.valor ?? 0) <= 0,
    }));
    return (
      <div>
        <div className="sticky top-[calc(var(--mf-header-h,0px)+52px)] z-10 -mx-4 flex items-center gap-2 bg-gray-50 py-1 pl-4 dark:bg-gray-900">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setIsClassPickerOpen(true)}
            className={`${TABLE_MOBILE_STYLES.chip} gap-1.5 font-medium`}
          >
            <ListIcon />
            Todas
          </button>
          <div className="min-w-0 flex-1">
            <ResponsiveTabNav
              tabs={mobileTabs}
              activeId={activeTab}
              onChange={handleTabChange}
              ariaLabel="Classes de ativo"
              variant="underline"
              className="mx-0 px-1 [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]"
            />
          </div>
        </div>

        <div className="pt-3">{tabContents}</div>

        <ClassePickerSheet
          isOpen={isClassPickerOpen}
          onClose={() => setIsClassPickerOpen(false)}
          activeId={activeTab}
          onSelect={handleTabChange}
          distribuicao={resumo.distribuicao}
          totalDinheiro={carteiraTotal}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header com botão de adicionar investimento */}
      <div className="mb-6 flex items-center justify-between max-lg:flex-wrap max-lg:gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Carteira de Investimentos
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Gerencie e acompanhe seus investimentos por categoria
          </p>
        </div>
        <div className="flex items-center gap-2 max-lg:flex-wrap">
          <button
            onClick={openAdd}
            className="flex items-center space-x-2 rounded-lg bg-brand-500 px-4 py-2 text-white transition-colors hover:bg-brand-600"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Adicionar Investimento</span>
          </button>
          <button
            onClick={openRedeem}
            className="flex items-center space-x-2 rounded-lg bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-800"
          >
            <DownloadIcon className="h-4 w-4" />
            <span>Resgatar Investimento</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-6 dark:border-gray-800">
          <ResponsiveTabNav
            tabs={tabs}
            activeId={activeTab}
            onChange={handleTabChange}
            ariaLabel="Classes de ativo"
            variant="underline"
          />
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {tabContents}

          {/* Outras tabs - páginas em branco */}
          {tabs
            .slice(2)
            .filter(
              (tab) =>
                tab.id !== 'renda-fixa' &&
                tab.id !== 'reserva-oportunidade' &&
                tab.id !== 'fim-fia' &&
                tab.id !== 'fiis' &&
                tab.id !== 'acoes' &&
                tab.id !== 'stocks' &&
                tab.id !== 'reit' &&
                tab.id !== 'etf' &&
                tab.id !== 'moedas-criptos' &&
                tab.id !== 'previdencia' &&
                tab.id !== 'opcoes' &&
                tab.id !== 'imoveis',
            )
            .map((tab) => (
              <TabContent key={tab.id} id={tab.id} isActive={activeTab === tab.id}>
                <BlankPage title={tab.label} />
              </TabContent>
            ))}
        </div>
      </div>
    </div>
  );
}
