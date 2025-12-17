import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logDataUpdate } from '@/services/impersonationLogger';

export async function POST(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);
    
    const requestBody = await request.json();

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { 
      tipoAtivo,
      instituicaoId,
      assetId,
      dataCompra,
      dataInicio,
      quantidade,
      cotacaoUnitaria,
      cotacaoCompra,
      valorAplicado,
      valorInvestido,
      taxaCorretagem = 0,
      valorTotal,
      observacoes,
      moeda,
      nomePersonalizado,
      precoUnitario,
      emissorId,
      periodo,
      taxaJurosAnual,
      cotizacaoResgate,
      liquidacaoResgate,
      vencimento,
      benchmark,
      // percentualCDI,
      // indexador
    } = requestBody;

    // Validações básicas
    if (!tipoAtivo || !instituicaoId || !assetId) {
      return NextResponse.json({ 
        error: 'Campos obrigatórios: tipoAtivo, instituicaoId, assetId' 
      }, { status: 400 });
    }

    // Validações específicas por tipo de ativo
    if (tipoAtivo === "conta-corrente" || tipoAtivo === "poupanca") {
      if (!dataInicio || !valorAplicado) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataInicio, valorAplicado' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "criptoativo") {
      if (!dataCompra || !quantidade || !cotacaoCompra) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataCompra, quantidade, cotacaoCompra' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "moeda") {
      if (!dataCompra || !moeda || !cotacaoCompra || !valorInvestido) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataCompra, moeda, cotacaoCompra, valorInvestido' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "personalizado") {
      if (!dataInicio || !nomePersonalizado || !quantidade || !precoUnitario) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataInicio, nomePersonalizado, quantidade, precoUnitario' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "renda-fixa-prefixada" || tipoAtivo === "renda-fixa-posfixada") {
      if (!dataInicio || !emissorId || !periodo || !valorAplicado || !taxaJurosAnual) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataInicio, emissorId, periodo, valorAplicado, taxaJurosAnual' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "tesouro-direto" || tipoAtivo === "debenture" || tipoAtivo === "fundo" || tipoAtivo === "previdencia") {
      if (!dataCompra || !valorInvestido) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataCompra, valorInvestido' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "fii") {
      if (!dataCompra || !quantidade || !cotacaoUnitaria) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataCompra, quantidade, cotacaoUnitaria' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "emergency" || tipoAtivo === "opportunity") {
      // Para reserva de emergência e oportunidade, apenas valor e data são necessários
      if (!dataCompra || !valorInvestido) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataCompra, valorInvestido' 
        }, { status: 400 });
      }
    } else {
      // Para ações, BDRs, ETFs, REITs, etc.
      if (!dataCompra || !quantidade || !cotacaoUnitaria) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataCompra, quantidade, cotacaoUnitaria' 
        }, { status: 400 });
      }
    }

    // Validações de valores positivos específicas por tipo
    if ((tipoAtivo === "acao" || tipoAtivo === "bdr" || tipoAtivo === "fii") && (quantidade <= 0 || cotacaoUnitaria <= 0)) {
      return NextResponse.json({ 
        error: 'Quantidade e cotação unitária devem ser maiores que zero' 
      }, { status: 400 });
    }
    
    if (tipoAtivo === "criptoativo" && (quantidade <= 0 || cotacaoCompra <= 0)) {
      return NextResponse.json({ 
        error: 'Quantidade e cotação de compra devem ser maiores que zero' 
      }, { status: 400 });
    }
    
    if (tipoAtivo === "personalizado" && (quantidade <= 0 || precoUnitario <= 0)) {
      return NextResponse.json({ 
        error: 'Quantidade e preço unitário devem ser maiores que zero' 
      }, { status: 400 });
    }
    
    if ((tipoAtivo === "conta-corrente" || tipoAtivo === "poupanca" || tipoAtivo === "renda-fixa-prefixada" || tipoAtivo === "renda-fixa-posfixada") && valorAplicado <= 0) {
      return NextResponse.json({ 
        error: 'Valor aplicado deve ser maior que zero' 
      }, { status: 400 });
    }
    
    if ((tipoAtivo === "moeda" || tipoAtivo === "tesouro-direto" || tipoAtivo === "debenture" || tipoAtivo === "fundo" || tipoAtivo === "previdencia" || tipoAtivo === "emergency" || tipoAtivo === "opportunity") && valorInvestido <= 0) {
      return NextResponse.json({ 
        error: 'Valor investido deve ser maior que zero' 
      }, { status: 400 });
    }

    // Verificar se a instituição existe ou criar uma genérica para reservas
    let instituicao = null;
    
    if (tipoAtivo === "emergency" || tipoAtivo === "opportunity") {
      // Para reservas, buscar ou criar instituição genérica
      instituicao = await prisma.institution.findFirst({
        where: { nome: { contains: "Reserva", mode: 'insensitive' } },
      });

      if (!instituicao) {
        // Criar instituição genérica para reservas
        instituicao = await prisma.institution.create({
          data: {
            codigo: `RESERVA-${Date.now()}`,
            nome: "Reserva",
            status: 'ATIVA',
          },
        });
      }
    } else {
      // Para outros tipos, buscar pelo ID fornecido
      instituicao = await prisma.institution.findUnique({
        where: { id: instituicaoId },
      });

      if (!instituicao) {
        return NextResponse.json({ error: 'Instituição não encontrada' }, { status: 404 });
      }
    }

    // Verificar se o ativo existe ou criar para reservas
    let asset = null;
    
    // Se é reserva de emergência ou oportunidade, buscar ou criar o asset
    if (tipoAtivo === "emergency" || tipoAtivo === "opportunity") {
      const assetSymbol = tipoAtivo === "emergency" ? "RESERVA-EMERG" : "RESERVA-OPORT";
      const assetName = tipoAtivo === "emergency" ? "Reserva de Emergência" : "Reserva de Oportunidade";
      
      // Verificar se já existe um asset com esse símbolo
      asset = await prisma.asset.findUnique({
        where: { symbol: assetSymbol },
      });

      if (!asset) {
        // Criar novo asset para reserva
        asset = await prisma.asset.create({
          data: {
            symbol: assetSymbol,
            name: assetName,
            type: tipoAtivo,
            currency: 'BRL',
            source: 'manual',
          },
        });
      }
    } else {
      // Para outros tipos, buscar pelo ID fornecido
      asset = await prisma.asset.findUnique({
        where: { id: assetId },
      });

      if (!asset) {
        return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
      }
    }

    // Calcular valor total baseado no tipo de ativo
    let valorCalculado = 0;
    let quantidadeFinal = 0;
    let precoFinal = 0;
    const dataFinal = dataCompra || dataInicio;

    if (tipoAtivo === "acao" || tipoAtivo === "bdr" || tipoAtivo === "fii") {
      valorCalculado = (quantidade * cotacaoUnitaria) + (taxaCorretagem || 0);
      quantidadeFinal = quantidade;
      precoFinal = cotacaoUnitaria;
    } else if (tipoAtivo === "criptoativo") {
      valorCalculado = quantidade * cotacaoCompra;
      quantidadeFinal = quantidade;
      precoFinal = cotacaoCompra;
    } else if (tipoAtivo === "personalizado") {
      valorCalculado = quantidade * precoUnitario;
      quantidadeFinal = quantidade;
      precoFinal = precoUnitario;
    } else if (tipoAtivo === "conta-corrente" || tipoAtivo === "poupanca" || tipoAtivo === "renda-fixa-prefixada" || tipoAtivo === "renda-fixa-posfixada") {
      valorCalculado = valorAplicado;
      quantidadeFinal = 1; // Para contas e renda fixa, consideramos como 1 unidade
      precoFinal = valorAplicado;
    } else if (tipoAtivo === "moeda" || tipoAtivo === "tesouro-direto" || tipoAtivo === "debenture" || tipoAtivo === "fundo" || tipoAtivo === "previdencia") {
      valorCalculado = valorInvestido;
      quantidadeFinal = 1; // Para investimentos fixos, consideramos como 1 unidade
      precoFinal = valorInvestido;
    } else if (tipoAtivo === "emergency" || tipoAtivo === "opportunity") {
      // Para reserva de emergência e oportunidade
      valorCalculado = valorInvestido;
      quantidadeFinal = 1; // Consideramos como 1 unidade
      precoFinal = valorInvestido;
    }

    const valorFinal = valorTotal || valorCalculado;
    const dataTransacao = new Date(dataFinal);

    // Preparar notes com campos específicos para reserva de emergência
    let notesData = observacoes || null;
    if (tipoAtivo === "emergency") {
      const reservaMetadata: any = {
        cotizacaoResgate: cotizacaoResgate || 'D+0',
        liquidacaoResgate: liquidacaoResgate || 'Imediata',
        benchmark: benchmark || 'CDI',
      };
      
      // Adicionar vencimento apenas se fornecido
      if (vencimento) {
        reservaMetadata.vencimento = vencimento;
      }
      
      // Adicionar observações se houver
      if (observacoes) {
        reservaMetadata.observacoes = observacoes;
      }
      
      notesData = JSON.stringify(reservaMetadata);
    }

    // Criar transação de compra usando Asset diretamente
    const transacao = await prisma.stockTransaction.create({
      data: {
        userId: targetUserId,
        assetId: asset.id, // Usar o ID do Asset diretamente
        type: 'compra',
        quantity: quantidadeFinal,
        price: precoFinal,
        total: valorFinal,
        date: dataTransacao,
        fees: taxaCorretagem || 0,
        notes: notesData,
      },
    });

    // Atualizar ou criar portfolio usando Asset
    const portfolioExistente = await prisma.portfolio.findFirst({
      where: {
        userId: targetUserId,
        assetId: asset.id, // Usar o ID do Asset
      },
    });

    if (portfolioExistente) {
      // Atualizar portfolio existente
      const novaQuantidade = portfolioExistente.quantity + quantidadeFinal;
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
          userId: targetUserId,
          assetId: asset.id, // Usar o ID do Asset
          quantity: quantidadeFinal,
          avgPrice: precoFinal,
          totalInvested: valorFinal,
          lastUpdate: new Date(),
        },
      });
    }

    const result = NextResponse.json({ 
      success: true, 
      transacao,
      message: 'Investimento adicionado com sucesso!' 
    }, { status: 201 });
    
    // Registrar log se estiver personificado
    if (actingClient) {
      await logDataUpdate(
        request,
        { id: payload.id, role: payload.role },
        targetUserId,
        actingClient,
        '/api/carteira/operacao',
        'POST',
        requestBody,
        { success: true },
      );
    }
    
    return result;
    
  } catch (error) {
    // Registrar log de erro se estiver personificado
    try {
      const { requireAuthWithActing } = await import('@/utils/auth');
      const { logDataUpdate } = await import('@/services/impersonationLogger');
      const authResult = await requireAuthWithActing(request);
      if (authResult.actingClient) {
        await logDataUpdate(
          request,
          { id: authResult.payload.id, role: authResult.payload.role },
          authResult.targetUserId,
          authResult.actingClient,
          '/api/carteira/operacao',
          'POST',
          {},
          { success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' },
        );
      }
    } catch {
      // Ignorar erros de log
    }
    
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
