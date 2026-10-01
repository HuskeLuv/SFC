/**
 * Leituras dos informes de FII (tabelas da fatia B) para a fatia D.
 */
import type { PrismaClient } from '@prisma/client';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import type { FiiMes, FiiTipo, FiiTrimestre, Regua } from '@/services/analiseAtivos/tipos';

export async function fiiMensalSerie(
  prisma: PrismaClient,
  cnpjs: string[],
  desde: string,
): Promise<FiiMes[]> {
  if (cnpjs.length === 0) return [];
  const linhas = await prisma.fiiMonthly.findMany({
    where: { cnpj: { in: cnpjs }, refMonth: { gte: deData(desde) } },
    orderBy: [{ cnpj: 'asc' }, { refMonth: 'asc' }],
  });
  return linhas.map((l) => ({
    cnpj: l.cnpj,
    refMonth: paraData(l.refMonth),
    vpCota: paraNumero(l.vpCota),
    pl: paraNumero(l.pl),
    cotas: paraNumero(l.cotas),
    cotistas: l.cotistas,
    passivoTotal: paraNumero(l.passivoTotal),
    rendDistribuir: paraNumero(l.rendDistribuir),
    imoveis: paraNumero(l.imoveis),
    spe: paraNumero(l.spe),
    cri: paraNumero(l.cri),
    lciLca: paraNumero(l.lciLca),
    cotasFii: paraNumero(l.cotasFii),
    tipoComposicao: l.tipoComposicao as FiiTipo | null,
    tipoVigente: l.tipoVigente as FiiTipo | null,
    reguaVigente: l.reguaVigente as Regua | null,
    obrigacoesPlPct: l.obrigacoesPlPct,
    segmentoCvm: l.segmentoCvm,
    fatorDesdobramento: l.fatorDesdobramento,
    flags: l.flags,
  }));
}

/** FIIs com informe mensal ou trimestral gravado depois de `desde` (a D recalcula só esses). */
export async function fiisAlteradosDesde(prisma: PrismaClient, desde: Date): Promise<string[]> {
  const [mensal, trimestral] = await Promise.all([
    prisma.fiiMonthly.findMany({
      where: { fetchedAt: { gt: desde } },
      select: { cnpj: true },
      distinct: ['cnpj'],
    }),
    prisma.fiiQuarterly.findMany({
      where: { fetchedAt: { gt: desde } },
      select: { cnpj: true },
      distinct: ['cnpj'],
    }),
  ]);
  return [...new Set([...mensal, ...trimestral].map((l) => l.cnpj))].sort();
}

/** Últimos `n` trimestres de cada FII (mais recente primeiro). */
export async function fiiTrimestralUltimos(
  prisma: PrismaClient,
  cnpjs: string[],
  n = 1,
): Promise<FiiTrimestre[]> {
  if (cnpjs.length === 0 || n <= 0) return [];
  const linhas = await prisma.fiiQuarterly.findMany({
    where: { cnpj: { in: cnpjs } },
    orderBy: [{ cnpj: 'asc' }, { refQuarter: 'desc' }],
    select: {
      cnpj: true,
      refQuarter: true,
      nImoveisRenda: true,
      areaM2: true,
      vacanciaFisicaCvmPct: true,
      inadimplenciaCvmPct: true,
      nCri: true,
      maiorCriPct: true,
      flags: true,
    },
  });
  const contagem = new Map<string, number>();
  const out: FiiTrimestre[] = [];
  for (const l of linhas) {
    const k = contagem.get(l.cnpj) ?? 0;
    if (k >= n) continue;
    contagem.set(l.cnpj, k + 1);
    out.push({ ...l, refQuarter: paraData(l.refQuarter) });
  }
  return out;
}

export async function fiiOverrides(prisma: PrismaClient): Promise<Map<string, FiiTipo>> {
  const linhas = await prisma.fiiTipoOverride.findMany({ select: { cnpj: true, tipo: true } });
  return new Map(linhas.map((l) => [l.cnpj, l.tipo as FiiTipo]));
}
