/**
 * STUB da fatia 0a — dono: D (tese privada; consultor agindo vê o card "A tese é pessoal"). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import PlaceholderBloco from '@/components/analiseAtivos/shell/PlaceholderBloco';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoTeseProps } from '@/types/analiseAtivosApi';

export type { BlocoTeseProps };

export default function BlocoTese(_props: BlocoTeseProps) {
  return <PlaceholderBloco titulo={TEXTOS_TELA.blocos.tese} dono="BlocoTese" />;
}
