import type { PrismaClient } from '@prisma/client';
import { prisma as prismaPadrao } from '@/lib/prisma';

/**
 * Subgrupo (seção da aba) de uma posição importada do banco. Antes a importação
 * não preenchia nada e tudo caía no default da aba: FII em "FOFI" e fundo manual
 * em "FIM" (ticket 01/10/2026 do Pedro).
 */

/** Valores de Portfolio.tipoFii aceitos pela aba FIIs (ver api/carteira/fii). */
export type TipoFiiCarteira = 'fofi' | 'tvm' | 'tijolo' | 'infra';

/** tipoVigente da Análise de Ativos (tijolo | papel | fof | hibrido | indefinido) → seção da aba. */
export function tipoFiiDoTipoVigente(tipo: string | null | undefined): TipoFiiCarteira | null {
  switch (tipo) {
    case 'tijolo':
    case 'hibrido':
      return 'tijolo';
    case 'papel':
      return 'tvm';
    case 'fof':
      return 'fofi';
    default:
      return null;
  }
}

/**
 * Pelo nome do fundo, quando o catálogo da CVM não classifica. FI-Infra (BIDB11,
 * KDIF11, CPTI11…) não é FII na CVM, então só o nome resolve.
 */
export function tipoFiiPeloNome(nome: string | null | undefined): TipoFiiCarteira | null {
  const n = (nome ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (!n) return null;
  if (/\binfra\b|infraestrutura/.test(n)) return 'infra';
  if (/fundo de fundos|\bfof\b|\bfofii?\b/.test(n)) return 'fofi';
  if (/credito imobiliario|recebiveis|\bcri\b|\bpapel\b/.test(n)) return 'tvm';
  return null;
}

/**
 * Seção de um FII: catálogo da CVM (ticker → CNPJ → tipo vigente mais recente),
 * depois o nome, e por fim "tijolo" (o tipo mais comum).
 */
export async function tipoFiiImportado(
  ticker: string,
  nome: string | null | undefined,
  prisma: PrismaClient = prismaPadrao,
): Promise<TipoFiiCarteira> {
  const peloNome = tipoFiiPeloNome(nome);
  if (peloNome === 'infra') return peloNome;
  const mapa = await prisma.fiiTickerMap.findFirst({
    where: { ticker, validTo: null },
    orderBy: { validFrom: 'desc' },
    select: { cnpj: true },
  });
  if (mapa) {
    const mensal = await prisma.fiiMonthly.findFirst({
      where: { cnpj: mapa.cnpj, tipoVigente: { not: null } },
      orderBy: [{ refMonth: 'desc' }, { versao: 'desc' }],
      select: { tipoVigente: true },
    });
    const doCatalogo = tipoFiiDoTipoVigente(mensal?.tipoVigente);
    if (doCatalogo) return doCatalogo;
  }
  return peloNome ?? 'tijolo';
}

/**
 * Asset.type de um fundo manual (sem catálogo pelo CNPJ) a partir do subtipo do
 * Pluggy, para cair na seção certa da aba Fundos (ver ASSET_TYPE_TO_FUNDO_SUBTIPO).
 */
export function tipoAssetFundoPluggy(subtype: string | null | undefined): string {
  switch (subtype) {
    case 'FIXED_INCOME_FUND':
      return 'fund-rf';
    case 'STOCK_FUND':
      return 'fia';
    case 'MULTIMARKET_FUND':
      return 'multimercado';
    case 'EXCHANGE_FUND':
      return 'fund-cambial';
    case 'FIP_FUND':
      return 'fip';
    case 'FIDC_FUND':
      return 'fidc';
    default:
      return 'fund';
  }
}
