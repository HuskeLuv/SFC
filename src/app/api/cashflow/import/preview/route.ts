import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthWithActing } from '@/utils/auth';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { validationError } from '@/utils/validation-schemas';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { parseFlcXlsx, FlcParseError } from '@/services/cashflow/import/parseFlcXlsx';
import { mapFlcToCashflow } from '@/services/cashflow/import/mapFlcToCashflow';

/**
 * POST /api/cashflow/import/preview
 *
 * Recebe a planilha FLC (multipart/form-data: `file` = .xlsx, `ano` = ano-alvo)
 * e devolve o plano de importação SEM gravar nada — o commit é outra rota.
 * Arquivo processado só em memória (LGPD: nada é persistido no preview).
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // ~10 MB (plano §5)

const optionsSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { payload, targetUserId, actingClient } = auth;
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/import/preview',
    'POST',
  );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Requisição inválida: esperado multipart/form-data com o arquivo da planilha' },
      { status: 400 },
    );
  }

  const parsed = optionsSchema.safeParse({ ano: form.get('ano') });
  if (!parsed.success) {
    return validationError(parsed);
  }
  const { ano } = parsed.data;

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Arquivo ausente: envie a planilha .xlsx no campo "file"' },
      { status: 400 },
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Arquivo muito grande: o limite é 10 MB' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parse;
  try {
    parse = parseFlcXlsx(buffer);
  } catch (error: unknown) {
    if (error instanceof FlcParseError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const arvore = await getMergedCashflowGroups(targetUserId, ano);
  const plan = mapFlcToCashflow(parse, arvore);

  return NextResponse.json({ ano, arquivo: file.name, plan });
});
