/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura. Stub: chip tracejado com os motivos no title; a 0b faz o popover/BottomSheet.
 */
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { SeloIncompletoProps } from '@/types/analiseAtivosApi';

export type { SeloIncompletoProps };

export default function SeloIncompleto({ motivos, className }: SeloIncompletoProps) {
  return (
    <span
      data-stub="SeloIncompleto"
      title={motivos.map((m) => m.texto).join(' · ')}
      className={`inline-flex items-center rounded-full border border-dashed border-gray-400 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300 ${className ?? ''}`}
    >
      {TEXTOS_TELA.selos.dadosIncompletos}
    </span>
  );
}
