/**
 * STUB da fatia 0a — dono: B (topo da página do ativo). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import PlaceholderBloco from '@/components/analiseAtivos/shell/PlaceholderBloco';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoEventosProps } from '@/types/analiseAtivosApi';

export type { BlocoEventosProps };

export default function BlocoEventos(_props: BlocoEventosProps) {
  return <PlaceholderBloco titulo={TEXTOS_TELA.blocos.eventos} dono="BlocoEventos" />;
}
