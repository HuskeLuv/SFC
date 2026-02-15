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
      dataVencimento,
      quantidade,
      cotacaoUnitaria,
      cotacaoCompra,
      cotacaoMoeda,
      valorAplicado,
      valorInvestido,
      taxaCorretagem = 0,
      valorTotal,
      observacoes,
      descricao,
      moeda,
      nomePersonalizado,
      precoUnitario,
      emissorId,
      periodo,
      taxaJurosAnual,
      rendaFixaTipo,
      rendaFixaIndexer,
      rendaFixaIndexerPercent,
      rendaFixaLiquidity,
      rendaFixaTaxExempt,
      cotizacaoResgate,
      liquidacaoResgate,
      vencimento,
      benchmark,
      estrategia,
      tipoFii,
      metodo,
      // percentualCDI,
      // indexador
    } = requestBody;

    // Validações básicas
    // Para reservas (emergency e opportunity) e personalizado, assetId não é obrigatório pois será criado automaticamente
    const isReserva = tipoAtivo === "emergency" || tipoAtivo === "opportunity";
    const isPersonalizado = tipoAtivo === "personalizado";
    if (!tipoAtivo || !instituicaoId) {
      return NextResponse.json({ 
        error: 'Campos obrigatórios: tipoAtivo, instituicaoId' 
      }, { status: 400 });
    }
    const isRendaFixa = tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada";
    if (!isReserva && !isPersonalizado && !isRendaFixa && !assetId) {
      return NextResponse.json({ 
        error: 'Campo obrigatório: assetId' 
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
      if (!dataInicio || !nomePersonalizado || !quantidade || !precoUnitario || !requestBody.metodo) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataInicio, nomePersonalizado, quantidade, precoUnitario, metodo' 
        }, { status: 400 });
      }
      // Validar método
      if (!['valor', 'percentual'].includes(requestBody.metodo)) {
        return NextResponse.json({ 
          error: 'Método deve ser: valor ou percentual' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "renda-fixa-prefixada") {
      // Fluxo com emissor/ativo específico (busca por assetId)
      if (!dataInicio || !emissorId || !periodo || !valorAplicado || !taxaJurosAnual) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataInicio, emissorId, periodo, valorAplicado, taxaJurosAnual' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") {
      // Fluxo com rendaFixaTipo (CDB, LCI, etc.) - sem emissor/periodo
      if (!rendaFixaTipo || !dataInicio || !dataVencimento || !valorAplicado || !taxaJurosAnual || !descricao) {
        return NextResponse.json({
          error: 'Campos obrigatórios para este tipo: rendaFixaTipo, dataInicio, dataVencimento, valorAplicado, taxaJurosAnual, descricao'
        }, { status: 400 });
      }
      if (tipoAtivo === "renda-fixa-posfixada" && (!rendaFixaIndexer || !['CDI', 'IPCA'].includes(rendaFixaIndexer))) {
        return NextResponse.json({
          error: 'Para Renda Fixa Pós-Fixada, o indexador deve ser CDI ou IPCA'
        }, { status: 400 });
      }
      const inicio = new Date(dataInicio);
      const vencimentoDate = new Date(dataVencimento);
      if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(vencimentoDate.getTime())) {
        return NextResponse.json({
          error: 'Datas inválidas para este tipo: dataInicio, dataVencimento'
        }, { status: 400 });
      }
      if (inicio.getTime() >= vencimentoDate.getTime()) {
        return NextResponse.json({
          error: 'A data de início deve ser anterior à data de vencimento'
        }, { status: 400 });
      }
    } else if (tipoAtivo === "tesouro-direto" || tipoAtivo === "debenture" || tipoAtivo === "fundo" || tipoAtivo === "previdencia") {
      if (!dataCompra || !valorInvestido) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataCompra, valorInvestido' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "fii") {
      if (!dataCompra || !quantidade || !cotacaoUnitaria || !tipoFii) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para FII: dataCompra, quantidade, cotacaoUnitaria, tipoFii' 
        }, { status: 400 });
      }
      // Validar tipoFii
      if (!['fofi', 'tvm', 'tijolo'].includes(tipoFii)) {
        return NextResponse.json({ 
          error: 'Tipo de FII deve ser: fofi, tvm ou tijolo' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "stock") {
      if (!dataCompra || !quantidade || !cotacaoUnitaria || !moeda || !cotacaoMoeda) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para stocks: dataCompra, quantidade, cotacaoUnitaria, moeda, cotacaoMoeda' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "emergency" || tipoAtivo === "opportunity") {
      // Para reserva de emergência e oportunidade, apenas valor e data são necessários
      if (!dataCompra || !valorInvestido) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para este tipo: dataCompra, valorInvestido' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "acao") {
      // Para ações, estratégia é obrigatória
      if (!dataCompra || !quantidade || !cotacaoUnitaria || !estrategia) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para ações: dataCompra, quantidade, cotacaoUnitaria, estrategia' 
        }, { status: 400 });
      }
      // Validar estratégia
      if (!['value', 'growth', 'risk'].includes(estrategia)) {
        return NextResponse.json({ 
          error: 'Estratégia deve ser: value, growth ou risk' 
        }, { status: 400 });
      }
    } else {
      // Para BDRs, ETFs, REITs, etc.
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

    if (tipoAtivo === "stock" && (quantidade <= 0 || cotacaoUnitaria <= 0 || cotacaoMoeda <= 0)) {
      return NextResponse.json({ 
        error: 'Quantidade, cotação unitária e cotação da moeda devem ser maiores que zero' 
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
    
    if ((tipoAtivo === "conta-corrente" || tipoAtivo === "poupanca" || tipoAtivo === "renda-fixa-prefixada" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa") && valorAplicado <= 0) {
      return NextResponse.json({ 
        error: 'Valor aplicado deve ser maior que zero' 
      }, { status: 400 });
    }

    if ((tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") && taxaJurosAnual <= 0) {
      return NextResponse.json({
        error: 'Taxa de juros anual deve ser maior que zero'
      }, { status: 400 });
    }
    if ((tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") && taxaJurosAnual > 1000) {
      return NextResponse.json({
        error: 'Taxa de juros anual deve ser menor ou igual a 1000%'
      }, { status: 400 });
    }
    if ((tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") && rendaFixaIndexerPercent !== undefined && rendaFixaIndexerPercent !== null) {
      if (rendaFixaIndexerPercent < 0 || rendaFixaIndexerPercent > 1000) {
        return NextResponse.json({
          error: 'Percentual do indexador deve estar entre 0% e 1000%'
        }, { status: 400 });
      }
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

    // Verificar se o ativo existe ou criar para reservas e personalizados
    let asset = null;
    let stock = null;
    
    // Se é reserva de emergência, oportunidade ou personalizado, criar um asset único para cada investimento
    // Isso permite ter múltiplos investimentos de reserva/personalizado separados
    if (tipoAtivo === "emergency" || tipoAtivo === "opportunity" || tipoAtivo === "personalizado" || tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") {
      let baseName = "";
      let baseSymbol = "";
      
      if (tipoAtivo === "emergency") {
        baseName = "Reserva de Emergência";
        baseSymbol = "RESERVA-EMERG";
      } else if (tipoAtivo === "opportunity") {
        baseName = "Reserva de Oportunidade";
        baseSymbol = "RESERVA-OPORT";
      } else if (tipoAtivo === "personalizado") {
        baseName = nomePersonalizado || "Personalizado";
        baseSymbol = "PERSONALIZADO";
      } else if (tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") {
        baseName = descricao || "Renda Fixa";
        baseSymbol = "RENDA-FIXA";
      }
      
      // Criar um asset único para cada investimento usando timestamp e UUID
      // Isso garante que cada investimento tenha seu próprio portfolio
      const timestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const assetSymbol = `${baseSymbol}-${timestamp}-${uniqueId}`;
      
      // Nome mais descritivo com data e valor
      const dataFormatada = new Date(dataCompra || dataInicio || new Date()).toLocaleDateString('pt-BR');
      
      let assetName = "";
      if (tipoAtivo === "personalizado") {
        // Para personalizado, usar o nome fornecido pelo usuário
        const valorTotal = quantidade * precoUnitario;
        const valorFormatado = valorTotal ? new Intl.NumberFormat('pt-BR', { 
          style: 'currency', 
          currency: 'BRL',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(valorTotal) : '';
        assetName = `${baseName}${valorFormatado ? ` - ${valorFormatado}` : ''} - ${dataFormatada}`;
      } else if (tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") {
        const valorFormatado = valorAplicado ? new Intl.NumberFormat('pt-BR', { 
          style: 'currency', 
          currency: 'BRL',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(valorAplicado) : '';
        assetName = `${baseName}${valorFormatado ? ` - ${valorFormatado}` : ''} - ${dataFormatada}`;
      } else {
        const valorFormatado = valorInvestido ? new Intl.NumberFormat('pt-BR', { 
          style: 'currency', 
          currency: 'BRL',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(valorInvestido) : '';
        assetName = `${baseName}${valorFormatado ? ` - ${valorFormatado}` : ''} - ${dataFormatada}`;
      }
      
      // Criar novo asset único para este investimento
      asset = await prisma.asset.create({
        data: {
          symbol: assetSymbol,
          name: assetName,
          type: tipoAtivo === "personalizado" ? "personalizado" : ((tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") ? "bond" : tipoAtivo),
          currency: 'BRL',
          source: 'manual',
        },
      });
    } else if (tipoAtivo === "acao" || tipoAtivo === "fii") {
      // Para ações e FIIs, buscar na tabela Stock
      if (!assetId) {
        return NextResponse.json({ error: 'assetId é obrigatório para ações e FIIs' }, { status: 400 });
      }
      
      stock = await prisma.stock.findUnique({
        where: { id: assetId },
      });

      if (!stock) {
        console.error(`Stock não encontrado para assetId: ${assetId}, tipoAtivo: ${tipoAtivo}`);
        return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 });
      }
    } else {
      // Para outros tipos, buscar pelo ID fornecido na tabela Asset
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
    } else if (tipoAtivo === "stock") {
      valorCalculado = (quantidade * cotacaoUnitaria * cotacaoMoeda) + (taxaCorretagem || 0);
      quantidadeFinal = quantidade;
      precoFinal = cotacaoUnitaria * cotacaoMoeda;
    } else if (tipoAtivo === "criptoativo") {
      valorCalculado = quantidade * cotacaoCompra;
      quantidadeFinal = quantidade;
      precoFinal = cotacaoCompra;
    } else if (tipoAtivo === "personalizado") {
      valorCalculado = quantidade * precoUnitario;
      quantidadeFinal = quantidade;
      precoFinal = precoUnitario;
    } else if (tipoAtivo === "conta-corrente" || tipoAtivo === "poupanca" || tipoAtivo === "renda-fixa-prefixada" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa") {
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

    // Preparar notes com metadados e log da operação
    const metadata: Record<string, unknown> = {};
    if (tipoAtivo === "emergency" || tipoAtivo === "opportunity") {
      metadata.cotizacaoResgate = cotizacaoResgate || "D+0";
      metadata.liquidacaoResgate = liquidacaoResgate || "Imediata";
      metadata.benchmark = benchmark || "CDI";
      if (vencimento) {
        metadata.vencimento = vencimento;
      }
    }
    if (tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada") {
      metadata.rendaFixaTipo = rendaFixaTipo || null;
      metadata.dataInicio = dataInicio || null;
      metadata.dataVencimento = dataVencimento || null;
      metadata.taxaJurosAnual = taxaJurosAnual || null;
      metadata.descricao = descricao || null;
      metadata.indexador = (tipoAtivo === "renda-fixa" ? (rendaFixaIndexer || "PRE") : rendaFixaIndexer) || null;
      metadata.indexadorPercent = rendaFixaIndexerPercent || null;
      metadata.liquidez = rendaFixaLiquidity || null;
      metadata.taxExempt = rendaFixaTaxExempt ?? false;
    }
    if (tipoAtivo === "personalizado") {
      metadata.metodo = metodo || "valor";
    }
    if (tipoAtivo === "stock") {
      metadata.cotacaoMoeda = cotacaoMoeda || null;
    }
    if (observacoes) {
      metadata.observacoes = observacoes;
    }

    const notesData = JSON.stringify({
      ...metadata,
      operation: {
        action: "compra",
        performedBy: {
          userId: payload.id,
          role: payload.role,
          actingClient: actingClient || null,
        },
        targetUserId,
        tipoAtivo,
        instituicaoId,
        assetId: asset?.id || null,
        stockId: stock?.id || null,
        symbol: stock?.ticker || asset?.symbol || null,
        name: stock?.companyName || asset?.name || null,
        quantity: quantidadeFinal,
        price: precoFinal,
        total: valorFinal,
        fees: taxaCorretagem || 0,
        date: dataTransacao.toISOString(),
        estrategia: estrategia || null,
        tipoFii: tipoFii || null,
        moeda: moeda || null,
        cotacaoMoeda: cotacaoMoeda || null,
      },
    });

    // Verificar se asset ou stock foi criado/encontrado
    if (!isReserva && !isPersonalizado && (tipoAtivo === "acao" || tipoAtivo === "fii") && !stock) {
      return NextResponse.json({ error: 'Stock não encontrado' }, { status: 404 });
    }
    if (!isReserva && !isPersonalizado && !isRendaFixa && tipoAtivo !== "acao" && tipoAtivo !== "fii" && !asset) {
      return NextResponse.json({ error: 'Asset não encontrado' }, { status: 404 });
    }
    if ((isReserva || isPersonalizado || isRendaFixa) && !asset) {
      const tipoErro = isPersonalizado ? 'personalizado' : (isRendaFixa ? 'renda fixa' : 'reserva');
      return NextResponse.json({ error: `Erro ao criar asset para ${tipoErro}` }, { status: 500 });
    }

    // Criar transação de compra
    const transacao = await prisma.stockTransaction.create({
      data: {
        userId: targetUserId,
        ...(tipoAtivo === "acao" || tipoAtivo === "fii" ? { stockId: stock!.id } : { assetId: asset!.id }),
        type: 'compra',
        quantity: quantidadeFinal,
        price: precoFinal,
        total: valorFinal,
        date: dataTransacao,
        fees: taxaCorretagem || 0,
        notes: notesData,
      },
    });

    // Atualizar ou criar portfolio
    // Para reservas (emergency e opportunity) e personalizado, sempre criar um novo portfolio
    // Para outros tipos, atualizar se existir ou criar novo
    if (isReserva || isPersonalizado || isRendaFixa) {
      // Para reservas, sempre criar um novo portfolio (não somar com existente)
      await prisma.portfolio.create({
        data: {
          userId: targetUserId,
          assetId: asset!.id,
          quantity: quantidadeFinal,
          avgPrice: precoFinal,
          totalInvested: valorFinal,
          lastUpdate: new Date(),
        },
      });
    } else {
      // Para outros tipos, verificar se existe e atualizar ou criar
        const portfolioExistente = await prisma.portfolio.findFirst({
          where: {
            userId: targetUserId,
            ...(tipoAtivo === "acao" || tipoAtivo === "fii" ? { stockId: stock!.id } : { assetId: asset!.id }),
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
            ...(tipoAtivo === "acao" && estrategia ? { estrategia } : {}),
            ...(tipoAtivo === "fii" && tipoFii ? { tipoFii } : {}),
            lastUpdate: new Date(),
          },
        });
      } else {
        // Criar novo portfolio
        await prisma.portfolio.create({
          data: {
            userId: targetUserId,
            ...(tipoAtivo === "acao" || tipoAtivo === "fii" ? { stockId: stock!.id } : { assetId: asset!.id }),
            quantity: quantidadeFinal,
            avgPrice: precoFinal,
            totalInvested: valorFinal,
            ...(tipoAtivo === "acao" && estrategia ? { estrategia } : {}),
            ...(tipoAtivo === "fii" && tipoFii ? { tipoFii } : {}),
            lastUpdate: new Date(),
          },
        });
      }
    }

    if (isRendaFixa && asset?.id) {
      try {
        await prisma.fixedIncomeAsset.create({
          data: {
            userId: targetUserId,
            assetId: asset.id,
            type: rendaFixaTipo,
            description: descricao,
            startDate: new Date(dataInicio),
            maturityDate: new Date(dataVencimento),
            investedAmount: valorAplicado,
            annualRate: taxaJurosAnual,
            indexer: rendaFixaIndexer || null,
            indexerPercent: rendaFixaIndexerPercent || null,
            liquidityType: rendaFixaLiquidity || null,
            taxExempt: Boolean(rendaFixaTaxExempt),
          },
        });
      } catch (error) {
        const prismaError = error as { code?: string };
        if (prismaError?.code === 'P2021') {
          return NextResponse.json({
            error: 'Tabela de renda fixa não encontrada. Execute as migrations antes de adicionar ativos de renda fixa.'
          }, { status: 500 });
        }
        throw error;
      }
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
    
    // Retornar mensagem de erro mais detalhada em desenvolvimento
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return NextResponse.json(
      { 
        error: isDevelopment ? errorMessage : 'Erro interno do servidor',
        ...(isDevelopment && error instanceof Error && error.stack ? { details: error.stack } : {})
      },
      { status: 500 }
    );
  }
}
