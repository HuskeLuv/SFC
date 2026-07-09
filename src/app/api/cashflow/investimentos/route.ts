import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { computeInvestimentosPorMes } from '@/services/cashflow/investimentosPorMes';

import { withErrorHandler } from '@/utils/apiErrorHandler';

/**
 * API para calcular investimentos por mês a partir das transações reais.
 * Usado pelo fluxo de caixa para exibir a linha Aporte/Resgate.
 * A agregação vive em `services/cashflow/investimentosPorMes` (compartilhada
 * com a Evolução do Patrimônio); aqui fica só a formatação da resposta.
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

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const targetYear = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  if (yearParam && (isNaN(targetYear) || targetYear < 1900 || targetYear > 2100)) {
    return NextResponse.json(
      { error: 'Parâmetro year inválido. Deve ser um número entre 1900 e 2100.' },
      { status: 400 },
    );
  }

  const { porTipo, totaisPorMes, planejamentoPorMes, tipos } = await computeInvestimentosPorMes(
    targetUserId,
    targetYear,
  );

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
  // Investimentos no Fluxo de Caixa. Ficam disponíveis em `reinvestimentos`/
  // `totaisReinvestimentosPorMes`/`totalReinvestimentos`.
  const reinvestimentoValoresPorMes = porTipo['reinvestimento'] || {};

  // Criar itens para TODAS as categorias (mesmo as sem transações).
  // Exclui 'reinvestimento' — ele é retornado separadamente.
  const todasCategorias = Object.keys(tipoAtivoLabels);

  const investimentosCalculados = todasCategorias.map((tipoAtivo) => {
    const valoresPorMes = porTipo[tipoAtivo] || {};

    const values = Array.from({ length: 12 }, (_, month) => ({
      id: `investimento-${tipoAtivo}-mes-${month}-${targetYear}`,
      itemId: `investimento-${tipoAtivo}`,
      userId: targetUserId,
      year: targetYear,
      month, // 0-11
      value: Math.round((valoresPorMes[month] || 0) * 100) / 100,
    }));

    // Manter formato antigo para compatibilidade
    const valores = values.map((v) => ({ id: v.id, mes: v.month, valor: v.value }));
    const totalAnual = values.reduce((sum, v) => sum + v.value, 0);

    return {
      id: `investimento-${tipoAtivo}`,
      name: tipoAtivoLabels[tipoAtivo],
      descricao: tipoAtivoLabels[tipoAtivo], // compatibilidade
      significado: null,
      rank: null,
      order: ordemCategorias[tipoAtivo] || 999,
      values,
      valores, // compatibilidade
      totalAnual: Math.round(totalAnual * 100) / 100,
    };
  });

  investimentosCalculados.sort((a, b) => (a.order || 999) - (b.order || 999));

  const totalGeral = totaisPorMes.reduce((sum, valor) => sum + valor, 0);

  const reinvestimentosValues = Array.from({ length: 12 }, (_, month) => ({
    id: `reinvestimento-mes-${month}-${targetYear}`,
    itemId: 'reinvestimento',
    userId: targetUserId,
    year: targetYear,
    month,
    value: Math.round((reinvestimentoValoresPorMes[month] || 0) * 100) / 100,
  }));
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
    // Líquido mensal dos ativos vinculados a sonho — fora de totaisPorMes
    // (vira o realizado da linha-espelho); a Evolução do Patrimônio soma
    // totaisPorMes + totaisPlanejamentoPorMes no client.
    totaisPlanejamentoPorMes: planejamentoPorMes,
    totalGeral: Math.round(totalGeral * 100) / 100,
    quantidadeTipos: tipos.size,
    reinvestimentos,
    totaisReinvestimentosPorMes,
    totalReinvestimentos,
  });
});
