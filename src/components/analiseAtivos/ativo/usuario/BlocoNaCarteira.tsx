/**
 * STUB da fatia 0a — dono: D (usuário: Na sua carteira reusando os hooks da Carteira). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import PlaceholderBloco from '@/components/analiseAtivos/shell/PlaceholderBloco';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoNaCarteiraProps } from '@/types/analiseAtivosApi';

export type { BlocoNaCarteiraProps };

export default function BlocoNaCarteira(_props: BlocoNaCarteiraProps) {
  return <PlaceholderBloco titulo={TEXTOS_TELA.blocos.naCarteira} dono="BlocoNaCarteira" />;
}
