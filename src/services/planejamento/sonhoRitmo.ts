/**
 * Ritmo de um sonho (Relatório financeiro, seção 6; decisão 5 do Wellington, 06/11/2026). Puro.
 *
 *  - "Pausado" pelo usuário → warn "Pausado";
 *  - "Em espera" (sonho ainda sem nenhum registro; o app promove a "Iniciado" no 1º) → warn
 *    "Não iniciado": não está atrasado nem no ritmo;
 *  - bad "Sem aporte há N meses": N ≥ 2 meses FECHADOS seguidos (contando do mês anterior para
 *    trás, a partir do início do sonho) sem registro com depósito > 0;
 *  - warn "Abaixo do ritmo": saldo < 95% do planejado para a data (planned(mesesDecorridos));
 *  - senão good "No ritmo".
 *
 * Os 95% aguardam a confirmação do Pedro (só troca de constante).
 */
import type { StatusSemaforo } from '@/types/relatorioFinanceiro';
import { planned, type PlanejamentoObjetivoInput } from './planejamentoSonhos';

/** Saldo abaixo desta fração do planejado = "Abaixo do ritmo". */
export const FRACAO_RITMO = 0.95;
/** Meses fechados seguidos sem depósito para "Sem aporte há N meses". */
export const MESES_SEM_DEPOSITO_ALERTA = 2;

const somarMes = (mes: string, k: number): string => {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/** Meses entre dois 'YYYY-MM' (b − a). */
export const mesesEntre = (a: string, b: string): number => {
  const [aa, am] = a.split('-').map(Number);
  const [ba, bm] = b.split('-').map(Number);
  return (ba - aa) * 12 + (bm - am);
};

/**
 * Meses fechados seguidos sem depósito, do mês anterior ao corrente para trás, sem passar do mês
 * de início do sonho. `mesCorrente` 'YYYY-MM' (em SP).
 */
export function mesesSemDeposito(
  entries: Array<{ month: string; aporte: number }>,
  inicio: string,
  mesCorrente: string,
): number {
  const comDeposito = new Set(entries.filter((e) => e.aporte > 0).map((e) => e.month));
  let n = 0;
  for (let mes = somarMes(mesCorrente, -1); mes >= inicio; mes = somarMes(mes, -1)) {
    if (comDeposito.has(mes)) break;
    n += 1;
  }
  return n;
}

export interface RitmoSonho {
  status: StatusSemaforo;
  rotulo: string;
  mesesSemAporte: number;
}

export interface EntradaRitmo {
  /** Status do app ('Pausado', 'Iniciado'…). */
  statusApp: string;
  objetivo: PlanejamentoObjetivoInput;
  /** Saldo atual do sonho. */
  saldo: number;
  /** Meses desde o início do sonho até hoje. */
  mesesDecorridos: number;
  mesesSemAporte: number;
}

export function sonhoRitmo(e: EntradaRitmo): RitmoSonho {
  const { mesesSemAporte } = e;
  if (e.statusApp === 'Pausado') return { status: 'warn', rotulo: 'Pausado', mesesSemAporte };
  if (e.statusApp === 'Em espera') {
    return { status: 'warn', rotulo: 'Não iniciado', mesesSemAporte };
  }
  if (mesesSemAporte >= MESES_SEM_DEPOSITO_ALERTA) {
    return { status: 'bad', rotulo: `Sem aporte há ${mesesSemAporte} meses`, mesesSemAporte };
  }
  const planejado = planned(e.objetivo, Math.max(0, e.mesesDecorridos));
  if (e.saldo < planejado * FRACAO_RITMO) {
    return { status: 'warn', rotulo: 'Abaixo do ritmo', mesesSemAporte };
  }
  return { status: 'good', rotulo: 'No ritmo', mesesSemAporte };
}
