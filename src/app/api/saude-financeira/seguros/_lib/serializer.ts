/**
 * Helpers das rotas de Seguros — conversão Decimal → number e o DTO
 * compartilhado com o hook useSeguros (padrão do serializer de Dívidas).
 */

import type { Prisma } from '@prisma/client';

export type SeguroTipo = 'vida' | 'saude' | 'auto' | 'residencial' | 'invalidez' | 'outro';
export type SeguroCobertura = 'total' | 'parcial' | 'nenhuma';
export type SeguroRisco = 'baixo' | 'medio' | 'alto';

// Type alias (não interface) de propósito: ganha index signature implícita,
// que o diffFields do histórico exige (Record<string, unknown>).
export type SeguroDTO = {
  id: string;
  nome: string;
  tipo: SeguroTipo;
  cobertura: SeguroCobertura;
  risco: SeguroRisco;
  custoAnual: number;
  capitalSegurado: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

const toNumber = (v: DecimalLike): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return v.toNumber();
};

export type SeguroRow = {
  id: string;
  nome: string;
  tipo: string;
  cobertura: string;
  risco: string;
  custoAnual: DecimalLike;
  capitalSegurado: DecimalLike;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeSeguro(row: SeguroRow): SeguroDTO {
  return {
    id: row.id,
    nome: row.nome,
    tipo: row.tipo as SeguroTipo,
    cobertura: row.cobertura as SeguroCobertura,
    risco: row.risco as SeguroRisco,
    custoAnual: toNumber(row.custoAnual),
    capitalSegurado: row.capitalSegurado == null ? null : toNumber(row.capitalSegurado),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
