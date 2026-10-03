import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { PaginaCaso } from '@/components/admin/curadoria/DetalheCaso';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { Metadata } from 'next';

/** /admin/curadoria/[id] — o caso em página própria (celular e link da notificação). Só admin. */
export const metadata: Metadata = {
  title: TEXTOS_TELA.curadoria.titulo,
  description: TEXTOS_TELA.curadoria.sub,
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageBreadcrumb pageTitle={TEXTOS_TELA.curadoria.titulo} />
      <PaginaCaso id={id} />
    </div>
  );
}
