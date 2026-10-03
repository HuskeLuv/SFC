'use client';

/**
 * Cartão de um múltiplo do Valuation (fatia C): rótulo + valor de 12 meses, leitura (definição),
 * referência dos pares e barra de posição. Valor ausente mostra '—' com o motivo em texto
 * visível; proventos em conferência levam a borda tracejada (forma, não cor) e a barra oculta.
 *
 * Bloco C (params v2): múltiplo em conferência (flags 'conf:') = borda tracejada, '—' ('ocultar')
 * ou o valor ('selo'), chip "em conferência" que abre o "Por quê?" e a barra oculta. Ano do
 * histórico em conferência: a barra continua, sem o ano, e diz qual ano saiu da média.
 */
import BarraPosicao10a from '@/components/analiseAtivos/ativo/analise/BarraPosicao10a';
import { TEXTO_NEGATIVO } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { formatarAnalise, formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import ChipConferencia, {
  BORDA_CONFERENCIA,
  naoPublicado,
} from '@/components/analiseAtivos/comum/ChipConferencia';
import { useConferenciaPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import {
  CAMPO_HISTORICO,
  anoDaConferencia,
  conferenciaDoCampo,
  ehEstadoEmConferencia,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
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
  const ctx = useConferenciaPagina();
  const conf = itemEmConferencia(item);
  // bloco C: a conferência da página que marca este múltiplo (mesmo helper do topo e do Quadro)
  const confC =
    conf || ehEstadoEmConferencia(item.atual)
      ? conferenciaDoCampo(ctx?.conferencias, item.codigo)
      : null;
  const anosFora =
    item.codigo in CAMPO_HISTORICO
      ? (ctx?.conferencias ?? [])
          .filter((c) => c.grupo === 'historico')
          .map(anoDaConferencia)
          .filter((a): a is number => a !== null)
      : [];
  const atual = item.atual.estado === 'ok' ? item.atual.valor : null;
  const negativo = atual !== null && atual < 0;
  return (
    <div
      data-multiplo={item.codigo}
      data-conferencia={conf || !!confC || undefined}
      className={`flex min-w-0 flex-col gap-1.5 rounded-xl px-3.5 py-3 ${confC ? BORDA_CONFERENCIA : conf ? 'border border-dashed border-gray-400 dark:border-gray-500' : 'border border-gray-200 dark:border-gray-800'}`}
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
      {confC ? (
        <span className="self-start">
          <ChipConferencia
            conferencia={confC}
            campo={item.codigo}
            rotuloCampo={item.rotulo}
            valorNaoPublicado={naoPublicado(item.atual, item.formato)}
            bloco="valuation"
          />
        </span>
      ) : item.atual.estado !== 'ok' ? (
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
        anosForaDaMedia={anosFora}
      />
    </div>
  );
}
