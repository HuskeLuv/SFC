/**
 * Fatia 0 (contrato) — CORPO/estilo da fatia B. Nota de rodapé fixa do Quadro (§3.1): o literal
 * 'rodape-quadro' de TEXTOS_LITERAIS_OBRIGATORIOS, no nó com data-texto-legal (o textContent TEM de
 * ser o literal exato; varrerDom confere). Substitui o RodapeFormula (removido na F). Ainda não é
 * usado pela tela.
 */
import { RODAPE_QUADRO } from '@/services/analiseAtivos/textosLiterais';
import type { RodapeCriteriosProps } from '@/types/analiseAtivosCriterios';

export type { RodapeCriteriosProps };

export default function RodapeCriterios({ className = '' }: RodapeCriteriosProps) {
  return (
    <p
      data-texto-legal={RODAPE_QUADRO.id}
      className={`text-[12px] leading-relaxed text-gray-500 dark:text-gray-400 ${className}`}
    >
      {RODAPE_QUADRO.texto}
    </p>
  );
}
