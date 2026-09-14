import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { prisma } from '@/lib/prisma';
import { requireProprioUsuarioPluggy } from '../_lib/auth';

/**
 * GET /api/pluggy/carteira — investimentos e empréstimos espelhados do banco,
 * com o status da importação para Carteira/Dívidas.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const n = (v: { toString(): string } | null) => (v == null ? null : Number(v));

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
  return NextResponse.json(
    {
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
