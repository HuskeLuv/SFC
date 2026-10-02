/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura.
 */
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import type { ValorAnaliseProps } from '@/types/analiseAtivosApi';

export type { ValorAnaliseProps };

export default function ValorAnalise({
  valor,
  formato,
  mostrarMotivo,
  className,
}: ValorAnaliseProps) {
  const motivo = valor.estado === 'ok' ? undefined : valor.texto;
  return (
    <span title={motivo} className={`tabular-nums ${className ?? ''}`}>
      {formatarEstado(valor, formato)}
      {mostrarMotivo && motivo ? (
        <span className="block text-[11px] text-gray-500 dark:text-gray-400">{motivo}</span>
      ) : null}
    </span>
  );
}
