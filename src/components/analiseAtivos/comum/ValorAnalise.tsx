/**
 * Valor numérico da área (fatia 0b): Estado<number> → número formatado (formatarAnalise), '—'
 * quando ausente ou 'n/a' quando não se aplica. O motivo vai no `title` e num texto só para leitor
 * de tela; com `mostrarMotivo`, aparece visível embaixo (ex.: DY 'proventos em conferência').
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
  const texto = formatarEstado(valor, formato);
  if (valor.estado === 'ok') {
    return (
      <span data-estado="ok" className={`whitespace-nowrap tabular-nums ${className ?? ''}`}>
        {texto}
      </span>
    );
  }
  const motivo = valor.texto;
  return (
    <span data-estado={valor.estado} title={motivo} className={`tabular-nums ${className ?? ''}`}>
      <span aria-hidden="true" className="whitespace-nowrap text-gray-500 dark:text-gray-400">
        {texto}
      </span>
      {mostrarMotivo ? (
        <span className="block text-[11.5px] leading-tight font-normal text-gray-500 dark:text-gray-400">
          {motivo}
        </span>
      ) : (
        <span className="sr-only">{motivo}</span>
      )}
    </span>
  );
}
