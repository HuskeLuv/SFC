import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const mapTransactionToTipo = (transaction: {
  asset?: { type?: string | null; symbol?: string | null } | null;
}) => {
  const assetType = transaction.asset?.type || '';
  if (assetType === 'stock') return 'stock';
  if (assetType === 'fii') return 'fii';
  switch (assetType) {
    case 'emergency':
      return 'emergency';
    case 'opportunity':
      return 'opportunity';
    case 'personalizado':
      return 'personalizado';
    case 'imovel':
      return 'real_estate';
    case 'crypto':
      return 'crypto';
    case 'currency':
      return 'currency';
    case 'etf':
      return 'etf';
    case 'reit':
      return 'reit';
    case 'bdr':
      return 'bdr';
    case 'fund':
      return 'fund';
    case 'bond':
      return 'bond';
    // Tesouro Direto e debêntures são renda fixa → mesmo bucket "Renda Fixa &
    // Fundos Renda Fixa". Sem estes cases, aportes em Tesouro/debênture entravam
    // na carteira mas SUMIAM do fluxo de caixa (caíam no default 'outros').
    case 'tesouro-direto':
      return 'bond';
    case 'debenture':
      return 'bond';
    case 'insurance':
      return 'insurance';
    // O catálogo usa o type 'previdencia'; o item de cashflow é 'insurance'
    // ("Previdência e Seguros"). Sem este case, aportes de previdência sumiam.
    case 'previdencia':
      return 'insurance';
    case 'cash':
      return 'cash';
    default:
      return assetType || 'outros';
  }
};

/**
 * F1.10: detecta reinvestimento de proventos a partir do JSON `notes` da
 * StockTransaction. Operações marcadas com `notes.operation.action =
 * 'reinvestimento'` são compras feitas com dividendo/JCP/rendimento recebido
 * — o dinheiro não é capital novo. Ficam segregadas em uma categoria
 * "Reinvestimentos de Proventos" no Fluxo de Caixa, fora das somas normais
 * de aporte/resgate.
 */
const isReinvestimentoTransaction = (notes: string | null | undefined): boolean => {
  if (!notes) return false;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.operation?.action === 'reinvestimento';
  } catch {
    return false;
  }
};

