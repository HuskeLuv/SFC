import type { StatusOrcamento } from '@/lib/orcamento/regras';
import { TOM_FUNDO } from '@/lib/orcamento/tons';
import { TOM_DO_STATUS } from './apresentacao';

/**
 * Medidor fluido do celular (cartões do Orçamento v2): ocupa a largura que tiver — nada de 120 px
 * fixos como a `BarraConsumo` da tabela — com o preenchimento na cor do status do payload e o
 * traço do ritmo (fração do mês/ano que passou). `consumido` é fração; `null` = trilho vazio.
 */
export default function MedidorRitmo({
  consumido,
  status,
  ritmo,
  mostrarRitmo = true,
  altura = 'h-2',
  trilho = 'bg-gray-100 dark:bg-gray-800',
  className = '',
}: {
  consumido: number | null;
  status: StatusOrcamento;
  ritmo: number;
  mostrarRitmo?: boolean;
  altura?: 'h-1.5' | 'h-2';
  /** Cor do trilho (no herói azul o trilho é branco). */
  trilho?: string;
  className?: string;
}) {
  const largura = consumido === null ? 0 : Math.min(100, Math.max(0, consumido * 100));
  return (
    <span
      aria-hidden="true"
      data-mf-medidor={consumido === null ? 'none' : status}
      className={`relative block ${altura} min-w-0 rounded-full ${trilho} ${className}`}
    >
      {consumido !== null && (
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${TOM_FUNDO[TOM_DO_STATUS[status]]}`}
          style={{ width: `${largura}%` }}
        />
      )}
      {mostrarRitmo && (
        <span
          className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded bg-gray-700/60 dark:bg-gray-200/70"
          style={{ left: `${(Math.min(1, Math.max(0, ritmo)) * 100).toFixed(1)}%` }}
        />
      )}
    </span>
  );
}
