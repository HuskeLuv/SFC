'use client';

import PlanejamentoSonhos from './sonhos/PlanejamentoSonhos';

/**
 * Wrapper que mantém o nome legado importado pela página
 * `/planejamento-financeiro/page.tsx`. O conteúdo real vive em
 * `./sonhos/PlanejamentoSonhos` — antigo simulador de aposentadoria foi
 * substituído pelo CRUD de objetivos (F3.3).
 */
export default function PlanejamentoFinanceiro() {
  return <PlanejamentoSonhos />;
}
