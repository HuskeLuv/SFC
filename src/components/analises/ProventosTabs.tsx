'use client';
import React, { useState } from 'react';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import ProventosConsolidado from './ProventosConsolidado';
import ProventosAgenda from './ProventosAgenda';

interface TabContentProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}

const TabContent: React.FC<TabContentProps> = ({ isActive, children }) => {
  if (!isActive) return null;
  return <div className="pt-6 max-lg:pt-3">{children}</div>;
};

const tabs = [
  { id: 'consolidado', label: 'Consolidado' },
  { id: 'agenda', label: 'Agenda' },
];

export default function ProventosTabs() {
  const [activeTab, setActiveTab] = useState('consolidado');

  return (
    <div>
      {/* Sub-tabs */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03] max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:dark:bg-transparent">
        <div className="border-b border-gray-200 px-6 dark:border-gray-800 max-lg:border-0 max-lg:px-0">
          <ResponsiveTabNav
            tabs={tabs}
            activeId={activeTab}
            onChange={setActiveTab}
            ariaLabel="Visão de proventos"
            variant="segmented-sub"
            navClassName="-mb-px flex space-x-2 overflow-x-auto [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 dark:[&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar]:h-1.5"
          />
        </div>

        {/* Tab Content */}
        <div className="p-6 max-lg:p-0">
          <TabContent id="consolidado" isActive={activeTab === 'consolidado'}>
            <ProventosConsolidado />
          </TabContent>

          <TabContent id="agenda" isActive={activeTab === 'agenda'}>
            <ProventosAgenda />
          </TabContent>
        </div>
      </div>
    </div>
  );
}
