'use client';

/**
 * Cinco contadores que também filtram (botões de 44px, número de 22px, aria-pressed): com usuário
 * esperando, em análise, vencem em até 2 dias úteis, vencidos e só regra (sem prazo). Casos só de
 * regra e de revisão ficam fora dos quatro primeiros. 5 colunas; 3 abaixo de 1.100px; 2 abaixo de
 * 560px (container query do pai).
 */
import type { ReactNode } from 'react';
import type {
  ContagensFila,
  FilaCuradoria,
} from '@/services/analiseAtivos/curadoria/filaCuradoria';
import { IconeAlerta, T_CUR } from './marcasCaso';

export interface ContadoresFilaProps {
  contagens: ContagensFila | null;
  fila: FilaCuradoria;
  onFiltrar: (fila: FilaCuradoria) => void;
}

interface Contador {
  fila: FilaCuradoria;
  rotulo: string;
  valor: (c: ContagensFila) => number;
  atrasado?: boolean;
  icone?: ReactNode;
}

const CONTADORES: Contador[] = [
  { fila: 'pendentes', rotulo: T_CUR.contadores.usuarioEsperando, valor: (c) => c.aberto },
  { fila: 'em_analise', rotulo: T_CUR.contadores.emAnalise, valor: (c) => c.em_analise },
  { fila: 'vencendo', rotulo: T_CUR.contadores.vencendo, valor: (c) => c.vencendo },
  {
    fila: 'vencidos',
    rotulo: T_CUR.contadores.vencidos,
    valor: (c) => c.vencido,
    atrasado: true,
    icone: <IconeAlerta />,
  },
  { fila: 'so_regra', rotulo: T_CUR.contadores.soRegra, valor: (c) => c.soRegra },
];

export default function ContadoresFila({ contagens, fila, onFiltrar }: ContadoresFilaProps) {
  return (
    <div
      role="group"
      aria-label={T_CUR.filtros.rotulo}
      className="grid grid-cols-2 gap-2.5 @min-[560px]:grid-cols-3 @min-[1100px]:grid-cols-5"
    >
      {CONTADORES.map((c) => {
        const ativo = fila === c.fila;
        const n = contagens ? c.valor(contagens) : null;
        const atrasado = c.atrasado && (n ?? 0) > 0;
        return (
          <button
            key={c.fila}
            type="button"
            aria-pressed={ativo}
            onClick={() => onFiltrar(ativo ? 'principal' : c.fila)}
            data-contador={c.fila}
            className={`flex min-h-11 flex-col items-start gap-0.5 rounded-xl border bg-white px-3.5 py-2.5 text-left dark:bg-white/[0.03] ${
              ativo
                ? 'border-[#396CAA] shadow-[inset_0_0_0_1px_#396CAA] dark:border-[#6E9DC4] dark:shadow-[inset_0_0_0_1px_#6E9DC4]'
                : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.05]'
            }`}
          >
            <span
              className={`text-[22px] leading-7 font-semibold tabular-nums ${
                atrasado ? 'text-[#D92D20] dark:text-[#F97066]' : 'text-gray-900 dark:text-white/90'
              }`}
            >
              {n === null ? '–' : n.toLocaleString('pt-BR')}
            </span>
            <span
              className={`flex items-center gap-1.5 text-[12.5px] ${
                atrasado ? 'text-[#D92D20] dark:text-[#F97066]' : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              {c.icone}
              {c.rotulo}
            </span>
          </button>
        );
      })}
    </div>
  );
}
