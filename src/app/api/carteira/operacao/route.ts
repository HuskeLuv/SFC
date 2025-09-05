import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { 
      tipoAtivo,
      instituicaoId,
      assetId,
      dataCompra,
      quantidade,
      cotacaoUnitaria,
      taxaCorretagem = 0,
      valorTotal,
      observacoes
    } = await request.json();

    // Validações
    if (!tipoAtivo || !instituicaoId || !assetId || !dataCompra || !quantidade || !cotacaoUnitaria) {
      return NextResponse.json({ 
        error: 'Campos obrigatórios: tipoAtivo, instituicaoId, assetId, dataCompra, quantidade, cotacaoUnitaria' 
      }, { status: 400 });
    }

    if (quantidade <= 0 || cotacaoUnitaria <= 0) {
      return NextResponse.json({ 
        error: 'Quantidade e cotação unitária devem ser maiores que zero' 
      }, { status: 400 });
    }

    // Verificar se a instituição existe
    const instituicao = await prisma.institution.findUnique({
      where: { id: instituicaoId },
    });

    if (!instituicao) {
      return NextResponse.json({ error: 'Instituição não encontrada' }, { status: 404 });
    }

    // Verificar se o ativo existe
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
    }

    // Buscar ou criar Stock correspondente ao Asset
    let stock = await prisma.stock.findUnique({
      where: { ticker: asset.ticker },
    });

    if (!stock) {
      // Criar novo Stock baseado no Asset
      stock = await prisma.stock.create({
        data: {
          ticker: asset.ticker,
          companyName: asset.nome,
          sector: asset.setor || null,
          isActive: true,
        },
      });
    }

    // Calcular valor total se não fornecido
    const valorCalculado = (quantidade * cotacaoUnitaria) + (taxaCorretagem || 0);
    const valorFinal = valorTotal || valorCalculado;

    // Criar transação de compra
    const transacao = await prisma.stockTransaction.create({
      data: {
        userId: user.id,
        stockId: stock.id, // Usar o ID do Stock, não do Asset
        type: 'compra',
        quantity: quantidade,
        price: cotacaoUnitaria,
        total: valorFinal,
        date: new Date(dataCompra),
        fees: taxaCorretagem || 0,
        notes: observacoes || null,
      },
    });

    // Atualizar ou criar portfolio
    const portfolioExistente = await prisma.portfolio.findUnique({
      where: {
        userId_stockId: {
          userId: user.id,
          stockId: stock.id, // Usar o ID do Stock
        },
      },
    });

    if (portfolioExistente) {
      // Atualizar portfolio existente
      const novaQuantidade = portfolioExistente.quantity + quantidade;
      const novoTotalInvestido = portfolioExistente.totalInvested + valorFinal;
      const novoPrecoMedio = novoTotalInvestido / novaQuantidade;

      await prisma.portfolio.update({
        where: { id: portfolioExistente.id },
        data: {
          quantity: novaQuantidade,
          avgPrice: novoPrecoMedio,
          totalInvested: novoTotalInvestido,
          lastUpdate: new Date(),
        },
      });
    } else {
      // Criar novo portfolio
      await prisma.portfolio.create({
        data: {
          userId: user.id,
          stockId: stock.id, // Usar o ID do Stock
          quantity: quantidade,
          avgPrice: cotacaoUnitaria,
          totalInvested: valorFinal,
          lastUpdate: new Date(),
        },
      });
    }

    return NextResponse.json({ 
      success: true, 
      transacao,
      message: 'Investimento adicionado com sucesso!' 
    }, { status: 201 });
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao adicionar investimento:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
