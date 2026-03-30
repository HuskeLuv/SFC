import { NextRequest, NextResponse } from 'next/server';
import {
  getConsultantOverview,
  getAverageSavingRate,
  getTopClientsByReturn,
  getTopClientsByPatrimony,
  getTopClientsBySavingRate,
  getClientWithHighestPatrimony,
  getTotalDividends,
  getClientsWithNegativeFlow,
  getClientsWithoutAportes,
  getClientsHighConcentration,
  getAportesResgatesByClient,
  getConsolidatedAssetDistribution,
  getPatrimonyEvolution,
} from '@/services/consultantService';
import { authenticateConsultant } from '@/utils/consultantAuth';

import { withErrorHandler } from '@/utils/apiErrorHandler';
const CACHE_CONTROL_HEADER = 's-maxage=300, stale-while-revalidate=60';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const consultant = await authenticateConsultant(request);

  const [
    overview,
    averageSavingRate,
    topClientsByReturn,
    topClientsByPatrimony,
    topClientsBySavingRate,
    clientWithHighestPatrimony,
    totalDividends,
    negativeFlowAlerts,
    noAportesAlerts,
    highConcentrationAlerts,
    aportesResgates,
    assetDistribution,
    patrimonyEvolution,
  ] = await Promise.all([
    getConsultantOverview(consultant.consultantId),
    getAverageSavingRate(consultant.consultantId),
    getTopClientsByReturn(consultant.consultantId, 5),
    getTopClientsByPatrimony(consultant.consultantId, 5),
    getTopClientsBySavingRate(consultant.consultantId, 5),
    getClientWithHighestPatrimony(consultant.consultantId),
    getTotalDividends(consultant.consultantId),
    getClientsWithNegativeFlow(consultant.consultantId),
    getClientsWithoutAportes(consultant.consultantId),
    getClientsHighConcentration(consultant.consultantId),
    getAportesResgatesByClient(consultant.consultantId),
    getConsolidatedAssetDistribution(consultant.consultantId),
    getPatrimonyEvolution(consultant.consultantId, 12),
  ]);

  const allRiskAlerts = [...negativeFlowAlerts, ...noAportesAlerts, ...highConcentrationAlerts];

  return NextResponse.json(
    {
      overview,
      metrics: {
        averageSavingRate,
        totalDividends,
        clientWithHighestPatrimony,
      },
      topClients: {
        byReturn: topClientsByReturn,
        byPatrimony: topClientsByPatrimony,
        bySavingRate: topClientsBySavingRate,
      },
      riskAlerts: allRiskAlerts,
      aportesResgates,
      assetDistribution,
      patrimonyEvolution,
    },
    {
      headers: { 'Cache-Control': CACHE_CONTROL_HEADER },
    },
  );
});
