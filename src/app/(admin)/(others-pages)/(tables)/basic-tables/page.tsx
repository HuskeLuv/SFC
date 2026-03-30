import dynamic from 'next/dynamic';
import ComponentCard from '@/components/common/ComponentCard';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import BasicTableFive from '@/components/tables/BasicTables/BasicTableFive';
import BasicTableFour from '@/components/tables/BasicTables/BasicTableFour';
import BasicTableThree from '@/components/tables/BasicTables/BasicTableThree';
import BasicTableTwo from '@/components/tables/BasicTables/BasicTableTwo';

import { Metadata } from 'next';
import React from 'react';

const BasicTableOne = dynamic(() => import('@/components/tables/BasicTables/BasicTableOne'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-64" />,
});

export const metadata: Metadata = {
  title: '',
  description: 'Tabela de Dados',
};

export default function BasicTables() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Basic Tables" />
      <div className="space-y-6">
        <ComponentCard title="Basic Table 1">
          <BasicTableOne />
        </ComponentCard>
        <ComponentCard title="Basic Table 2">
          <BasicTableTwo />
        </ComponentCard>
        <ComponentCard title="Basic Table 3">
          <BasicTableThree />
        </ComponentCard>
        <ComponentCard title="Basic Table 4">
          <BasicTableFour />
        </ComponentCard>
        <ComponentCard title="Basic Table 5">
          <BasicTableFive />
        </ComponentCard>
      </div>
    </div>
  );
}
