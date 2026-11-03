import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { requireAdmin } from '@/utils/auth';
import { getCsatAdmin } from '@/services/admin/csat';

/**
 * GET /api/admin/csat — KPI de CSAT (ClickUp 86e3vmyup). Só `role === 'admin'`; somente leitura.
 *
 * Query (opcional):
 *  - de=YYYY-MM-DD   respostas a partir desse dia (00:00 UTC, inclusive)
 *  - ate=YYYY-MM-DD  até esse dia (inclusive)
 *  - limite=N        itens da lista (padrão 200, máx. 1000); o resumo considera o período inteiro
 *
 * Resposta: resumo { respostas, media, distribuicao 1–5, promotores, pctPromotores } + itens
 * { data, nota, comentario, cliente }.
 */
export const dynamic = 'force-dynamic';

const LIMITE_PADRAO = 200;
const LIMITE_MAX = 1000;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDia(v: string | null): Date | null | 'invalido' {
  if (!v) return null;
  if (!DIA_RE.test(v)) return 'invalido';
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? 'invalido' : d;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin(request);
  const sp = request.nextUrl.searchParams;

  const de = parseDia(sp.get('de'));
  const ateDia = parseDia(sp.get('ate'));
  if (de === 'invalido' || ateDia === 'invalido') {
    return NextResponse.json({ error: 'Datas no formato AAAA-MM-DD' }, { status: 400 });
  }
  // `ate` inclusive: corta no início do dia seguinte.
  const ate = ateDia ? new Date(ateDia.getTime() + 86_400_000) : null;

  const limiteBruto = Number(sp.get('limite') ?? LIMITE_PADRAO);
  const limite = Number.isFinite(limiteBruto)
    ? Math.min(Math.max(Math.trunc(limiteBruto), 1), LIMITE_MAX)
    : LIMITE_PADRAO;

  const dados = await getCsatAdmin({ de, ate, limite });
  return NextResponse.json(dados, { headers: { 'Cache-Control': 'no-store' } });
});
