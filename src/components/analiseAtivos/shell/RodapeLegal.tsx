/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura.
 */
import { RODAPE_LEGAL } from '@/services/analiseAtivos/textosTela';
import type { RodapeLegalProps } from '@/types/analiseAtivosApi';

export type { RodapeLegalProps };

export default function RodapeLegal({ className }: RodapeLegalProps) {
  return (
    <p
      data-rodape-legal
      className={`text-xs leading-relaxed text-gray-500 dark:text-gray-400 ${className ?? ''}`}
    >
      {RODAPE_LEGAL}
    </p>
  );
}