/**
 * API para calcular investimentos por mês a partir das transações reais
 * Usado pelo fluxo de caixa para exibir gastos com investimentos
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  // Registrar acesso se estiver personificado
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/cashflow/investimentos',
    'GET',
  );

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Buscar todas as transações de compra e venda do usuário
  const transacoes = await prisma.stockTransaction.findMany({
    where: {
      userId: targetUserId,
      type: { in: ['compra', 'venda'] },
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

  if (yearParam && (isNaN(targetYear) || targetYear < 1900 || targetYear > 2100)) {
    return NextResponse.json(
      { error: 'Parâmetro year inválido. Deve ser um número entre 1900 e 2100.' },
      { status: 400 },
    );
  }

  // Processar cada transação
  for (const transacao of transacoes) {
    if (!transacao.asset) continue;

    const transactionYear = transacao.date.getFullYear();
    const mes = transacao.date.getMonth(); // 0 = Janeiro, 11 = Dezembro
    const valorBase = transacao.total + (transacao.fees || 0); // Total + taxas
    const sinal = transacao.type === 'venda' ? -1 : 1;
    const valor = valorBase * sinal;
    // F1.10: reinvestimentos vão para um bucket dedicado em vez do tipo do
    // ativo subjacente. Isso evita inflar a coluna "Ações"/"FIIs"/etc do
    // Fluxo de Caixa com capital que não veio do bolso do investidor.
    const tipoAtivo = isReinvestimentoTransaction(transacao.notes)
      ? 'reinvestimento'
      : mapTransactionToTipo(transacao);

    // Filtrar apenas transações do ano solicitado
    if (transactionYear !== targetYear) {
      continue;
    }

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
    stock: 'Ações',
    fii: 'FIIs',
    etf: 'ETFs',
    bdr: 'BDRs',
    reit: 'REITs',
    crypto: 'Criptomoedas',
    bond: 'Renda Fixa & Fundos Renda Fixa',
    fund: 'Fundos (FIM / FIA)',
    currency: 'Moedas, Criptomoedas & Outros',
    insurance: 'Previdência e Seguros',
    real_estate: 'Imóveis Físicos',
    emergency: 'Reserva Emergência',
    opportunity: 'Reserva Oportunidade',
    personalizado: 'Personalizado',
    cash: 'Conta Corrente',
    outros: 'Outros',
  };

  // Definir ordem de exibição das categorias (ordem menor = mais acima)
  const ordemCategorias: Record<string, number> = {
    emergency: 1,
    opportunity: 2,
    bond: 3,
    fund: 4,
    fii: 5,
    stock: 6,
    reit: 7,
    etf: 8,
    crypto: 9,
    currency: 10,
    insurance: 11,
    real_estate: 12,
    personalizado: 13,
    cash: 14,
    outros: 15,
  };

  // F1.10: reinvestimentos vivem em uma estrutura separada — não entram em
  // `investimentos[]` para preservar a semântica "Aporte/Resgate" do grupo
  // Investimentos no Fluxo de Caixa (consumido por DataTableTwo para calcular
  // `fluxoCaixaLivre`). Ficam disponíveis em `reinvestimentos`/
  // `totaisReinvestimentosPorMes`/`totalReinvestimentos` para a UI exibir
  // como categoria separada quando quiser.
  const reinvestimentoValoresPorMes = investimentosPorTipo['reinvestimento'] || {};

  // Criar itens para TODAS as categorias (mesmo as sem transações).
  // Exclui 'reinvestimento' — ele é retornado separadamente.
  const todasCategorias = Object.keys(tipoAtivoLabels);

  const investimentosCalculados = todasCategorias.map((tipoAtivo) => {
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
    const valores = values.map((v) => ({
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

  // Ordenar por ordem definida (usar order já que rank não é mais numérico)
  investimentosCalculados.sort((a, b) => (a.order || 999) - (b.order || 999));

  // Calcular totais por mês (todos os tipos somados, EXCETO reinvestimentos).
  // `totaisPorMes` é o que vai pra coluna "Aporte/Resgate" no Fluxo de Caixa
  // (DataTableTwo subtrai esse valor pra calcular fluxoCaixaLivre).
  const totaisPorMes = Array.from({ length: 12 }, (_, mes) => {
    const total = Object.entries(investimentosPorTipo).reduce((sum, [tipo, valoresPorMes]) => {
      if (tipo === 'reinvestimento') return sum;
      return sum + (valoresPorMes[mes] || 0);
    }, 0);
    return Math.round(total * 100) / 100;
  });

  // Calcular total geral do ano (também excluindo reinvestimentos)
  const totalGeral = totaisPorMes.reduce((sum, valor) => sum + valor, 0);

  // F1.10: estrutura paralela para reinvestimentos. Mesmo formato dos
  // investimentos pra que a UI consiga reusar componentes existentes.
  const reinvestimentosValues = Array.from({ length: 12 }, (_, month) => {
    const valorMes = reinvestimentoValoresPorMes[month] || 0;
    return {
      id: `reinvestimento-mes-${month}-${targetYear}`,
      itemId: 'reinvestimento',
      userId: targetUserId,
      year: targetYear,
      month,
      value: Math.round(valorMes * 100) / 100,
    };
  });
  const reinvestimentoTotalAnual = reinvestimentosValues.reduce((sum, v) => sum + v.value, 0);
  const reinvestimentos = [
    {
      id: 'reinvestimento',
      name: 'Reinvestimentos de Proventos',
      descricao: 'Reinvestimentos de Proventos',
      significado: null,
      rank: null,
      order: 1,
      values: reinvestimentosValues,
      valores: reinvestimentosValues.map((v) => ({ id: v.id, mes: v.month, valor: v.value })),
      totalAnual: Math.round(reinvestimentoTotalAnual * 100) / 100,
    },
  ];
  const totaisReinvestimentosPorMes = reinvestimentosValues.map((v) => v.value);
  const totalReinvestimentos = Math.round(reinvestimentoTotalAnual * 100) / 100;

  return NextResponse.json({
    investimentos: investimentosCalculados,
    totaisPorMes,
    totalGeral: Math.round(totalGeral * 100) / 100,
    quantidadeTipos: tiposAtivos.size,
    // F1.10: reinvestimentos segregados — não somados em totaisPorMes/totalGeral
    // pra preservar a semântica "Aporte/Resgate" do grupo Investimentos.
    reinvestimentos,
    totaisReinvestimentosPorMes,
    totalReinvestimentos,
  });
});
