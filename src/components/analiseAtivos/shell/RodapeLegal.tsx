/**
 * Rodapé legal da área (fatia 0b): texto fixo RODAPE_LEGAL (textosTela, versão da Fase 1),
 * no fim de todas as telas da área, inclusive na tela de beta fechado. Linha de cima + texto
 * pequeno em cinza (contraste AA nos dois temas).
 */
import { RODAPE_LEGAL } from '@/services/analiseAtivos/textosTela';
import type { RodapeLegalProps } from '@/types/analiseAtivosApi';

export type { RodapeLegalProps };

export default function RodapeLegal({ className }: RodapeLegalProps) {
  return (
    <p
      data-rodape-legal
      className={`border-t border-gray-200 pt-3.5 text-xs leading-relaxed text-gray-500 dark:border-gray-800 dark:text-gray-400 ${className ?? ''}`}
    >
      {RODAPE_LEGAL}
    </p>
  );
}
