import type { Metadata } from 'next';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import { analiseAtivosVisualV2Habilitado } from '@/lib/analiseAtivosConfig';
import QuadroAnalise from '@/components/analiseAtivos/quadro/QuadroAnalise';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';

export const metadata: Metadata = {
  title: 'Análise de Ativos',
  description: TEXTOS_QUADRO.metaDescricao,
};

/**
 * Quadro v2.4 (estado na URL: ?classe=acao|fii&j=&c=&carteira=&s=&ordem=&dir=&modo=). O gate fica
 * no layout.
 */
export default function AnaliseAtivosPage() {
  return (
    <AnaliseAtivosShell visualV2={analiseAtivosVisualV2Habilitado()} variante="quadro">
      <QuadroAnalise />
    </AnaliseAtivosShell>
  );
}
