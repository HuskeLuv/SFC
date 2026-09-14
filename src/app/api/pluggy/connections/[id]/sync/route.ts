import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { atualizarManualmente } from '@/services/pluggy/sync';
import { requireProprioUsuarioPluggy } from '../../../_lib/auth';
import { serializeConnection } from '../../../_lib/serializer';

/**
 * POST /api/pluggy/connections/[id]/sync — "Atualizar agora". Pede ao Pluggy
 * para ressincronizar o item (cooldown de 6 h por conexão); os dados chegam
 * pelo webhook item/updated → cron.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const user = await requireProprioUsuarioPluggy(request);
    const { id } = await context.params;
    const conexao = await atualizarManualmente(id, user.id);
    return NextResponse.json({ connection: serializeConnection(conexao) }, { status: 202 });
  },
);
