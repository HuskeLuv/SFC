'use client';

/**
 * Múltiplos históricos (fatia C): 2 mini-gráficos com a média tracejada — ações P/L e P/VP;
 * FIIs P/VP e DY. Usa a mesma consulta do Valuation (useValuationAtivo: uma requisição só).
 */
import CartaoAnalise from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import MiniGraficoMultiplo from '@/components/analiseAtivos/ativo/analise/MiniGraficoMultiplo';
import { useValuationAtivo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoMultiplosHistoricosProps } from '@/types/analiseAtivosApi';

export type { BlocoMultiplosHistoricosProps };

export default function BlocoMultiplosHistoricos({ ticker }: BlocoMultiplosHistoricosProps) {
  const q = useValuationAtivo(ticker);
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
        </div>
      ) : null}
    </CartaoAnalise>
  );
}
