/**
 * STUB da fatia 0a — dono: A (combobox de busca; filtro no cliente sobre useIndiceBusca). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BuscaAtivosProps } from '@/types/analiseAtivosApi';

export type { BuscaAtivosProps };

export default function BuscaAtivos({ className }: BuscaAtivosProps) {
  return (
    <div data-stub="BuscaAtivos" aria-label={TEXTOS_TELA.busca.rotulo} className={className} />
  );
}
