/**
 * STUB da fatia 0a — dono: A (Quadro: estado na URL, filtros, tabela/cartões, Mostrar mais). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import PlaceholderBloco from '@/components/analiseAtivos/shell/PlaceholderBloco';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { QuadroAnaliseProps } from '@/types/analiseAtivosApi';

export type { QuadroAnaliseProps };

export default function QuadroAnalise(_props: QuadroAnaliseProps) {
  return <PlaceholderBloco titulo={TEXTOS_TELA.quadro.rotulo} dono="QuadroAnalise" />;
}
