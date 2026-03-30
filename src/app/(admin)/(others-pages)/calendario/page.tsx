import dynamic from 'next/dynamic';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { Metadata } from 'next';
import React from 'react';

const Calendar = dynamic(() => import('@/components/calendar/Calendar'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-96" />,
});

export const metadata: Metadata = {
  title: '',
  description: '',
};

export default function Page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Calendário" />
      <Calendar />
    </div>
  );
}
