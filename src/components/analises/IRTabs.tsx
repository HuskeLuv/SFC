'use client';
import React, { useState } from 'react';
import IRResumoAnual from './ir/IRResumoAnual';
import IRMensalRendaVariavel from './ir/IRMensalRendaVariavel';
import IRStocksUs from './ir/IRStocksUs';
import IRCripto from './ir/IRCripto';
import IRComecotas from './ir/IRComecotas';

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => (
  <button
    className={`inline-flex items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors duration-200 ease-in-out whitespace-nowrap ${
      isActive
        ? 'text-brand-500 dark:text-brand-400 border-brand-500 dark:border-brand-400'
        : 'bg-transparent text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`}
    onClick={onClick}
  >
    {label}
  </button>
);

interface TabContentProps {
  isActive: boolean;
  children: React.ReactNode;
}

const TabContent: React.FC<TabContentProps> = ({ isActive, children }) => {
  if (!isActive) return null;
  return <div className="pt-6">{children}</div>;
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
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-6 dark:border-gray-800">
        <nav className="-mb-px flex space-x-2 overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar]:h-1.5">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              label={tab.label}
              isActive={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </nav>
      </div>

      <div className="p-6">
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
