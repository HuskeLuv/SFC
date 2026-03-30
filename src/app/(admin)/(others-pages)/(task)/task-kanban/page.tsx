import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import TaskHeader from '@/components/task/TaskHeader';
import KanbanBoard from '@/components/task/kanban/KanbanBoard';
import { Metadata } from 'next';

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
