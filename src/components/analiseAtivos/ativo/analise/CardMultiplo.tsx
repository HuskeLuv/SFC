/**
 * Cartão de um múltiplo do Valuation (fatia C): rótulo + valor de 12 meses, leitura (definição),
 * referência dos pares e barra de posição. Valor ausente mostra '—' com o motivo em texto
 * visível; proventos em conferência levam a borda tracejada (forma, não cor) e a barra oculta.
 */
import BarraPosicao10a from '@/components/analiseAtivos/ativo/analise/BarraPosicao10a';
import { TEXTO_NEGATIVO } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { formatarAnalise, formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ItemValuation } from '@/types/analiseAtivosApi';

export interface CardMultiploProps {
  item: ItemValuation;
}

/** Cartão com valor em conferência (a API oculta a barra com este motivo). */
export function itemEmConferencia(item: ItemValuation): boolean {
  return item.barra.statusTexto === TEXTOS_TELA.analise.valuation.barraConferencia;
}

export default function CardMultiplo({ item }: CardMultiploProps) {
  const conf = itemEmConferencia(item);
  const atual = item.atual.estado === 'ok' ? item.atual.valor : null;
  const negativo = atual !== null && atual < 0;
  return (
    <div
      data-multiplo={item.codigo}
      data-conferencia={conf || undefined}
      className={`flex min-w-0 flex-col gap-1.5 rounded-xl border px-3.5 py-3 ${conf ? 'border-dashed border-gray-400 dark:border-gray-500' : 'border-gray-200 dark:border-gray-800'}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-gray-800 dark:text-white/90">
          {item.rotulo}
        </h3>
        <span
          className={`text-lg font-semibold tabular-nums ${negativo ? TEXTO_NEGATIVO : 'text-gray-800 dark:text-white/90'}`}
        >
          {formatarEstado(item.atual, item.formato)}
        </span>
      </div>
      {item.atual.estado !== 'ok' ? (
        <p className="text-[11.5px] text-gray-500 dark:text-gray-400">{item.atual.texto}</p>
      ) : null}
      <p className="text-[12.5px] text-gray-600 dark:text-gray-300">{item.leitura}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {item.referencia.valor !== null
          ? `${item.referencia.rotulo}: ${formatarAnalise(item.referencia.valor, item.formato)}`
          : item.referencia.rotulo}
      </p>
      <BarraPosicao10a
        barra={item.barra}
        atual={atual}
        formato={item.formato}
        rotulo={item.rotulo}
      />
    </div>
  );
}
