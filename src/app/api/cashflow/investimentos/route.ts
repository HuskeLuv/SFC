import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

/**
 * API para calcular investimentos por mês a partir das transações reais
 * Usado pelo fluxo de caixa para exibir gastos com investimentos
 */
export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar todas as transações de compra do usuário
    const transacoes = await prisma.stockTransaction.findMany({
      where: {
        userId: targetUserId,
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

    // Obter ano atual ou do query param
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const targetYear = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    
    // Log para debug
    console.log(`[Cashflow Investimentos] Buscando investimentos para ano: ${targetYear}`);
    console.log(`[Cashflow Investimentos] Total de transações encontradas: ${transacoes.length}`);

    // Processar cada transação
    for (const transacao of transacoes) {
      if (!transacao.asset) continue;

      const transactionYear = transacao.date.getFullYear();
      const mes = transacao.date.getMonth(); // 0 = Janeiro, 11 = Dezembro
      const valor = transacao.total + (transacao.fees || 0); // Total + taxas
      const tipoAtivo = transacao.asset.type || 'outros';

      // Filtrar apenas transações do ano solicitado
      if (transactionYear !== targetYear) {
        console.log(`[Cashflow Investimentos] Transação filtrada: ano ${transactionYear} !== ${targetYear}`);
        continue;
      }
      
      console.log(`[Cashflow Investimentos] Processando transação: ${tipoAtivo}, mês ${mes}, valor R$ ${valor}`);

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
      
      // Criar array de valores no formato esperado pelo CashflowValue (novo modelo)
      const values = Array.from({ length: 12 }, (_, month) => {
        const valorMes = valoresPorMes[month] || 0;
        
        return {
          id: `investimento-${tipoAtivo}-mes-${month}-${targetYear}`,
          itemId: `investimento-${tipoAtivo}`,
          userId: targetUserId,
          year: targetYear,
          month, // 0-11
          value: Math.round(valorMes * 100) / 100,
        };
      });

      // Manter formato antigo para compatibilidade
      const valores = values.map(v => ({
        id: v.id,
        mes: v.month,
        valor: v.value,
      }));

      // Calcular total anual
      const totalAnual = values.reduce((sum, v) => sum + v.value, 0);

      return {
        id: `investimento-${tipoAtivo}`,
        name: tipoAtivoLabels[tipoAtivo], // novo formato
        descricao: tipoAtivoLabels[tipoAtivo], // compatibilidade
        significado: null, // Investimentos não têm significado
        rank: null, // Investimentos não têm rank
        order: ordemCategorias[tipoAtivo] || 999, // compatibilidade (usado apenas para ordenação)
        values, // novo formato
        valores, // compatibilidade
        totalAnual: Math.round(totalAnual * 100) / 100,
      };
    });

    // Ordenar por ordem definida (usar rank ou order para compatibilidade)
    investimentosCalculados.sort((a, b) => (a.rank || a.order || 999) - (b.rank || b.order || 999));
    
    // Log para debug
    console.log(`[Cashflow Investimentos] Investimentos calculados: ${investimentosCalculados.length}`);
    console.log(`[Cashflow Investimentos] Tipos de ativos com transações: ${tiposAtivos.size}`);
    investimentosCalculados.forEach(inv => {
      const totalAnual = inv.totalAnual || 0;
      if (totalAnual > 0) {
        console.log(`[Cashflow Investimentos] - ${inv.name}: R$ ${totalAnual.toFixed(2)}`);
      }
    });

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

