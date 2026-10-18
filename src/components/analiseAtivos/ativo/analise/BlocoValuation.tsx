'use client';

/**
 * Card "Valuation" da página do ativo (Bloco D, fatia B).
 *
 * - Sem config.recursos.cenarios (flag ANALISE_ATIVOS_CENARIOS_HABILITADO desligada ou área fora
 *   do beta): renderiza EXATAMENTE o BlocoValuationMultiplos de hoje (sem seletor).
 * - Com o recurso: SeletorNivel 'Múltiplos | Meus cenários' no cabeçalho (slot `cabecalhoExtra`),
 *   nível em estado local (sem URL, sem localStorage). "Meus cenários" monta a calculadora
 *   (MeusCenarios), que só busca os dados quando aberta.
 */
import { useState } from 'react';
import BlocoValuationMultiplos from '@/components/analiseAtivos/ativo/analise/BlocoValuationMultiplos';
import MeusCenarios from '@/components/analiseAtivos/ativo/cenarios/MeusCenarios';
import SeletorNivel from '@/components/analiseAtivos/comum/SeletorNivel';
import { useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import type { BlocoValuationProps, NivelValuation } from '@/types/analiseAtivosBlocoD';
import CartaoAnalise from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { TEXTOS_EUA_TELAS } from '@/services/analiseAtivos/textosEuaTelas';
import { ehClasseEua } from '@/types/analiseAtivosApi';

/**
 * Stocks e REITs (fatia C): Múltiplos e Meus cenários usam a cotação — sem cotação EUA nesta versão
 * (decisão do Wellington de 17/10), o card só explica que ficam ocultos. Nenhum número de preço.
 */
function ValuationEuaOculto({ ticker }: { ticker: string }) {
  return (
    <CartaoAnalise
      id={`valuation-${ticker}`}
      titulo={TEXTOS_EUA_TELAS.ativo.valuationTitulo}
      bloco="valuation"
    >
      <p data-valuation-oculto="" className="m-0 text-sm text-gray-600 dark:text-gray-300">
        {TEXTOS_EUA_TELAS.ativo.valuationOculto}
      </p>
    </CartaoAnalise>
  );
}

const S = TEXTOS_CENARIOS.seletor;
const OPCOES = [
  { valor: 'multiplos', rotulo: S.multiplos },
  { valor: 'cenarios', rotulo: S.cenarios },
] as const;

export default function BlocoValuation({ ticker, classe }: BlocoValuationProps) {
  const config = useAnaliseAtivosConfig();
  const ligado = config.data?.recursos?.cenarios === true;
  const [nivel, setNivel] = useState<NivelValuation>('multiplos');

  if (ehClasseEua(classe)) return <ValuationEuaOculto ticker={ticker} />;

  if (!ligado) return <BlocoValuationMultiplos ticker={ticker} classe={classe} />;

  // o invólucro ocupa o espaço livre do cabeçalho: o seletor fica à direita, junto do menu ⋯
  const seletor = (
    <div className="flex min-w-[220px] flex-1 sm:justify-end">
      <SeletorNivel<NivelValuation>
        opcoes={OPCOES}
        ativo={nivel}
        onTrocar={setNivel}
        rotuloGrupo={S.rotuloGrupo}
      />
    </div>
  );
  return nivel === 'cenarios' ? (
    <MeusCenarios ticker={ticker} classe={classe} cabecalhoExtra={seletor} />
  ) : (
    <BlocoValuationMultiplos ticker={ticker} classe={classe} cabecalhoExtra={seletor} />
  );
}
