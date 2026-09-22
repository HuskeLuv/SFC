import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { getClientIp } from '@/lib/rateLimit';
import { excluirConexao } from '@/services/pluggy/sync';
import { requireProprioUsuarioPluggy } from '../../_lib/auth';

/** DELETE /api/pluggy/connections/[id] — exclui no Pluggy (consentimento) e no ledger. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireProprioUsuarioPluggy(request);
    const { id } = await context.params;
    await excluirConexao(id, user.id, getClientIp(request));
    return NextResponse.json({ ok: true });
  },
);
