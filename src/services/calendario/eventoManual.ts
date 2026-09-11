/**
 * Evento manual (tabela Event): conversões entre o registro do Prisma, o DTO
 * da API (em português, datas civis) e os campos comparáveis do histórico.
 */
import type { Event } from '@prisma/client';
import { dataCivil, deDataCivil } from './datas';

export const CATEGORIAS_EVENTO = ['pessoal', 'pagamento', 'recebimento', 'lembrete'] as const;
export type CategoriaEvento = (typeof CATEGORIAS_EVENTO)[number];

export const RECORRENCIAS_EVENTO = ['nenhuma', 'mensal', 'anual'] as const;
export type RecorrenciaEvento = (typeof RECORRENCIAS_EVENTO)[number];

/** Campos editáveis, como o app e o histórico os veem (só strings/booleans). */
export interface CamposEvento {
  titulo: string;
  descricao: string | null;
  data: string;
  dataFim: string | null;
  hora: string | null;
  categoria: string;
  recorrencia: string;
  lembrete: boolean;
}

export interface EventoManualDto extends CamposEvento {
  id: string;
  criadoEm: string;
  atualizadoEm: string;
}

export function camposDoEvento(e: Event): CamposEvento {
  return {
    titulo: e.title,
    descricao: e.description ?? null,
    data: dataCivil(e.date),
    dataFim: e.endDate ? dataCivil(e.endDate) : null,
    hora: e.hora ?? null,
    categoria: e.categoria,
    recorrencia: e.recorrencia,
    lembrete: e.lembrete,
  };
}

export function serializarEvento(e: Event): EventoManualDto {
  return {
    id: e.id,
    ...camposDoEvento(e),
    criadoEm: e.createdAt.toISOString(),
    atualizadoEm: e.updatedAt.toISOString(),
  };
}

/** Campos do DTO → colunas do Prisma (só os presentes). */
export function paraPrisma(campos: Partial<CamposEvento>): {
  title?: string;
  description?: string | null;
  date?: Date;
  endDate?: Date | null;
  hora?: string | null;
  categoria?: string;
  recorrencia?: string;
  lembrete?: boolean;
} {
  const out: ReturnType<typeof paraPrisma> = {};
  if (campos.titulo !== undefined) out.title = campos.titulo;
  if (campos.descricao !== undefined) out.description = campos.descricao;
  if (campos.data !== undefined) out.date = deDataCivil(campos.data);
  if (campos.dataFim !== undefined)
    out.endDate = campos.dataFim ? deDataCivil(campos.dataFim) : null;
  if (campos.hora !== undefined) out.hora = campos.hora;
  if (campos.categoria !== undefined) out.categoria = campos.categoria;
  if (campos.recorrencia !== undefined) out.recorrencia = campos.recorrencia;
  if (campos.lembrete !== undefined) out.lembrete = campos.lembrete;
  return out;
}
