/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura.
 */
import { textoSeloEstado } from '@/services/analiseAtivos/textosTela';
import type { SeloEstadoProps } from '@/types/analiseAtivosApi';

export type { SeloEstadoProps };

export default function SeloEstado({ tipo, texto, className }: SeloEstadoProps) {
  const tracejado = tipo === 'planejado' || tipo === 'data_estimada';
  return (
    <span
      data-selo={tipo}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300 ${tracejado ? 'border-dashed border-gray-400' : 'border-gray-200 dark:border-gray-700'} ${className ?? ''}`}
    >
      {texto ?? textoSeloEstado(tipo)}
    </span>
  );
}
