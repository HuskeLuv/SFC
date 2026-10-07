import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import {
  pluggyDestinosHabilitado,
  type DestinoAtualResumo,
  type SituacaoDestino,
} from '@/lib/pluggyDestinos';
import { contarParaRevisar, destinoAtualPorPortfolio } from '@/services/pluggy/destinosImportacao';
import { requireProprioUsuarioPluggy } from '../_lib/auth';

/**
 * GET /api/pluggy/carteira — investimentos e empréstimos espelhados do banco,
 * com o status da importação para Carteira/Dívidas.
 *
 * Chave PLUGGY_DESTINOS_HABILITADO ligada (destino na importação, out/2026):
 * cada investimento ganha `destino` (onde está na Carteira) e `situacaoDestino`,
 * e a resposta ganha `paraRevisar`. Desligada: payload idêntico ao de antes.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const n = (v: { toString(): string } | null) => (v == null ? null : Number(v));

type InvestimentoDestino = {
  ativo: boolean;
  importStatus: string;
  portfolioId: string | null;
  destinoConfirmadoEm: Date | null;
};

/**
 * Situação barata (sem a regra do mover): classificarDestinos já marcou como
 * conferidos os importados SEM escolha, então importado + coluna null + posição
 * existente = 'para-revisar' — o mesmo filtro de contarParaRevisar. Importado e
 * conferido sai 'confirmado' (a distinção 'fixo' fica no GET /destinos). null =
 * fora da revisão (pendente, ignorado, erro, inativo).
 */
function situacaoDe(
  i: InvestimentoDestino,
  destino: DestinoAtualResumo | null,
): SituacaoDestino | null {
  if (!i.ativo) return null;
  if (i.importStatus === 'vinculado') return 'ja-estava';
  if (i.importStatus === 'sem-suporte') return 'sem-suporte';
  if (i.importStatus !== 'importado') return null;
  if (!destino) return 'fora-da-carteira';
  return i.destinoConfirmadoEm ? 'confirmado' : 'para-revisar';
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await requireProprioUsuarioPluggy(request);
  const [investimentos, emprestimos] = await Promise.all([
    prisma.bankInvestment.findMany({
      where: { userId: user.id },
      include: { connection: { select: { connectorName: true } } },
      orderBy: [{ ativo: 'desc' }, { balance: 'desc' }],
    }),
    prisma.bankLoan.findMany({
      where: { userId: user.id },
      include: { connection: { select: { connectorName: true } } },
      orderBy: [{ ativo: 'desc' }, { outstanding: 'desc' }],
    }),
  ]);
  const comDestinos = pluggyDestinosHabilitado();
  const portfolioIds = [
    ...new Set(investimentos.map((i) => i.portfolioId).filter((id): id is string => !!id)),
  ];
  const [destinos, paraRevisar] = comDestinos
    ? await Promise.all([
        destinoAtualPorPortfolio(user.id, portfolioIds),
        contarParaRevisar(user.id),
      ])
    : [null, 0];
  const camposDestino = (i: InvestimentoDestino) => {
    if (!destinos) return {};
    const destino = i.portfolioId ? (destinos.get(i.portfolioId) ?? null) : null;
    return { destino, situacaoDestino: situacaoDe(i, destino) };
  };

  return NextResponse.json(
    {
      ...(comDestinos ? { paraRevisar } : {}),
      investimentos: investimentos.map((i) => ({
        id: i.id,
        banco: i.connection.connectorName,
        type: i.type,
        subtype: i.subtype,
        name: i.name,
        code: i.code,
        balance: Number(i.balance),
        quantity: i.quantity,
        amountOriginal: n(i.amountOriginal),
        rate: i.rate,
        rateType: i.rateType,
        dueDate: iso(i.dueDate),
        issuer: i.issuer,
        status: i.status,
        ativo: i.ativo,
        assetId: i.assetId,
        portfolioId: i.portfolioId,
        importStatus: i.importStatus,
        importError: i.importError,
        importedAt: iso(i.importedAt),
        ...camposDestino(i),
      })),
      emprestimos: emprestimos.map((l) => ({
        id: l.id,
        banco: l.connection.connectorName,
        productName: l.productName,
        type: l.type,
        contractAmount: n(l.contractAmount),
        outstanding: n(l.outstanding),
        nextInstallmentAmount: n(l.nextInstallmentAmount),
        cet: l.cet,
        amortization: l.amortization,
        totalInstallments: l.totalInstallments,
        paidInstallments: l.paidInstallments,
        dueDate: iso(l.dueDate),
        ativo: l.ativo,
        dividaId: l.dividaId,
        importStatus: l.importStatus,
        importError: l.importError,
        importedAt: iso(l.importedAt),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
