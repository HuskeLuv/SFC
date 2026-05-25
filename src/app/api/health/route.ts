import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error('[health] db check failed', error);
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        error: 'database unreachable',
      },
      { status: 503 },
    );
  }
}
