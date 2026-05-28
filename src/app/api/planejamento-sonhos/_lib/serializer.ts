/**
 * Helpers compartilhados pelas rotas de Planejamento Sonhos (F3.2).
 *
 * Centraliza:
 *  - Conversão de `Decimal` (Prisma) → `number` (resposta JSON)
 *  - Shape do DTO devolvido pela API (compatível com o service em
 *    `src/services/planejamento/planejamentoSonhos.ts`)
 */

import type { Prisma } from '@prisma/client';

export type PlanejamentoPriority = 'Alta' | 'Moderado' | 'Baixa';
export type PlanejamentoCategory = 'c' | 'm' | 'l';
export type PlanejamentoStatus = 'Em espera' | 'Iniciado' | 'Pausado' | 'Atrasado' | 'Concluído';

export interface PlanejamentoEntryDTO {
  month: string;
  aporte: number;
  balance: number;
}

export interface PlanejamentoObjetivoDTO {
  id: string;
  name: string;
  target: number;
  months: number;
  startDate: string | null;
  available: number;
  rate: number;
  priority: PlanejamentoPriority;
  category: PlanejamentoCategory;
  status: PlanejamentoStatus;
  notes: string | null;
  entries: PlanejamentoEntryDTO[];
  createdAt: string;
  updatedAt: string;
}

// O Prisma serializa Decimal como objeto com .toNumber(); fallback pra Number()
// cobre casos em que o mock devolve number puro (testes).
type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export function decimalToNumber(v: DecimalLike): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return v.toNumber();
}

type EntryRow = {
  month: string;
  aporte: DecimalLike;
  balance: DecimalLike;
};

type ObjetivoRow = {
  id: string;
  name: string;
  target: DecimalLike;
  months: number;
  startDate: string | null;
  available: DecimalLike;
  rate: DecimalLike;
  priority: string;
  category: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  entries?: EntryRow[];
};

export function serializeEntry(e: EntryRow): PlanejamentoEntryDTO {
  return {
    month: e.month,
    aporte: decimalToNumber(e.aporte),
    balance: decimalToNumber(e.balance),
  };
}

export function serializeObjetivo(o: ObjetivoRow): PlanejamentoObjetivoDTO {
  const entries = (o.entries ?? [])
    .map(serializeEntry)
    .sort((a, b) => a.month.localeCompare(b.month));
  return {
    id: o.id,
    name: o.name,
    target: decimalToNumber(o.target),
    months: o.months,
    startDate: o.startDate ?? null,
    available: decimalToNumber(o.available),
    rate: decimalToNumber(o.rate),
    priority: o.priority as PlanejamentoPriority,
    category: o.category as PlanejamentoCategory,
    status: o.status as PlanejamentoStatus,
    notes: o.notes,
    entries,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}
