import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { CODIGO_PREFIXOS_NAO_EMISSOR, TIPOS_BACEN_EMISSORES } from '@/lib/fgc/produtosCobertos';
import { somenteDigitos } from '@/lib/instituicoes/cnpj';
import { normalizarBusca } from '@/lib/instituicoes/normalizarNome';

const LIMIT_PADRAO = 200;
const LIMIT_MAXIMO = 500;

/** limit entre 1 e 500; inválido vira o padrão. */
function lerLimit(valor: string | null): number {
  const n = parseInt(valor ?? '', 10);
  if (!Number.isFinite(n)) return LIMIT_PADRAO;
  return Math.min(LIMIT_MAXIMO, Math.max(1, n));
}

/**
 * GET /api/institutions?search=&limit=&papel=emissor
 *
 * Catálogo de instituições ATIVAS, por nome asc. A busca procura no nome, no codigo, nos
 * apelidos (sem acento, minúsculas) e, com 4 ou mais dígitos, no início do CNPJ.
 * papel=emissor deixa só quem emite renda fixa coberta pelo FGC: Tcb emissor ou sem tipo
 * conhecido, fora das linhas com prefixo de código não emissor (COR-, PREV-, RESERVA-...).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim();
  const limit = lerLimit(searchParams.get('limit'));
  const papel = searchParams.get('papel');

  const filtros: Prisma.InstitutionWhereInput[] = [{ status: 'ATIVA' }];

  if (search) {
    const termos: Prisma.InstitutionWhereInput[] = [
      { nome: { contains: search, mode: 'insensitive' } },
      { codigo: { contains: search, mode: 'insensitive' } },
    ];
    const busca = normalizarBusca(search);
    if (busca) termos.push({ apelidos: { contains: busca } });
    const digitos = somenteDigitos(search);
    if (digitos.length >= 4) termos.push({ cnpj: { startsWith: digitos } });
    filtros.push({ OR: termos });
  }

  if (papel === 'emissor') {
    filtros.push({
      OR: [{ tipoBacen: { in: [...TIPOS_BACEN_EMISSORES] } }, { tipoBacen: null }],
    });
    filtros.push({
      NOT: CODIGO_PREFIXOS_NAO_EMISSOR.map((prefixo) => ({
        codigo: { startsWith: prefixo, mode: 'insensitive' as const },
      })),
    });
  }

  const institutions = await prisma.institution.findMany({
    where: { AND: filtros },
    take: limit,
    orderBy: { nome: 'asc' },
  });

  return NextResponse.json({
    success: true,
    institutions: institutions.map((inst) => ({
      id: inst.id,
      nome: inst.nome,
      codigo: inst.codigo,
      status: inst.status,
      cnpj: inst.cnpj,
      cnpjCalculado: inst.cnpjCalculado,
      tipoBacen: inst.tipoBacen,
    })),
    count: institutions.length,
  });
});
