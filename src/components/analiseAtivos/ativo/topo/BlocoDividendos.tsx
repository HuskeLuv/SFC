/**
 * STUB da fatia 0a — dono: B (topo da página do ativo). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import PlaceholderBloco from '@/components/analiseAtivos/shell/PlaceholderBloco';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoDividendosProps } from '@/types/analiseAtivosApi';

export type { BlocoDividendosProps };

export default function BlocoDividendos({ classe }: BlocoDividendosProps) {
  return (
    <PlaceholderBloco
      titulo={
        classe === 'fii' ? TEXTOS_TELA.blocos.dividendosFii : TEXTOS_TELA.blocos.dividendosAcao
      }
      dono="BlocoDividendos"
    />
  );
}
