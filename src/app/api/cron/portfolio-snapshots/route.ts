import { NextRequest, NextResponse } from 'next/server';
import { runPortfolioSnapshotsJob } from '@/services/portfolioSnapshotPersistence';

/**
 * Cron HTTP (ex.: Vercel): GET com Authorization: Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 });
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const result = await runPortfolioSnapshotsJob();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/portfolio-snapshots]', error);
    return NextResponse.json({ error: 'Falha ao executar job' }, { status: 500 });
  }
}
