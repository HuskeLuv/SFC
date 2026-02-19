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
      taxaFixaAnual,
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
      tipoDebenture,
      tipoFundo,
      estrategiaReit,
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
    const isRendaFixa = tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa-hibrida";
    const isContaCorrente = tipoAtivo === "conta-corrente";
    const isDebentureManual = tipoAtivo === "debenture" && assetId === "DEBENTURE-MANUAL";
    const isFundoManual = tipoAtivo === "fundo" && assetId === "FUNDO-MANUAL";
    const isReitManual = tipoAtivo === "reit" && assetId === "REIT-MANUAL";
    if (!isReserva && !isPersonalizado && !isRendaFixa && !isContaCorrente && !isDebentureManual && !isFundoManual && !isReitManual && !assetId) {
      return NextResponse.json({ 
        error: 'Campo obrigatório: assetId' 
      }, { status: 400 });
    }

    // Validações específicas por tipo de ativo
    if (tipoAtivo === "conta-corrente") {
      const contaCorrenteDestino = requestBody.contaCorrenteDestino;
      if (!dataInicio || !valorAplicado || !contaCorrenteDestino) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para conta corrente: dataInicio, valorAplicado, contaCorrenteDestino' 
        }, { status: 400 });
      }
      if (!['reserva-emergencia', 'reserva-oportunidade'].includes(contaCorrenteDestino)) {
        return NextResponse.json({ 
          error: 'contaCorrenteDestino deve ser reserva-emergencia ou reserva-oportunidade' 
        }, { status: 400 });
      }
    } else if (tipoAtivo === "poupanca") {
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
      if (!dataCompra || !assetId || !quantidade || !cotacaoCompra) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para moeda: dataCompra, assetId, quantidade, cotacaoCompra' 
        }, { status: 400 });
      }
      if (quantidade <= 0 || cotacaoCompra <= 0) {
        return NextResponse.json({ 
          error: 'Quantidade e preço de aquisição devem ser maiores que zero' 
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
    } else if (tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa-hibrida") {
      // Fluxo com rendaFixaTipo (CDB, LCI, etc.) - sem emissor/periodo
      if (!rendaFixaTipo || !dataInicio || !dataVencimento || !valorAplicado || !descricao) {
        return NextResponse.json({
          error: 'Campos obrigatórios para este tipo: rendaFixaTipo, dataInicio, dataVencimento, valorAplicado, descricao'
        }, { status: 400 });
      }
      if (tipoAtivo === "renda-fixa" && !taxaJurosAnual) {
        return NextResponse.json({
          error: 'Taxa de juros anual é obrigatória para Renda Fixa Pré-Fixada'
        }, { status: 400 });
      }
      if (tipoAtivo === "renda-fixa-posfixada" && !taxaJurosAnual) {
        return NextResponse.json({
          error: 'Taxa sobre o indexador é obrigatória para Renda Fixa Pós-Fixada'
        }, { status: 400 });
      }
      if (tipoAtivo === "renda-fixa-hibrida") {
        if (taxaFixaAnual === undefined || taxaFixaAnual === null) {
          return NextResponse.json({
            error: 'Taxa fixa anual é obrigatória para Renda Fixa Híbrida'
          }, { status: 400 });
        }
        if (!taxaJurosAnual) {
          return NextResponse.json({
            error: 'Taxa sobre o indexador é obrigatória para Renda Fixa Híbrida'
          }, { status: 400 });
        }
        if (!rendaFixaIndexer || !['CDI', 'IPCA'].includes(rendaFixaIndexer)) {
          return NextResponse.json({
            error: 'Para Renda Fixa Híbrida, o indexador deve ser CDI ou IPCA'
          }, { status: 400 });
        }
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
      const metodoCotas = requestBody.metodo === 'cotas' || requestBody.metodo === 'percentual';
      if (!dataCompra) {
        return NextResponse.json({ error: 'Data de compra é obrigatória' }, { status: 400 });
      }
      if (tipoAtivo === "debenture" && (!tipoDebenture || !['prefixada', 'pos-fixada', 'hibrida'].includes(tipoDebenture))) {
        return NextResponse.json({
          error: 'Tipo de debênture é obrigatório. Selecione Pré-fixada, Pós-fixada ou Híbrida.'
        }, { status: 400 });
      }
      if (tipoAtivo === "fundo" && (!tipoFundo || !['fim', 'fia'].includes(tipoFundo))) {
        return NextResponse.json({
          error: 'Tipo de fundo é obrigatório. Selecione FIM ou FIA.'
        }, { status: 400 });
      }
      if (metodoCotas) {
        if (!quantidade || !cotacaoUnitaria || quantidade <= 0 || cotacaoUnitaria <= 0) {
          return NextResponse.json({ 
            error: 'Para adição por cotas: quantidade e preço da cota são obrigatórios e devem ser maiores que zero' 
          }, { status: 400 });
        }
      } else {
        if (!valorInvestido || valorInvestido <= 0) {
          return NextResponse.json({ error: 'Valor investido é obrigatório e deve ser maior que zero' }, { status: 400 });
        }
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
      if (!dataCompra || !quantidade || !cotacaoUnitaria || !moeda || !cotacaoMoeda || !estrategia) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para stocks: dataCompra, quantidade, cotacaoUnitaria, moeda, cotacaoMoeda, estrategia' 
        }, { status: 400 });
      }
      if (!['value', 'growth', 'risk'].includes(estrategia)) {
        return NextResponse.json({ 
          error: 'Estratégia deve ser: value, growth ou risk' 
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
    } else if (tipoAtivo === "reit") {
      if (!dataCompra || !quantidade || !cotacaoUnitaria || !estrategiaReit) {
        return NextResponse.json({ 
          error: 'Campos obrigatórios para REIT: dataCompra, quantidade, cotacaoUnitaria (USD), estrategiaReit' 
        }, { status: 400 });
      }
      if (!['value', 'growth', 'risk'].includes(estrategiaReit)) {
        return NextResponse.json({ 
          error: 'Tipo de investimento REIT deve ser: value, growth ou risk' 
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

    if (tipoAtivo === "reit" && (quantidade <= 0 || cotacaoUnitaria <= 0)) {
      return NextResponse.json({ 
        error: 'Quantidade e preço da cota (USD) devem ser maiores que zero' 
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
    if (tipoAtivo === "renda-fixa-hibrida" && ((taxaFixaAnual ?? 0) < 0 || (taxaJurosAnual ?? 0) <= 0)) {
      return NextResponse.json({
        error: 'Taxa fixa e taxa sobre indexador devem ser maiores que zero para Renda Fixa Híbrida'
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
    
    const debentureFundoPrevidenciaMetodoCotas = (tipoAtivo === "debenture" || tipoAtivo === "tesouro-direto" || tipoAtivo === "fundo" || tipoAtivo === "previdencia") && (requestBody.metodo === 'cotas' || requestBody.metodo === 'percentual');
    const valorInvestidoOuCalculado = tipoAtivo === "moeda"
      ? (quantidade * cotacaoCompra)
      : debentureFundoPrevidenciaMetodoCotas
        ? (quantidade * cotacaoUnitaria)
        : valorInvestido;
    if ((tipoAtivo === "moeda" || tipoAtivo === "tesouro-direto" || tipoAtivo === "debenture" || tipoAtivo === "fundo" || tipoAtivo === "previdencia" || tipoAtivo === "emergency" || tipoAtivo === "opportunity") && valorInvestidoOuCalculado <= 0) {
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

    // Verificar se o ativo existe ou criar para reservas, conta corrente e personalizados
    let asset = null;
    let stock = null;
    
    if (tipoAtivo === "conta-corrente") {
      const contaCorrenteDestino = requestBody.contaCorrenteDestino as string;
      const assetType = contaCorrenteDestino === "reserva-emergencia" ? "emergency" : "opportunity";
      const baseName = contaCorrenteDestino === "reserva-emergencia" ? "Conta Corrente (Reserva Emergência)" : "Conta Corrente (Reserva Oportunidade)";
      const baseSymbol = contaCorrenteDestino === "reserva-emergencia" ? "CONTA-CORRENTE-EMERG" : "CONTA-CORRENTE-OPORT";
      const timestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const assetSymbol = `${baseSymbol}-${timestamp}-${uniqueId}`;
      const dataFormatada = new Date(dataInicio || new Date()).toLocaleDateString('pt-BR');
      const valorFormatado = valorAplicado ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(valorAplicado) : '';
      const assetName = `${baseName}${valorFormatado ? ` - ${valorFormatado}` : ''} - ${dataFormatada}`;

      asset = await prisma.asset.create({
        data: {
          symbol: assetSymbol,
          name: assetName,
          type: assetType,
          currency: 'BRL',
          source: 'manual',
        },
      });
    } else if (tipoAtivo === "emergency" || tipoAtivo === "opportunity" || tipoAtivo === "personalizado" || tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa-hibrida") {
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
      } else if (tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa-hibrida") {
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
          type: tipoAtivo === "personalizado" ? "personalizado" : ((tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa-hibrida") ? "bond" : tipoAtivo),
          currency: 'BRL',
          source: 'manual',
        },
      });
    } else if (tipoAtivo === "fundo" && assetId === "FUNDO-MANUAL") {
      const nomeFundo = (requestBody.ativo || '').trim();
      if (!nomeFundo) {
        return NextResponse.json({ error: 'Nome do fundo é obrigatório' }, { status: 400 });
      }
      const metodoCotasFundo = requestBody.metodo === 'cotas' || requestBody.metodo === 'percentual';
      const valorParaNome = metodoCotasFundo && quantidade > 0 && cotacaoUnitaria > 0 ? quantidade * cotacaoUnitaria : valorInvestido;
      const timestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const safeSymbol = nomeFundo.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20).toUpperCase() || 'FUNDO';
      const assetSymbol = `FUNDO-${safeSymbol}-${timestamp}-${uniqueId}`;
      const dataFormatada = new Date(dataCompra || new Date()).toLocaleDateString('pt-BR');
      const valorFormatado = valorParaNome ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(valorParaNome) : '';
      const assetName = `${nomeFundo}${valorFormatado ? ` - ${valorFormatado}` : ''} - ${dataFormatada}`;

      asset = await prisma.asset.create({
        data: {
          symbol: assetSymbol,
          name: assetName,
          type: 'fund',
          currency: 'BRL',
          source: 'manual',
        },
      });
    } else if (tipoAtivo === "debenture" && assetId === "DEBENTURE-MANUAL") {
      const nomeDebenture = (requestBody.ativo || '').trim();
      if (!nomeDebenture) {
        return NextResponse.json({ error: 'Nome da debênture é obrigatório' }, { status: 400 });
      }
      const metodoCotasDeb = requestBody.metodo === 'cotas' || requestBody.metodo === 'percentual';
      const valorParaNome = metodoCotasDeb && quantidade > 0 && cotacaoUnitaria > 0 ? quantidade * cotacaoUnitaria : valorInvestido;
      const timestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const safeSymbol = nomeDebenture.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20).toUpperCase() || 'DEB';
      const assetSymbol = `DEBENTURE-${safeSymbol}-${timestamp}-${uniqueId}`;
      const dataFormatada = new Date(dataCompra || new Date()).toLocaleDateString('pt-BR');
      const valorFormatado = valorParaNome ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(valorParaNome) : '';
      const assetName = `${nomeDebenture}${valorFormatado ? ` - ${valorFormatado}` : ''} - ${dataFormatada}`;

      asset = await prisma.asset.create({
        data: {
          symbol: assetSymbol,
          name: assetName,
          type: 'bond',
          currency: 'BRL',
          source: 'manual',
        },
      });
    } else if (tipoAtivo === "reit" && assetId === "REIT-MANUAL") {
      const nomeReit = (requestBody.ativo || '').trim();
      if (!nomeReit) {
        return NextResponse.json({ error: 'Ticker ou nome do REIT é obrigatório' }, { status: 400 });
      }
      const valorTotalReit = quantidade > 0 && cotacaoUnitaria > 0 ? quantidade * cotacaoUnitaria : valorInvestido;
      const timestamp = Date.now();
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const safeSymbol = nomeReit.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase() || 'REIT';
      const assetSymbol = `${safeSymbol}-${timestamp}-${uniqueId}`;
      const dataFormatada = new Date(dataCompra || new Date()).toLocaleDateString('pt-BR');
      const valorFormatado = valorTotalReit ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(valorTotalReit) : '';
      const assetName = `${nomeReit}${valorFormatado ? ` - ${valorFormatado}` : ''} - ${dataFormatada}`;

      asset = await prisma.asset.create({
        data: {
          symbol: assetSymbol,
          name: assetName,
          type: 'reit',
          currency: 'USD',
          source: 'manual',
        },
      });
    } else if (tipoAtivo === "acao" || tipoAtivo === "fii") {
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
    } else if (tipoAtivo === "reit") {
      valorCalculado = quantidade * cotacaoUnitaria;
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
    } else if (tipoAtivo === "conta-corrente" || tipoAtivo === "poupanca" || tipoAtivo === "renda-fixa-prefixada" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-hibrida") {
      valorCalculado = valorAplicado;
      quantidadeFinal = 1; // Para contas e renda fixa, consideramos como 1 unidade
      precoFinal = valorAplicado;
    } else if (tipoAtivo === "moeda") {
      valorCalculado = quantidade * cotacaoCompra;
      quantidadeFinal = quantidade;
      precoFinal = cotacaoCompra;
    } else if (tipoAtivo === "tesouro-direto" || tipoAtivo === "debenture" || tipoAtivo === "fundo" || tipoAtivo === "previdencia") {
      const metodoCotas = requestBody.metodo === 'cotas' || requestBody.metodo === 'percentual';
      if (metodoCotas && quantidade > 0 && cotacaoUnitaria > 0) {
        valorCalculado = quantidade * cotacaoUnitaria;
        quantidadeFinal = quantidade;
        precoFinal = cotacaoUnitaria;
      } else {
        valorCalculado = valorInvestido;
        quantidadeFinal = 1;
        precoFinal = valorInvestido;
      }
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
    if (tipoAtivo === "conta-corrente") {
      metadata.contaCorrenteDestino = requestBody.contaCorrenteDestino;
      metadata.percentualCDI = requestBody.percentualCDI ?? null;
    }
    if (tipoAtivo === "renda-fixa" || tipoAtivo === "renda-fixa-posfixada" || tipoAtivo === "renda-fixa-hibrida") {
      metadata.rendaFixaTipo = rendaFixaTipo || null;
      metadata.dataInicio = dataInicio || null;
      metadata.dataVencimento = dataVencimento || null;
      metadata.taxaJurosAnual = taxaJurosAnual || null;
      metadata.taxaFixaAnual = tipoAtivo === "renda-fixa-hibrida" ? (taxaFixaAnual ?? null) : null;
      metadata.descricao = descricao || null;
      metadata.indexador = (tipoAtivo === "renda-fixa" ? (rendaFixaIndexer || "PRE") : rendaFixaIndexer) || null;
      metadata.indexadorPercent = (tipoAtivo === "renda-fixa-hibrida" ? taxaJurosAnual : rendaFixaIndexerPercent) ?? null;
      metadata.liquidez = rendaFixaLiquidity || null;
      metadata.taxExempt = rendaFixaTaxExempt ?? false;
    }
    if (tipoAtivo === "personalizado") {
      metadata.metodo = metodo || "valor";
    }
    if (tipoAtivo === "debenture" && tipoDebenture) {
      metadata.debentureTipo = tipoDebenture;
    }
    if (tipoAtivo === "fundo" && tipoFundo) {
      metadata.tipoFundo = tipoFundo;
    }
    if (tipoAtivo === "reit" && estrategiaReit) {
      metadata.estrategiaReit = estrategiaReit;
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
    if ((isReserva || isPersonalizado || isRendaFixa || isContaCorrente) && !asset) {
      const tipoErro = isPersonalizado ? 'personalizado' : (isRendaFixa ? 'renda fixa' : (isContaCorrente ? 'conta corrente' : 'reserva'));
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
            ...(tipoAtivo === "stock" && estrategia ? { estrategia } : {}),
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
            ...(tipoAtivo === "stock" && estrategia ? { estrategia } : {}),
            ...(tipoAtivo === "fii" && tipoFii ? { tipoFii } : {}),
            lastUpdate: new Date(),
          },
        });
      }
    }

    if (isRendaFixa && asset?.id) {
      try {
        const annualRateForAsset = tipoAtivo === "renda-fixa-hibrida" ? (taxaFixaAnual ?? taxaJurosAnual) : taxaJurosAnual;
        const indexerPercentForAsset = tipoAtivo === "renda-fixa-hibrida" ? taxaJurosAnual : rendaFixaIndexerPercent;

        await prisma.fixedIncomeAsset.create({
          data: {
            userId: targetUserId,
            assetId: asset.id,
            type: rendaFixaTipo,
            description: descricao,
            startDate: new Date(dataInicio),
            maturityDate: new Date(dataVencimento),
            investedAmount: valorAplicado,
            annualRate: annualRateForAsset,
            indexer: rendaFixaIndexer || null,
            indexerPercent: indexerPercentForAsset ?? null,
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
