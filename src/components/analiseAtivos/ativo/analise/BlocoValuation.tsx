'use client';

/**
 * Card "Valuation" da página do ativo — STUB da fatia 0 do Bloco D (dono: fatia B).
 *
 * Hoje: renderiza exatamente o BlocoValuationMultiplos (tela idêntica à da Fase 1).
 * A fatia B implementa, SEM mexer na PaginaAtivo:
 *  - com config.recursos.cenarios: SeletorNivel 'Múltiplos | Meus cenários'
 *    (TEXTOS_CENARIOS.seletor) no slot `cabecalhoExtra` do BlocoValuationMultiplos e de
 *    MeusCenarios (nível em estado local);
 *  - Meus cenários com useCenarios / useSalvarCenario / useApagarCenario, a Meta de renda (POST
 *    /api/planejamento-sonhos; `nome` entra no nome padrão do objetivo) e o rodapé literal
 *    RODAPE_CENARIOS.
 * Sem o recurso, continua renderizando só os Múltiplos.
 */
import BlocoValuationMultiplos from '@/components/analiseAtivos/ativo/analise/BlocoValuationMultiplos';
import type { BlocoValuationProps } from '@/types/analiseAtivosBlocoD';

export default function BlocoValuation({ ticker, classe }: BlocoValuationProps) {
  return <BlocoValuationMultiplos ticker={ticker} classe={classe} />;
}
