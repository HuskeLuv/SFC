'use client';
import React, { useState } from 'react';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import IRResumoAnual from './ir/IRResumoAnual';
import IRMensalRendaVariavel from './ir/IRMensalRendaVariavel';
import IRStocksUs from './ir/IRStocksUs';
import IRCripto from './ir/IRCripto';
import IRComecotas from './ir/IRComecotas';

interface TabContentProps {
  isActive: boolean;
  children: React.ReactNode;
}

const TabContent: React.FC<TabContentProps> = ({ isActive, children }) => {
  if (!isActive) return null;
  return <div className="pt-6 max-lg:pt-3">{children}</div>;
};

const tabs = [
  { id: 'resumo-anual', label: 'Resumo Anual' },
  { id: 'mensal-rv', label: 'Mensal — RV BR' },
  { id: 'stocks-us', label: 'Stocks US' },
  { id: 'cripto', label: 'Cripto' },
  { id: 'come-cotas', label: 'Come-cotas' },
];

export default function IRTabs() {
  const [activeTab, setActiveTab] = useState('resumo-anual');

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03] max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:dark:bg-transparent">
      <div className="border-b border-gray-200 px-6 dark:border-gray-800 max-lg:border-0 max-lg:px-0">
        <ResponsiveTabNav
          tabs={tabs}
          activeId={activeTab}
          onChange={setActiveTab}
          ariaLabel="Imposto de renda"
          variant="underline"
          navClassName="-mb-px flex space-x-2 overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar]:h-1.5"
        />
      </div>

      <div className="p-6 max-lg:p-0">
        <TabContent isActive={activeTab === 'resumo-anual'}>
          <IRResumoAnual />
        </TabContent>
        <TabContent isActive={activeTab === 'mensal-rv'}>
          <IRMensalRendaVariavel />
        </TabContent>
        <TabContent isActive={activeTab === 'stocks-us'}>
          <IRStocksUs />
        </TabContent>
        <TabContent isActive={activeTab === 'cripto'}>
          <IRCripto />
        </TabContent>
        <TabContent isActive={activeTab === 'come-cotas'}>
          <IRComecotas />
        </TabContent>
      </div>
    </div>
  );
}
