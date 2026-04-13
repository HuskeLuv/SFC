import { NextRequest, NextResponse } from 'next/server';

import { runCvmFundSync } from '@/services/pricing/cvmFundSync';
import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * Cron HTTP: GET com Authorization: Bearer CRON_SECRET
 *
 * Baixa cotas diárias de fundos de investimento do portal de dados
 * abertos da CVM e persiste na tabela CvmFundQuota. Apenas fundos
 * com CNPJ cadastrado em ativos de usuários são sincronizados.
 *
 * Agendado em vercel.json (06:30 UTC).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const result = await runCvmFundSync();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/cvm-fund-sync]', error);
    return NextResponse.json(
      { error: 'Falha ao sincronizar dados CVM de fundos' },
      { status: 500 },
    );
  }
});
