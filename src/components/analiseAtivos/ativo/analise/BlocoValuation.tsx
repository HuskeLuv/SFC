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

const S = TEXTOS_CENARIOS.seletor;
const OPCOES = [
  { valor: 'multiplos', rotulo: S.multiplos },
  { valor: 'cenarios', rotulo: S.cenarios },
] as const;

export default function BlocoValuation({ ticker, classe }: BlocoValuationProps) {
  const config = useAnaliseAtivosConfig();
  const ligado = config.data?.recursos?.cenarios === true;
  const [nivel, setNivel] = useState<NivelValuation>('multiplos');

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
