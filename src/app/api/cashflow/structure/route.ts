import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { getUserCashflowStructure } from '@/utils/cashflowSetup';

// Buscar estrutura do cashflow do usuário
export async function GET(req: NextRequest) {
  try {
    // Verificar autenticação
    const payload = requireAuth(req);
    
    const user = await prisma.user.findUnique({
      where: { email: payload.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar estrutura
    const structure = await getUserCashflowStructure(user.id);
    
    return NextResponse.json(structure);
  } catch (error) {
    console.error('Erro ao buscar estrutura:', error);
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
} 