'use client';
import React, { useState } from 'react';
import MetaViverDeRenda from './MetaViverDeRenda';
import RendaBaseadaPatrimonio from './RendaBaseadaPatrimonio';
import AportesMensais from './AportesMensais';
import Aposentadoria from './Aposentadoria';

interface TabButtonProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, onClick }) => {
  return (
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
};

interface TabContentProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}

const TabContent: React.FC<TabContentProps> = ({ isActive, children }) => {
  if (!isActive) return null;
  return <div className="pt-6">{children}</div>;
};

const tabs = [
  { id: 'meta-viver-de-renda', label: 'Meta viver de renda' },
  { id: 'renda-patrimonio', label: 'Renda baseada no patrimônio' },
  { id: 'aportes-mensais', label: 'Aportes mensais' },
  { id: 'aposentadoria', label: 'Aposentadoria' },
];

export default function PlanejamentoFinanceiroTabs() {
  const [activeTab, setActiveTab] = useState('meta-viver-de-renda');

  return (
    <div>
      {/* Sub-tabs */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-6 dark:border-gray-800">
          <nav className="-mb-px flex space-x-2 overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 dark:[&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar]:h-1.5">
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                id={tab.id}
                label={tab.label}
                isActive={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          <TabContent id="meta-viver-de-renda" isActive={activeTab === 'meta-viver-de-renda'}>
            <MetaViverDeRenda />
          </TabContent>

          <TabContent id="renda-patrimonio" isActive={activeTab === 'renda-patrimonio'}>
            <RendaBaseadaPatrimonio />
          </TabContent>

          <TabContent id="aportes-mensais" isActive={activeTab === 'aportes-mensais'}>
            <AportesMensais />
          </TabContent>

          <TabContent id="aposentadoria" isActive={activeTab === 'aposentadoria'}>
            <Aposentadoria />
          </TabContent>
        </div>
      </div>
    </div>
  );
}
