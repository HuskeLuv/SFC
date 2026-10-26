/**
 * Zod das rotas de escrita do Orçamento v2 (R-18, desenho técnico §6.2): valor ≥ 0 com até 2
 * casas; pct 0–100 com até 1 casa; mês 1–12 na API (o banco usa 0–11).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ErroEscritaOrcamento } from './escritaOrcado';

/** Tem no máximo `casas` decimais (tolerância de ponto flutuante: 0,1 + 0,2). */
const comCasas = (casas: number) => (n: number) => {
  const f = n * 10 ** casas;
  return Math.abs(f - Math.round(f)) < 1e-6;
};

/** Teto de Decimal(15,2). */
export const VALOR_MAX = 9_999_999_999_999.99;

export const anoSchema = z.number().int().min(1900).max(2100);
export const mesSchema = z.number().int().min(1).max(12);
export const fonteSchema = z.enum(['lancado', 'consolidado']);
export const valorSchema = z
  .number()
  .finite()
  .min(0)
  .max(VALOR_MAX)
  .refine(comCasas(2), 'Use no máximo 2 casas decimais');
export const pctSchema = z
  .number()
  .finite()
  .min(0)
  .max(100)
  .refine(comCasas(1), 'Use no máximo 1 casa decimal');

export const anoMesSchema = z.object({ ano: anoSchema, mes: mesSchema });

/** Corpo JSON como objeto (ou `null` se não for um objeto). */
export async function lerCorpo(request: Request): Promise<Record<string, unknown> | null> {
  const corpo: unknown = await request.json().catch(() => null);
  return corpo !== null && typeof corpo === 'object' && !Array.isArray(corpo)
    ? (corpo as Record<string, unknown>)
    : null;
}

/** Recusa da escrita → `{error, codigo}` com o status do erro (404/400). */
export function respostaErroEscrita(erro: ErroEscritaOrcamento): NextResponse {
  return NextResponse.json(
    { error: erro.message, codigo: erro.codigo },
    { status: erro.statusCode },
  );
}
