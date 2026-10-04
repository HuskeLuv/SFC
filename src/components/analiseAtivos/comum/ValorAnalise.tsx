/**
 * Valor numérico da área (fatia 0b): Estado<number> → número formatado (formatarAnalise), '—'
 * quando ausente ou 'n/a' quando não se aplica. O motivo vai no `title` e num texto só para leitor
 * de tela; com `mostrarMotivo`, aparece visível embaixo (ex.: DY 'proventos em conferência').
 *
 * Bloco C: ausente por conferência (motivo 'em_conferencia:<grupo>', exibição 'ocultar') = '—' com
 * o motivo só para leitor de tela, mesmo com `mostrarMotivo` — quem chama põe o chip "em
 * conferência" (ChipConferencia), que é o botão do "Por quê?".
 */
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { ehEstadoEmConferencia } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
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
  if (ehEstadoEmConferencia(valor)) {
    return (
      <span
        data-estado={valor.estado}
        data-conferencia=""
        title={motivo}
        className={`tabular-nums ${className ?? ''}`}
      >
        <span aria-hidden="true" className="whitespace-nowrap text-gray-700 dark:text-gray-300">
          {texto}
        </span>
        <span className="sr-only">{motivo}</span>
      </span>
    );
  }
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
