/**
 * STUB da fatia 0a — dono: B (topo da página do ativo). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import PlaceholderBloco from '@/components/analiseAtivos/shell/PlaceholderBloco';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoKpisProps } from '@/types/analiseAtivosApi';

export type { BlocoKpisProps };

export default function BlocoKpis(_props: BlocoKpisProps) {
  return <PlaceholderBloco titulo={TEXTOS_TELA.blocos.kpis} dono="BlocoKpis" />;
}
