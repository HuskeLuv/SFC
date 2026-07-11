import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@/utils/auth';
import { cashflowIdPatchSchema, validationError } from '@/utils/validation-schemas';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  recordChange,
  diffFields,
  finalStateChanges,
  LANCAMENTO_FIELD_LABELS,
} from '@/services/changeHistory';

// Rota autenticada via JWT direto (sem impersonation) — o histórico registra
// o próprio usuário como dono e ator (mesmo padrão de /api/profile).
const selfAuth = (userId: string) => ({
  payload: { id: userId },
  targetUserId: userId,
  actingClient: null,
});

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const token = req.cookies.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      const userId = payload.id;
      const item = await prisma.cashflow.findFirst({ where: { id, userId } });
      if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
      return NextResponse.json(item);
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
  },
);

export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const token = req.cookies.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      const userId = payload.id;
      const body = await req.json();
      const parsed = cashflowIdPatchSchema.safeParse(body);
      if (!parsed.success) {
        return validationError(parsed);
      }
      const { data, tipo, categoria, descricao, valor, forma_pagamento, pago } = parsed.data;

      // Estado anterior: alimenta o diff do histórico (e o undo por restauração).
      const before = await prisma.cashflow.findFirst({ where: { id, userId } });
      if (!before) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

      const updateData = {
        ...(data && { data: new Date(data) }),
        ...(tipo && { tipo }),
        ...(categoria && { categoria }),
        ...(descricao && { descricao }),
        ...(typeof valor === 'number' && { valor }),
        ...(forma_pagamento && { forma_pagamento }),
        ...(typeof pago === 'boolean' && { pago }),
      };
      await prisma.cashflow.update({ where: { id: before.id }, data: updateData });
      const item = await prisma.cashflow.findUnique({ where: { id } });

      await recordChange({
        request: req,
        auth: selfAuth(userId),
        section: 'fluxo-caixa',
        // 'lancamento.*': o modelo legado Cashflow tem action própria — 'item.*'
        // pertence ao CashflowItem da planilha (rota cashflow/update).
        action: 'lancamento.editar',
        entity: 'lancamento',
        entityId: id,
        entityLabel: item?.descricao ?? descricao ?? undefined,
        changes: diffFields(before, updateData, LANCAMENTO_FIELD_LABELS),
      });

      return NextResponse.json(item);
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
  },
);

export const DELETE = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const token = req.cookies.get('token')?.value;
    if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      const userId = payload.id;
      // Estado pré-exclusão: rótulo legível + snapshot pra desfazer.
      const before = await prisma.cashflow.findFirst({ where: { id, userId } });
      if (!before) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

      await prisma.cashflow.delete({ where: { id: before.id } });

      await recordChange({
        request: req,
        auth: selfAuth(userId),
        section: 'fluxo-caixa',
        action: 'lancamento.excluir',
        entity: 'lancamento',
        entityId: id,
        entityLabel: before.descricao,
        changes: finalStateChanges(before, LANCAMENTO_FIELD_LABELS),
        snapshot: {
          v: 1,
          kind: 'lancamento',
          data: {
            id: before.id,
            data: before.data.toISOString(),
            tipo: before.tipo,
            categoria: before.categoria,
            descricao: before.descricao,
            valor: before.valor,
            forma_pagamento: before.forma_pagamento,
            pago: before.pago,
          },
        },
      });

      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }
  },
);
