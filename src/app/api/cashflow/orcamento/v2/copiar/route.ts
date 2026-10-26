import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { exigirAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import { exigirOrcamentoV2Ativado } from '@/services/cashflow/orcamentoV2/rotaExclusao';
import { copiarMes } from '@/services/cashflow/orcamentoV2/copiarMes';
import { anoMesSchema, lerCorpo } from '@/services/cashflow/orcamentoV2/esquemasEscrita';
import type { CopiarMesResponse } from '@/types/orcamentoV2';
import { validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * POST /api/cashflow/orcamento/v2/copiar — R-13, copia o orçado de um mês para outro (desenho
 * técnico §6.3, Q8). Corpo `{de: {ano, mes}, para: {ano, mes}, sobrescrever}` (meses 1–12).
 * `sobrescrever: false` ("Só preencher vazios") não toca nas subcategorias já orçadas no destino;
 * `true` ("Substituir tudo") as substitui. Subcategoria sem orçado na origem não muda.
 *
 * 200 `{copiados, ignorados}`; 400 corpo inválido ou origem = destino. Flag/beta → 404; não
 * ativado → 409. Histórico `orcamento.copiar` com Desfazer (só quando algo foi escrito); CSRF pelo
 * middleware; sempre o targetUserId.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const copiarSchema = z
  .object({ de: anoMesSchema, para: anoMesSchema, sobrescrever: z.boolean() })
  .refine((c) => c.de.ano !== c.para.ano || c.de.mes !== c.para.mes, {
    message: 'Origem e destino são o mesmo mês',
    path: ['para'],
  });

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await exigirAcessoOrcamentoV2(request);
  const { payload, targetUserId, actingClient } = auth;
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/orcamento/v2/copiar',
    'POST',
  );
  await exigirOrcamentoV2Ativado(targetUserId);

  const corpo = await lerCorpo(request);
  if (!corpo) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  const parsed = copiarSchema.safeParse(corpo);
  if (!parsed.success) return validationError(parsed);
  const { de, para, sobrescrever } = parsed.data;

  const { copiados, ignorados } = await copiarMes(
    targetUserId,
    {
      de: { ano: de.ano, mes0: de.mes - 1 },
      para: { ano: para.ano, mes0: para.mes - 1 },
      sobrescrever,
    },
    { contexto: { request, auth } },
  );
  const resposta: CopiarMesResponse = { copiados, ignorados };
  return NextResponse.json(resposta);
});
