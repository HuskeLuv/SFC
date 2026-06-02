/**
 * Helpers de serialização das rotas do Simulador de Aposentadoria.
 *
 * Converte `Decimal` (Prisma) → `number` e devolve um DTO compatível com o
 * service em `src/services/planejamento/aposentadoria.ts` e com os hooks.
 */

import type { Prisma } from '@prisma/client';
import { decimalToNumber } from '@/app/api/planejamento-sonhos/_lib/serializer';
import type { AposentadoriaEvento, EventoTipo } from '@/services/planejamento/aposentadoria';

export type { AposentadoriaEvento };

export interface AposentadoriaEntryDTO {
  off: number;
  year: number;
  month: number;
  aporteReal: number;
  patFinal: number;
}

export interface AposentadoriaPlanoDTO {
  id: string;
  idade: number;
  apos: number;
  vida: number;
  rentNom: number;
  inflacao: number;
  rentNomRetiro: number | null;
  patrimonio: number;
  aporteM: number;
  renda: number;
  trackStartMonth: number;
  trackStartYear: number;
  eventos: AposentadoriaEvento[];
  entries: AposentadoriaEntryDTO[];
  createdAt: string;
  updatedAt: string;
}

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type EntryRow = {
  off: number;
  year: number;
  month: number;
  aporteReal: DecimalLike;
  patFinal: DecimalLike;
};

type PlanoRow = {
  id: string;
  idade: number;
  apos: number;
  vida: number;
  rentNom: DecimalLike;
  inflacao: DecimalLike;
  rentNomRetiro: DecimalLike;
  patrimonio: DecimalLike;
  aporteM: DecimalLike;
  renda: DecimalLike;
  trackStartMonth: number;
  trackStartYear: number;
  eventos: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  entries?: EntryRow[];
};

/**
 * Coage o Json `eventos` (que vem como `unknown` do Prisma) num array tipado,
 * descartando entradas malformadas — robustez contra dados legados/manuais.
 */
export function parseEventos(raw: Prisma.JsonValue): AposentadoriaEvento[] {
  if (!Array.isArray(raw)) return [];
  const out: AposentadoriaEvento[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const tipo = obj.tipo === 'resgate' ? 'resgate' : 'aporte';
    const idade = Number(obj.idade);
    const valor = Number(obj.valor);
    if (Number.isFinite(idade) && Number.isFinite(valor)) {
      out.push({ tipo: tipo as EventoTipo, idade, valor });
    }
  }
  return out;
}

export function serializeEntry(e: EntryRow): AposentadoriaEntryDTO {
  return {
    off: e.off,
    year: e.year,
    month: e.month,
    aporteReal: decimalToNumber(e.aporteReal),
    patFinal: decimalToNumber(e.patFinal),
  };
}

export function serializePlano(p: PlanoRow): AposentadoriaPlanoDTO {
  const entries = (p.entries ?? []).map(serializeEntry).sort((a, b) => a.off - b.off);
  return {
    id: p.id,
    idade: p.idade,
    apos: p.apos,
    vida: p.vida,
    rentNom: decimalToNumber(p.rentNom),
    inflacao: decimalToNumber(p.inflacao),
    rentNomRetiro: p.rentNomRetiro == null ? null : decimalToNumber(p.rentNomRetiro),
    patrimonio: decimalToNumber(p.patrimonio),
    aporteM: decimalToNumber(p.aporteM),
    renda: decimalToNumber(p.renda),
    trackStartMonth: p.trackStartMonth,
    trackStartYear: p.trackStartYear,
    eventos: parseEventos(p.eventos),
    entries,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
