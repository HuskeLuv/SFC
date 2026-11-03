import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PerguntasFrequentes from '@/components/ajuda/PerguntasFrequentes';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ajuda',
  description: 'Perguntas frequentes sobre o uso do My Finance',
};

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageBreadcrumb pageTitle="Ajuda" />
      <PerguntasFrequentes />
    </div>
  );
}
