/**
 * STUB da fatia 0a — dono: 0b (componentes visuais comuns). Props FINAIS
 * (src/types/analiseAtivosApi.ts); a 0b implementa o visual do protótipo revisado SEM mudar a
 * assinatura. Stub: símbolo + texto (nunca só cor).
 */
import { STATUS_CRITERIO } from '@/constants/analiseAtivosVisual';
import { TEXTOS_ANALISE } from '@/services/analiseAtivos/textos';
import type { BadgeCriterioProps } from '@/types/analiseAtivosApi';

export type { BadgeCriterioProps };

export default function BadgeCriterio({ status, rotulo, className }: BadgeCriterioProps) {
  const e = STATUS_CRITERIO[status];
  return (
    <span
      data-stub="BadgeCriterio"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${e.texto} ${e.fundo} ${e.borda} ${className ?? ''}`}
    >
      <span aria-hidden="true">{e.simbolo}</span>
      {rotulo ?? TEXTOS_ANALISE.status[status]}
    </span>
  );
}
