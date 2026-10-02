/**
 * STUB da fatia 0a — dono: B (topo da página do ativo). Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { SeloFrescorProps } from '@/types/analiseAtivosApi';

export type { SeloFrescorProps };

export default function SeloFrescor(_props: SeloFrescorProps) {
  return (
    <p data-stub="SeloFrescor" className="text-xs text-gray-500 dark:text-gray-400">
      {TEXTOS_TELA.blocos.frescor}
    </p>
  );
}
