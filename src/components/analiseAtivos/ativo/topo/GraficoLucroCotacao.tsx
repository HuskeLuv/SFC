/**
 * STUB da fatia 0a — dono: B (topo da página do ativo). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import PlaceholderBloco from '@/components/analiseAtivos/shell/PlaceholderBloco';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { GraficoLucroCotacaoProps } from '@/types/analiseAtivosApi';

export type { GraficoLucroCotacaoProps };

export default function GraficoLucroCotacao({ classe }: GraficoLucroCotacaoProps) {
  return (
    <PlaceholderBloco
      titulo={classe === 'fii' ? TEXTOS_TELA.blocos.graficoFii : TEXTOS_TELA.blocos.graficoAcao}
      dono="GraficoLucroCotacao"
    />
  );
}
