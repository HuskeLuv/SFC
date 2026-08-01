import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationError } from '@/utils/validation-schemas';
import { parseFlcXlsx, FlcParseError, type FlcParseResult } from './parseFlcXlsx';

/**
 * Leitura comum do multipart das rotas de import (preview e commit):
 * campos `file` (.xlsx) e `ano`. Arquivo processado só em memória (LGPD:
 * nada é persistido). Devolve o IR já parseado ou a resposta de erro pronta.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // ~10 MB (plano §5)

const optionsSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
});

export type LeituraImport =
  | { ok: true; ano: number; arquivo: string; form: FormData; parse: FlcParseResult }
  | { ok: false; response: NextResponse };

export const lerPlanilhaImport = async (request: NextRequest): Promise<LeituraImport> => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Requisição inválida: esperado multipart/form-data com o arquivo da planilha' },
        { status: 400 },
      ),
    };
  }

  const parsed = optionsSchema.safeParse({ ano: form.get('ano') });
  if (!parsed.success) {
    return { ok: false, response: validationError(parsed) };
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Arquivo ausente: envie a planilha .xlsx no campo "file"' },
        { status: 400 },
      ),
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Arquivo muito grande: o limite é 10 MB' },
        { status: 413 },
      ),
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    return {
      ok: true,
      ano: parsed.data.ano,
      arquivo: file.name,
      form,
      parse: parseFlcXlsx(buffer),
    };
  } catch (error: unknown) {
    if (error instanceof FlcParseError) {
      return { ok: false, response: NextResponse.json({ error: error.message }, { status: 400 }) };
    }
    throw error;
  }
};
