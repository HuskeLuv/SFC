'use client';

/**
 * Múltiplos históricos (fatia C): 2 mini-gráficos com a média tracejada — ações P/L e P/VP;
 * FIIs P/VP e DY. Usa a mesma consulta do Valuation (useValuationAtivo: uma requisição só).
 *
 * Bloco C: ano do histórico em conferência já vem sem ponto (fora da média, a linha quebra); aqui
 * aparece a nota do ano com o chip "em conferência" que abre o "Por quê?". Menu ⋯ e frescor pelo
 * card.
 */
import CartaoAnalise from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import MiniGraficoMultiplo from '@/components/analiseAtivos/ativo/analise/MiniGraficoMultiplo';
import ChipConferencia from '@/components/analiseAtivos/comum/ChipConferencia';
import { useConferenciaPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import { anoDaConferencia } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { useValuationAtivo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { BlocoMultiplosHistoricosProps } from '@/types/analiseAtivosApi';

export type { BlocoMultiplosHistoricosProps };

export default function BlocoMultiplosHistoricos({ ticker }: BlocoMultiplosHistoricosProps) {
  const q = useValuationAtivo(ticker);
  const ctx = useConferenciaPagina();
  const anos = (ctx?.conferencias ?? []).filter((c) => c.grupo === 'historico');
  return (
    <CartaoAnalise
      id={`historicos-${ticker}`}
      titulo={TEXTOS_TELA.blocos.historicos}
      sub={TEXTOS_TELA.analise.fundamentos.sub}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={220}
    >
      {q.data ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {q.data.historicos.map((h) => (
            <MiniGraficoMultiplo key={h.codigo} historico={h} />
          ))}
          {anos.length > 0 ? (
            <ul className="flex flex-col gap-1.5 sm:col-span-2" data-historico-conferencia="">
              {anos.map((c) => {
                const ano = anoDaConferencia(c);
                return (
                  <li
                    key={c.desde ?? c.grupo}
                    className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-0 w-4 border-t-2 border-dashed border-[#667085] dark:border-[#98A2B3]"
                    />
                    {formatarTexto(TEXTOS_TELA.telaConferencia.anoEmConferencia, {
                      ano: ano ?? '',
                    })}
                    <ChipConferencia
                      conferencia={c}
                      campo="historicoPl"
                      rotuloCampo={String(ano ?? '')}
                      bloco="historicos"
                    />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </CartaoAnalise>
  );
}
