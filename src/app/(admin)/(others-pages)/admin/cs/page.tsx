import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PainelCs from '@/components/admin/cs/PainelCs';
import { Metadata } from 'next';

/**
 * /admin/cs — painel de Customer Success (ticket 86e3vmyrc). Só admin: o middleware barra a página
 * (/admin/**) e a API responde 403 (requireAdmin). Somente leitura.
 */
export const metadata: Metadata = {
  title: 'CS — Clientes',
  description: 'Painel de CS: clientes, ativação e engajamento',
};

export default function Page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="CS — Clientes" />
      <PainelCs />
    </div>
  );
}
