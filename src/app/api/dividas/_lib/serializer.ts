/**
 * Helpers compartilhados pelas rotas de Dívidas.
 *
 * Centraliza a conversão Decimal (Prisma) → number e o shape dos DTOs
 * devolvidos pela API — o hook useDividas re-exporta estes tipos pra que
 * client e server compartilhem um único contrato (padrão do planejamento).
 */

import type { Prisma } from '@prisma/client';
import type { ResumoDivida } from '@/services/dividas/amortizacao';

export type DividaModalidade = 'financiamento' | 'rotativa';
export type DividaSistema = 'SAC' | 'PRICE';
export type DividaIndexador = 'PREFIXADO' | 'TR' | 'IPCA' | 'CDI';
// 4 estados como no planejamento dos sonhos (pedido ago/2026): 'ativa' =
// Iniciada (paga e projeta parcelas), 'em_espera'/'pausada' = dívida existe e
// conta no passivo mas NÃO projeta parcela no fluxo, 'quitada' = Concluída.
export type DividaStatus = 'ativa' | 'em_espera' | 'pausada' | 'quitada';
export type DividaTipo =
  | 'financiamento_imobiliario'
  | 'financiamento_veiculo'
  | 'emprestimo_pessoal'
  | 'consignado'
  | 'cartao_credito'
  | 'cheque_especial'
  | 'outro';
export type DividaPagamentoTipo = 'pagamento' | 'ajuste';

export interface DividaPagamentoDTO {
  id: string;
  month: string;
  valor: number;
  parcelaNumero: number | null;
  tipo: DividaPagamentoTipo;
  notes: string | null;
  createdAt: string;
}

export interface DividaDTO {
  id: string;
  nome: string;
  instituicao: string | null;
  tipo: DividaTipo;
  modalidade: DividaModalidade;
  principal: number | null;
  taxaAm: number | null;
  taxaUnidadeEntrada: 'am' | 'aa';
  prazoMeses: number | null;
  sistema: DividaSistema | null;
  indexador: DividaIndexador;
  primeiroVencimento: string | null;
  saldoInicial: number | null;
  dataSaldoInicial: string | null;
  status: DividaStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Resumo computado (saldo, progresso, categoria) — nunca persistido. */
  resumo?: ResumoDivida;
  pagamentos?: DividaPagamentoDTO[];
}

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export function decimalToNumber(v: DecimalLike): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return v.toNumber();
}

function decimalOrNull(v: DecimalLike): number | null {
  return v == null ? null : decimalToNumber(v);
}

export type PagamentoRow = {
  id: string;
  month: string;
  valor: DecimalLike;
  parcelaNumero: number | null;
  tipo: string;
  notes: string | null;
  createdAt: Date;
};

export type DividaRow = {
  id: string;
  nome: string;
  instituicao: string | null;
  tipo: string;
  modalidade: string;
  principal: DecimalLike;
  taxaAm: DecimalLike;
  taxaUnidadeEntrada: string;
  prazoMeses: number | null;
  sistema: string | null;
  indexador: string;
  primeiroVencimento: string | null;
  saldoInicial: DecimalLike;
  dataSaldoInicial: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  pagamentos?: PagamentoRow[];
};

export function serializePagamento(p: PagamentoRow): DividaPagamentoDTO {
  return {
    id: p.id,
    month: p.month,
    valor: decimalToNumber(p.valor),
    parcelaNumero: p.parcelaNumero,
    tipo: p.tipo as DividaPagamentoTipo,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  };
}

export function serializeDivida(
  d: DividaRow,
  opts?: { resumo?: ResumoDivida; includePagamentos?: boolean },
): DividaDTO {
  const dto: DividaDTO = {
    id: d.id,
    nome: d.nome,
    instituicao: d.instituicao,
    tipo: d.tipo as DividaTipo,
    modalidade: d.modalidade as DividaModalidade,
    principal: decimalOrNull(d.principal),
    taxaAm: decimalOrNull(d.taxaAm),
    taxaUnidadeEntrada: d.taxaUnidadeEntrada as 'am' | 'aa',
    prazoMeses: d.prazoMeses,
    sistema: (d.sistema as DividaSistema | null) ?? null,
    indexador: d.indexador as DividaIndexador,
    primeiroVencimento: d.primeiroVencimento,
    saldoInicial: decimalOrNull(d.saldoInicial),
    dataSaldoInicial: d.dataSaldoInicial,
    status: d.status as DividaStatus,
    notes: d.notes,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
  if (opts?.resumo) dto.resumo = opts.resumo;
  if (opts?.includePagamentos) {
    dto.pagamentos = (d.pagamentos ?? [])
      .map(serializePagamento)
      .sort((a, b) => a.month.localeCompare(b.month) || a.createdAt.localeCompare(b.createdAt));
  }
  return dto;
}

/** Inputs de cálculo (amortizacao.ts) a partir da row Prisma. */
export function toCalcInput(d: DividaRow) {
  return {
    modalidade: d.modalidade,
    principal: decimalOrNull(d.principal),
    taxaAm: decimalOrNull(d.taxaAm),
    prazoMeses: d.prazoMeses,
    sistema: d.sistema,
    primeiroVencimento: d.primeiroVencimento,
    saldoInicial: decimalOrNull(d.saldoInicial),
    dataSaldoInicial: d.dataSaldoInicial,
  };
}

export function toPagamentoInputs(pagamentos: PagamentoRow[] | undefined) {
  return (pagamentos ?? []).map((p) => ({
    valor: decimalToNumber(p.valor),
    parcelaNumero: p.parcelaNumero,
    tipo: p.tipo,
    month: p.month,
  }));
}
