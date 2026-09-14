import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import ConexoesBancariasRoot from '@/components/conexoes/ConexoesBancariasRoot';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Conexões bancárias',
  description: 'Conecte contas e cartões pelo Open Finance e importe as transações.',
};

export default function Page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Conexões bancárias" />
      <ConexoesBancariasRoot />
    </div>
  );
}
