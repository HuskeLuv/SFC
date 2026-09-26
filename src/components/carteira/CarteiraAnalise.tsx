'use client';
import React, { Suspense, lazy, useState } from 'react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';

// Sub-abas sob demanda (PWA fase 1): só o chunk da aba aberta é baixado.
const RentabilidadeGeral = lazy(() => import('@/components/analises/RentabilidadeGeral'));
const ProventosTabs = lazy(() => import('@/components/analises/ProventosTabs'));
const RiscoRetorno = lazy(() => import('@/components/analises/RiscoRetorno'));
const CoberturaFgc = lazy(() => import('@/components/analises/CoberturaFgc'));
const IRTabs = lazy(() => import('@/components/analises/IRTabs'));

interface TabContentProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}

const TabContent: React.FC<TabContentProps> = ({ isActive, children }) => {
  if (!isActive) return null;
  return (
    <div className="pt-6 max-lg:pt-3">
      <Suspense fallback={<LoadingSpinner text="Carregando..." />}>{children}</Suspense>
    </div>
  );
};

const tabs = [
  { id: 'rentabilidade-geral', label: 'Rentabilidade Geral' },
  { id: 'proventos', label: 'Proventos' },
  { id: 'risco-retorno', label: 'Risco x Retorno' },
  { id: 'cobertura-fgc', label: 'Cobertura FGC' },
  { id: 'imposto-de-renda', label: 'Imposto de Renda' },
];

export default function CarteiraAnalise() {
  const [activeTab, setActiveTab] = useState('rentabilidade-geral');

  return (
    <div>
      {/* Header — no celular o h1 da página já está visível; este fica só para leitores de tela */}
      <div className="mb-6 max-lg:mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white max-lg:sr-only">
          Análises
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-lg:hidden">
          Análise de rentabilidade e proventos da sua carteira
        </p>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03] max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:dark:bg-transparent">
        <div className="border-b border-gray-200 px-6 dark:border-gray-800 max-lg:border-0 max-lg:px-0">
          <ResponsiveTabNav
            tabs={tabs}
            activeId={activeTab}
            onChange={setActiveTab}
            ariaLabel="Análises da carteira"
            variant="underline"
          />
        </div>

        {/* Tab Content */}
        <div className="p-6 max-lg:p-0">
          <TabContent id="rentabilidade-geral" isActive={activeTab === 'rentabilidade-geral'}>
            <RentabilidadeGeral />
          </TabContent>

          <TabContent id="proventos" isActive={activeTab === 'proventos'}>
            <ProventosTabs />
          </TabContent>

          <TabContent id="risco-retorno" isActive={activeTab === 'risco-retorno'}>
            <RiscoRetorno />
          </TabContent>

          <TabContent id="cobertura-fgc" isActive={activeTab === 'cobertura-fgc'}>
            <CoberturaFgc />
          </TabContent>

          <TabContent id="imposto-de-renda" isActive={activeTab === 'imposto-de-renda'}>
            <IRTabs />
          </TabContent>
        </div>
      </div>
    </div>
  );
}
