import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import AdminOverviewPage from '@/components/admin/AdminOverviewPage';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Administração',
  description: 'Painel administrativo: usuários, uso, assistente de IA e sistema',
};

export default function Page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Administração" />
      <AdminOverviewPage />
    </div>
  );
}
