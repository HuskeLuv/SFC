import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import FilaCuradoria from '@/components/admin/curadoria/FilaCuradoria';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { Metadata } from 'next';

/**
 * /admin/curadoria — fila de curadoria da Análise de Ativos (bloco C). Só admin: o middleware barra
 * a página e as APIs respondem 403 (requireAdmin). Curadores = admins (decisão 13).
 */
export const metadata: Metadata = {
  title: TEXTOS_TELA.curadoria.titulo,
  description: TEXTOS_TELA.curadoria.sub,
};

export default function Page() {
  return (
    <div>
      <PageBreadcrumb pageTitle={TEXTOS_TELA.curadoria.titulo} />
      <FilaCuradoria />
    </div>
  );
}
