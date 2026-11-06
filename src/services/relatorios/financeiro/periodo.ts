/**
 * Janela de tempo do Relatório financeiro. Tudo em America/Sao_Paulo (hojeEmSaoPaulo, UTC−3
 * fixo), nunca no fuso local do servidor (o Lightsail roda em UTC).
 */
import type { HojeSP } from '@/lib/orcamento/regras';
import type { MesesRelatorio, PeriodoRelatorio } from '@/types/relatorioFinanceiro';
import { MESES_EXTENSO, rotuloMes } from '@/components/relatorios/financeiro/formato';
import { ANOS_IRPF_SIMULAVEIS, regrasIrpfDoAno } from '@/services/ir/irpfAnual';
import { hojeEmSaoPaulo } from '@/services/cashflow/orcamentoV2/carregarOrcamento';

export { hojeEmSaoPaulo, rotuloMes };

/** Os insumos sempre carregam 13 meses: 12 do maior período + o anterior (base da variação). */
export const JANELA_INSUMOS_MESES = 13;

const OFFSET_SP_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

const dd = (v: number) => String(v).padStart(2, '0');

/** 'YYYY-MM' de um mês (mes0 0–11). */
export function chaveMes(ano: number, mes0: number): string {
  return `${ano}-${dd(mes0 + 1)}`;
}

/** Desloca um mês: somarMeses(2026, 0, −1) = { ano: 2025, mes0: 11 }. */
export function somarMeses(ano: number, mes0: number, k: number): { ano: number; mes0: number } {
  const t = ano * 12 + mes0 + k;
  return { ano: Math.floor(t / 12), mes0: ((t % 12) + 12) % 12 };
}

/** Os `n` meses que terminam no mês corrente em SP, do mais antigo ao corrente ('YYYY-MM'). */
export function mesesDaJanela(hojeSP: HojeSP, n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const m = somarMeses(hojeSP.ano, hojeSP.mes0, i - (n - 1));
    return chaveMes(m.ano, m.mes0);
  });
}

/** Meia-noite UTC do 1º dia do mais antigo dos `n` meses (os snapshots são gravados em UTC). */
export function inicioDaJanela(hojeSP: HojeSP, n: number): Date {
  const m = somarMeses(hojeSP.ano, hojeSP.mes0, -(n - 1));
  return new Date(Date.UTC(m.ano, m.mes0, 1));
}

/** Anos-calendário tocados pelos `n` meses (1 ou 2). */
export function anosDaJanela(hojeSP: HojeSP, n: number): number[] {
  const inicio = somarMeses(hojeSP.ano, hojeSP.mes0, -(n - 1));
  return inicio.ano === hojeSP.ano ? [hojeSP.ano] : [inicio.ano, hojeSP.ano];
}

export function diasNoMes(ano: number, mes0: number): number {
  return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
}

/** 'dd/mm' da data em SP. */
export function lancadoAte(agora: Date): string {
  const h = hojeEmSaoPaulo(agora);
  return `${dd(h.dia)}/${dd(h.mes0 + 1)}`;
}

export function periodoDoRelatorio(meses: MesesRelatorio, agora: Date): PeriodoRelatorio {
  const hoje = hojeEmSaoPaulo(agora);
  const lista = mesesDaJanela(hoje, meses);
  const inicio = lista[0];
  const fim = lista[lista.length - 1];
  const ate = lancadoAte(agora);
  const nomeMes = MESES_EXTENSO[hoje.mes0];
  const rotulo =
    meses === 1
      ? `${nomeMes[0].toUpperCase()}${nomeMes.slice(1)} de ${hoje.ano} (parcial, lançado até ${ate})`
      : `${rotuloMes(inicio)} a ${rotuloMes(fim)} · ${meses} meses`;
  return { meses, rotulo, inicio, fim, parcial: true, lancadoAte: ate };
}

/** Dias corridos de hoje (SP) até 31/12 do mesmo ano: 03/11 → 58, 31/12 → 0. */
export function diasAte3112(agora: Date): number {
  const h = hojeEmSaoPaulo(agora);
  return Math.round((Date.UTC(h.ano, 11, 31) - Date.UTC(h.ano, h.mes0, h.dia)) / DIA_MS);
}

export interface AnoIr {
  ano: number;
  /** Ano corrente sem REGRAS_IRPF: usa o último ano com regra e marca encerrado. */
  encerrado: boolean;
  /** null quando encerrado. */
  diasAte3112: number | null;
}

/**
 * Ano do IR do relatório = ano corrente em SP. Sem regra cadastrada para ele (ex.: janeiro de 2027
 * sem REGRAS_IRPF_2027), o último ano com regra, encerrado. Não usa anoIrpfPadrao (fuso local).
 */
export function anoIr(agora: Date): AnoIr {
  const { ano } = hojeEmSaoPaulo(agora);
  if (regrasIrpfDoAno(ano)) return { ano, encerrado: false, diasAte3112: diasAte3112(agora) };
  const ultimo = ANOS_IRPF_SIMULAVEIS.find((a) => a < ano) ?? ANOS_IRPF_SIMULAVEIS[0];
  return { ano: ultimo, encerrado: true, diasAte3112: null };
}

/** ISO com o fuso de SP: '2026-11-06T09:42:00-03:00'. */
export function geradoEmISO(agora: Date): string {
  const sp = new Date(agora.getTime() - OFFSET_SP_MS).toISOString().slice(0, 19);
  return `${sp}-03:00`;
}
