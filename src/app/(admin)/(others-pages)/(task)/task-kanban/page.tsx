import dynamic from 'next/dynamic';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import TaskHeader from '@/components/task/TaskHeader';
import { Metadata } from 'next';
import React from 'react';

const KanbanBoard = dynamic(() => import('@/components/task/kanban/KanbanBoard'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-96" />,
});

export const metadata: Metadata = {
  title: 'Tarefas',
  description: '',
};

export default function TaskKanban() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Task Kanban" />
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <TaskHeader />
        <KanbanBoard />
      </div>
    </div>
  );
}
