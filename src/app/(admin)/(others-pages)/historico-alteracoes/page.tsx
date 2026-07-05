import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import HistoricoAlteracoesPage from '@/components/historicoAlteracoes/HistoricoAlteracoesPage';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Histórico de alterações',
  description: 'Registro das edições feitas na sua conta',
};

export default function Page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Histórico de alterações" />
      <HistoricoAlteracoesPage />
    </div>
  );
}
