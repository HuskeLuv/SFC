import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { exigirAcessoOrcamentoV2 } from '@/services/cashflow/orcamentoV2/acesso';
import { exigirOrcamentoV2Ativado } from '@/services/cashflow/orcamentoV2/rotaExclusao';
import { fonteSchema, lerCorpo } from '@/services/cashflow/orcamentoV2/esquemasEscrita';
import type { FonteOrcamento, PrefsEscritaResponse } from '@/types/orcamentoV2';
import { validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * PUT /api/cashflow/orcamento/v2/prefs — preferências de tela do Orçamento v2 (R-11, global e não
 * por mês): `{categoriasRecolhidas?, graficoVisivel?, fonte?, avisoGeralVisto?}`, ao menos um.
 * `avisoGeralVisto: true` grava a data em que o aviso da Geral foi visto (mantém a primeira);
 * `false` volta a mostrá-lo. A UI chama com debounce de 500 ms.
 *
 * 200 `{categoriasRecolhidas, graficoVisivel, fonte, avisoGeralPendente}`; 400 corpo inválido.
 * Flag/beta → 404; não ativado → 409 (as prefs nascem na ativação). Sem histórico (preferência de
 * tela). Sempre do targetUserId; CSRF pelo middleware.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Ids de CashflowGroup (uuid/cuid); teto folgado sobre as ~13 categorias + as do usuário. */
const MAX_RECOLHIDAS = 200;

const prefsSchema = z
  .object({
    categoriasRecolhidas: z.array(z.string().min(1).max(64)).max(MAX_RECOLHIDAS).optional(),
    graficoVisivel: z.boolean().optional(),
    fonte: fonteSchema.optional(),
    avisoGeralVisto: z.boolean().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'Informe ao menos uma preferência',
  });

const fonteValida = (f: string): FonteOrcamento =>
  f === 'consolidado' ? 'consolidado' : 'lancado';

export const PUT = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await exigirAcessoOrcamentoV2(request);
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/orcamento/v2/prefs',
    'PUT',
  );
  await exigirOrcamentoV2Ativado(targetUserId);

  const corpo = await lerCorpo(request);
  if (!corpo) return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  const parsed = prefsSchema.safeParse(corpo);
  if (!parsed.success) return validationError(parsed);
  const p = parsed.data;

  let avisoGeralVistoEm: Date | null | undefined;
  if (p.avisoGeralVisto === false) avisoGeralVistoEm = null;
  else if (p.avisoGeralVisto === true) {
    const atual = await prisma.cashflowOrcamentoPrefs.findUnique({
      where: { userId: targetUserId },
      select: { avisoGeralVistoEm: true },
    });
    avisoGeralVistoEm = atual?.avisoGeralVistoEm ?? new Date();
  }

  const salvo = await prisma.cashflowOrcamentoPrefs.update({
    where: { userId: targetUserId },
    data: {
      ...(p.categoriasRecolhidas !== undefined && {
        categoriasRecolhidas: [...new Set(p.categoriasRecolhidas)],
      }),
      ...(p.graficoVisivel !== undefined && { graficoVisivel: p.graficoVisivel }),
      ...(p.fonte !== undefined && { fonte: p.fonte }),
      ...(avisoGeralVistoEm !== undefined && { avisoGeralVistoEm }),
    },
    select: {
      categoriasRecolhidas: true,
      graficoVisivel: true,
      fonte: true,
      estruturaCriadaEm: true,
      avisoGeralVistoEm: true,
    },
  });

  const resposta: PrefsEscritaResponse = {
    categoriasRecolhidas: salvo.categoriasRecolhidas,
    graficoVisivel: salvo.graficoVisivel,
    fonte: fonteValida(salvo.fonte),
    avisoGeralPendente: salvo.estruturaCriadaEm != null && salvo.avisoGeralVistoEm == null,
  };
  return NextResponse.json(resposta, { headers: { 'Cache-Control': 'no-store' } });
});
