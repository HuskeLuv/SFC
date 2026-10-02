import type { Metadata } from 'next';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import QuadroAnalise from '@/components/analiseAtivos/quadro/QuadroAnalise';

export const metadata: Metadata = {
  title: 'Análise de Ativos',
  description: 'Quadro de ações e FIIs da B3 com fundamentos de 10 anos e o Índice MF.',
};

/** Quadro (estado na URL: ?classe=acao|fii&ordem=&dir=&modo=&f=). O gate fica no layout. */
export default function AnaliseAtivosPage() {
  return (
    <AnaliseAtivosShell variante="quadro">
      <QuadroAnalise />
    </AnaliseAtivosShell>
  );
}
