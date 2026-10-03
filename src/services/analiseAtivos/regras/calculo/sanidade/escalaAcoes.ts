/**
 * R1 — escala do nº de ações / valor de mercado (grupo acoes_escala; escopo empresa; ocultar).
 * Função pura. Limiares em ScoringParams.sanidade.conferencia (pvpMin, plMin, vmRazao).
 *
 * Marca quando, no múltiplo do dia:
 *  - pvp_minimo: P/V P ∈ (0; pvpMin)  — CBAV3 (651.073 ações ⇒ P/VP 0,0014), LAND3, HAPV3 (0,062);
 *  - pl_minimo:  P/L ∈ (0; plMin);
 *  - vm_razao:   VM de hoje ÷ VM do último FY ∉ [1/vmRazao; vmRazao], sem evento confirmado desde o
 *    fim do FY (o desdobramento muda o nº de ações, não o valor da empresa).
 * Chave = data da contagem de ações usada (liberação por contagem: contagem nova marca de novo).
 * CGAS3 (P/VP 10,4, real) não marca: só os pisos e a razão de VM disparam.
 */
import type { DeteccaoConf, CfgConferencia } from './aplicarConferencia';
import type { Valor } from '@/services/analiseAtivos/tipos';

export interface EntradaEscalaAcoes {
  pvp: Valor<number> | undefined;
  pl: Valor<number> | undefined;
  valorMercado: Valor<number> | undefined;
  /** VM da empresa no fim do último FY (AssetMultiplesYearly.valorMercadoEmpresa) */
  valorMercadoUltimoFy: number | null;
  /** há evento corporativo confirmado entre o fim do último FY e hoje */
  eventoConfirmadoDesdeFy: boolean;
  /** data (AAAA-MM-DD) da contagem de ações dos múltiplos do dia */
  dataContagem: string | null;
}

function dentroAberto(v: Valor<number> | undefined, max: number): number | null {
  return v && v.estado === 'ok' && v.valor > 0 && v.valor < max ? v.valor : null;
}

export function detectarEscalaAcoes(
  e: EntradaEscalaAcoes,
  cfg: Pick<CfgConferencia, 'pvpMin' | 'plMin' | 'vmRazao'>,
): DeteccaoConf | null {
  const chave = e.dataContagem ?? 'sem_contagem';
  const base = { tipo: 'conf' as const, grupo: 'acoes_escala' as const, chave };
  const pvp = dentroAberto(e.pvp, cfg.pvpMin);
  if (pvp !== null) return { ...base, regra: 'pvp_minimo', valor: pvp };
  const pl = dentroAberto(e.pl, cfg.plMin);
  if (pl !== null) return { ...base, regra: 'pl_minimo', valor: pl };
  const vm = e.valorMercado;
  const vmFy = e.valorMercadoUltimoFy;
  if (
    !e.eventoConfirmadoDesdeFy &&
    vm?.estado === 'ok' &&
    vm.valor > 0 &&
    typeof vmFy === 'number' &&
    vmFy > 0
  ) {
    const r = vm.valor / vmFy;
    if (r > cfg.vmRazao || r < 1 / cfg.vmRazao) return { ...base, regra: 'vm_razao', valor: r };
  }
  return null;
}
