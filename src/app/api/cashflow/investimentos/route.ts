import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

/**
 * API para calcular investimentos por mês a partir das transações reais
 * Usado pelo fluxo de caixa para exibir gastos com investimentos
 */
export async function GET(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar todas as transações de compra do usuário
    const transacoes = await prisma.stockTransaction.findMany({
      where: {
        userId: user.id,
        type: 'compra',
      },
      include: {
        asset: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Estrutura para armazenar investimentos por tipo de ativo e por mês
    // { tipoAtivo: { mes: valor } }
    const investimentosPorTipo: Record<string, Record<number, number>> = {};
    
    // Mapa para rastrear tipos de ativos
    const tiposAtivos = new Set<string>();

    // Processar cada transação
    for (const transacao of transacoes) {
      if (!transacao.asset) continue;

      const mes = transacao.date.getMonth(); // 0 = Janeiro, 11 = Dezembro
      const valor = transacao.total + (transacao.fees || 0); // Total + taxas
      const tipoAtivo = transacao.asset.type || 'outros';

      tiposAtivos.add(tipoAtivo);

      // Inicializar estrutura se não existir
      if (!investimentosPorTipo[tipoAtivo]) {
        investimentosPorTipo[tipoAtivo] = {};
      }

      // Acumular valor no mês
      if (!investimentosPorTipo[tipoAtivo][mes]) {
        investimentosPorTipo[tipoAtivo][mes] = 0;
      }
      
      investimentosPorTipo[tipoAtivo][mes] += valor;
    }

    // Mapear tipos de ativos para nomes amigáveis
    const tipoAtivoLabels: Record<string, string> = {
      'stock': 'Ações',
      'fii': 'FIIs',
      'etf': 'ETFs',
      'bdr': 'BDRs',
      'reit': 'REITs',
      'crypto': 'Criptomoedas',
      'bond': 'Renda Fixa & Fundos Renda Fixa',
      'fund': 'Fundos (FIM / FIA)',
      'currency': 'Moedas, Criptomoedas & Outros',
      'insurance': 'Previdência & Seguros',
      'real_estate': 'Imóveis Físicos',
      'emergency': 'Reserva Emergência',
      'opportunity': 'Reserva Oportunidade',
      'outros': 'Outros',
    };

    // Definir ordem de exibição das categorias (ordem menor = mais acima)
    const ordemCategorias: Record<string, number> = {
      'emergency': 1,
      'opportunity': 2,
      'bond': 3,
      'fund': 4,
      'fii': 5,
      'stock': 6,
      'reit': 7,
      'etf': 8,
      'crypto': 9,
      'currency': 10,
      'insurance': 11,
      'real_estate': 12,
      'outros': 13,
    };

    // Criar itens para TODAS as categorias (mesmo as sem transações)
    const todasCategorias = Object.keys(tipoAtivoLabels);
    
    const investimentosCalculados = todasCategorias.map(tipoAtivo => {
      const valoresPorMes = investimentosPorTipo[tipoAtivo] || {};
      
      // Criar array de valores no formato esperado pelo CashflowValue
      const valores = Array.from({ length: 12 }, (_, mes) => {
        const valorMes = valoresPorMes[mes] || 0;
        
        return {
          id: `investimento-${tipoAtivo}-mes-${mes}`,
          itemId: `investimento-${tipoAtivo}`,
          mes,
          valor: Math.round(valorMes * 100) / 100,
          dataPagamento: null,
          status: 'pago',
          observacoes: valorMes > 0 ? `Total investido em ${tipoAtivoLabels[tipoAtivo]}` : null,
        };
      });

      // Calcular total anual
      const totalAnual = valores.reduce((sum, v) => sum + v.valor, 0);

      return {
        id: `investimento-${tipoAtivo}`,
        descricao: tipoAtivoLabels[tipoAtivo],
        significado: 'Calculado automaticamente',
        categoria: tipoAtivo,
        isInvestment: true,
        isActive: true,
        order: ordemCategorias[tipoAtivo] || 999,
        valores,
        totalAnual: Math.round(totalAnual * 100) / 100,
      };
    });

    // Ordenar por ordem definida
    investimentosCalculados.sort((a, b) => a.order - b.order);

    // Calcular totais por mês (todos os tipos somados)
    const totaisPorMes = Array.from({ length: 12 }, (_, mes) => {
      const total = Object.values(investimentosPorTipo).reduce((sum, valoresPorMes) => {
        return sum + (valoresPorMes[mes] || 0);
      }, 0);
      return Math.round(total * 100) / 100;
    });

    // Calcular total geral do ano
    const totalGeral = totaisPorMes.reduce((sum, valor) => sum + valor, 0);

    return NextResponse.json({
      investimentos: investimentosCalculados,
      totaisPorMes,
      totalGeral: Math.round(totalGeral * 100) / 100,
      quantidadeTipos: tiposAtivos.size,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'Não autorizado') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    console.error('Erro ao calcular investimentos:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

