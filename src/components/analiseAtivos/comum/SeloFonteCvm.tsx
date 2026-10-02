/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura.
 */
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { SeloFonteCvmProps } from '@/types/analiseAtivosApi';

export type { SeloFonteCvmProps };

export default function SeloFonteCvm({ compacto, className }: SeloFonteCvmProps) {
  return (
    <span className={`text-xs text-gray-500 dark:text-gray-400 ${className ?? ''}`}>
      {compacto ? TEXTOS_TELA.selos.fonteCvmCurto : TEXTOS_TELA.selos.fonteCvm}
    </span>
  );
}
