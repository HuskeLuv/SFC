import { NextRequest, NextResponse } from 'next/server';
import { listarPlanejados, linhaPlanejadaBase } from '@/services/portfolio/ativosPlanejados';
import { filtrarDaCategoria, wherePortfolioDaCategoria } from '@/services/portfolio/categoriaAba';
import { aplicarCamposMovido, camposMovidoPorLinha } from '@/app/api/carteira/_lib/linhaMovida';
import { isSubgrupoValido } from '@/lib/carteiraMover';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getCotacaoDolarHoje } from '@/services/market/cambioUsdBrl';
import { carteiraEuaDolarHabilitado } from '@/lib/carteiraEuaConfig';
import {
  proventoDaLinhaEmUsd,
  totaisEua,
  valoresLinhaEua,
  type AtivoEuaRef,
} from '@/app/api/carteira/_lib/linhaEua';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { handleCaixaAbaPost } from '@/app/api/carteira/_lib/caixaParaInvestirPost';
import { round2, distributeRoundedPercents } from '@/utils/alocacaoPercents';
import { rentabilidadeAgregada } from '@/utils/rentabilidadeAgregada';
import {
  aplicarProventosNosAtivos,
  proventosRecebidosPorSymbol,
} from '@/services/portfolio/proventosPorSymbol';
// Função auxiliar para cores
function getAtivoColor(ticker: string): string {
  const colors = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#8B5CF6',
    '#EF4444',
    '#06B6D4',
    '#84CC16',
    '#F97316',
  ];
  const index = ticker.charCodeAt(0) % colors.length;
  return colors[index];
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Câmbio do dia (o mesmo do resumo): a aba é em US$ e o "equivale a R$" usa esta taxa.
  const cotacaoHoje = await getCotacaoDolarHoje().catch(() => null);
  const cotacaoDolar = cotacaoHoje?.taxa ?? null;

  // Buscar caixa para investir específico de REIT
  const caixaParaInvestirData = await prisma.dashboardData.findFirst({
    where: {
      userId: targetUserId,
      metric: 'caixa_para_investir_reit',
    },
  });
  const caixaParaInvestir = caixaParaInvestirData?.value || 0;

  // Buscar portfolio do usuário com ativos do tipo correspondente
  // Mover na Carteira (out/2026): + itens movidos para REIT's (ex.: stock),
  // − os REITs movidos daqui para outra aba.
  const portfolio = filtrarDaCategoria(
    await prisma.portfolio.findMany({
      where: wherePortfolioDaCategoria(user.id, 'reits'),
      include: {
        asset: true,
      },
    }),
    'reits',
  );

  const assetIds = portfolio.map((p) => p.assetId).filter((id): id is string => id !== null);
  const transactions =
    assetIds.length > 0
      ? await prisma.stockTransaction.findMany({
          where: { userId: targetUserId, assetId: { in: assetIds }, type: 'compra' },
          orderBy: { date: 'desc' },
        })
      : [];

  const latestNotesByAsset = new Map<string, { estrategia?: string }>();
  transactions.forEach((t) => {
    if (!t.assetId || latestNotesByAsset.has(t.assetId)) return;
    try {
      const notes = t.notes ? JSON.parse(t.notes) : {};
      if (notes.estrategiaReit) {
        latestNotesByAsset.set(t.assetId, { estrategia: notes.estrategiaReit });
      }
    } catch {
      // ignore
    }
  });

  // Cotações via banco (BRAPI sync) com fallback para fetch direto quando faltar
  // Ativos PLANEJADOS (sem posição) da aba — linha zerada com objetivo (16/09/2026).
  const planejados = await listarPlanejados(
    targetUserId,
    { categoria: 'reits' },
    portfolio.map((p) => p.assetId),
  );
  const reitSymbols = [
    ...portfolio.filter((item) => item.asset).map((item) => item.asset!.symbol),
    ...planejados.map((r) => r.asset.symbol),
  ];
  const quotes = await getAssetPrices(reitSymbols, { useBrapiFallback: true });

  // Valores em US$ na unidade da posição (valoresLinhaEua): REIT sempre foi gravado em US$;
  // stock em R$ (legado) movida para cá é exibida ÷ câmbio, marcada 'aproximado'.
  const ativoPorLinha = new Map<string, AtivoEuaRef>();
  const reitAtivos = portfolio
    .filter((item) => item.asset)
    .map((item) => {
      ativoPorLinha.set(item.id, item.asset!);
      const assetId = item.assetId || '';
      const notes = latestNotesByAsset.get(assetId);
      // Precedência: Portfolio.estrategia (gravada pelo mover) > notes da
      // compra (estrategiaReit) > 'value'.
      const estrategia = (
        isSubgrupoValido('reits', item.estrategia)
          ? item.estrategia
          : isSubgrupoValido('reits', notes?.estrategia)
            ? notes!.estrategia
            : 'value'
      ) as 'value' | 'growth' | 'risk';
      const valores = valoresLinhaEua({
        item,
        asset: item.asset,
        quote: quotes.get(item.asset!.symbol),
        cotacaoDolar,
      });
      const { precoAquisicao, valorTotal, cotacaoAtual, valorAtualizado } = valores;

      return {
        id: item.id,
        ticker: item.asset!.symbol,
        nome: item.asset!.name,
        setor: 'outros',
        subsetor: '',
        quantidade: item.quantity,
        precoAquisicao,
        valorTotal,
        cotacaoAtual,
        valorAtualizado,
        moedaRegistro: valores.moedaRegistro,
        aproximado: valores.aproximado,
        semCambio: valores.semCambio,
        valorTotalBRL: valores.valorTotalBRL,
        valorAtualizadoBRL: valores.valorAtualizadoBRL,
        riscoPorAtivo: 0,
        percentualCarteira: 0,
        objetivo: item.objetivo ?? 0,
        quantoFalta: 0,
        necessidadeAporte: 0,
        proventos: 0, // preenchido por aplicarProventosNosAtivos
        rentabilidade:
          precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0,
        estrategia,
        observacoes: undefined,
        dataUltimaAtualizacao: item.lastUpdate,
      };
    });

  // Linhas planejadas: seção = estratégia escolhida ao planejar (a de uma
  // posição vem das notes da compra; planejado não tem transação).
  const reitAtivosComPlanejados = [
    ...reitAtivos,
    ...planejados.map((r) => ({
      ...linhaPlanejadaBase(r, quotes.get(r.asset.symbol) ?? 0),
      // O symbol do REIT manual carrega timestamp; o rótulo é o nome digitado.
      ticker: r.asset.name,
      setor: 'outros',
      subsetor: '',
      estrategia: (['value', 'growth', 'risk'].includes(r.secao ?? '') ? r.secao : 'value') as
        | 'value'
        | 'growth'
        | 'risk',
    })),
  ];

  aplicarCamposMovido(
    reitAtivosComPlanejados,
    await camposMovidoPorLinha(targetUserId, 'reits', [...portfolio, ...planejados]),
  );

  // Calcular totais gerais
  const totalQuantidade = reitAtivosComPlanejados.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  // Auditoria 25/08/2026 (B1): proventos recebidos entram na rentabilidade da linha.
  const proventosPorSymbol = await proventosRecebidosPorSymbol(targetUserId);
  aplicarProventosNosAtivos(reitAtivosComPlanejados, proventosPorSymbol);
  // Provento de ativo em dólar já está em US$ (moeda nativa); ativo BRL movido para cá, ÷ câmbio.
  reitAtivosComPlanejados.forEach((ativo) => {
    const asset = ativoPorLinha.get(ativo.id);
    if (!asset || !ativo.proventos) return;
    const semCambio = (ativo as { semCambio?: boolean }).semCambio === true;
    ativo.proventos = semCambio ? 0 : proventoDaLinhaEmUsd(ativo.proventos, asset, cotacaoDolar);
    if (ativo.valorTotal > 0) {
      ativo.rentabilidade =
        ((ativo.valorAtualizado + ativo.proventos - ativo.valorTotal) / ativo.valorTotal) * 100;
    }
  });
  const totalProventos = reitAtivosComPlanejados.reduce(
    (sum, ativo) => sum + (ativo.proventos ?? 0),
    0,
  );
  const totalValorAplicado = reitAtivosComPlanejados.reduce(
    (sum, ativo) => sum + ativo.valorTotal,
    0,
  );
  const totalValorAtualizado = reitAtivosComPlanejados.reduce(
    (sum, ativo) => sum + ativo.valorAtualizado,
    0,
  );

  // Bug #14 residual: percentualCarteira no backend (paridade com FII).
  if (totalValorAtualizado > 0) {
    reitAtivosComPlanejados.forEach((ativo) => {
      const pct = (ativo.valorAtualizado / totalValorAtualizado) * 100;
      ativo.percentualCarteira = round2(pct);
      ativo.riscoPorAtivo = ativo.percentualCarteira;
    });
    const adjusted = distributeRoundedPercents(
      reitAtivosComPlanejados.map((a) => ({ percentual: a.percentualCarteira })),
    );
    adjusted.forEach((adj, i) => {
      reitAtivosComPlanejados[i].percentualCarteira = adj.percentual;
      reitAtivosComPlanejados[i].riscoPorAtivo = adj.percentual;
    });
    reitAtivosComPlanejados.forEach((ativo) => {
      ativo.quantoFalta = round2(ativo.objetivo - ativo.percentualCarteira);
      ativo.necessidadeAporte =
        ativo.quantoFalta > 0 ? round2((ativo.quantoFalta / 100) * totalValorAtualizado) : 0;
    });
  }

  const totalObjetivo = reitAtivosComPlanejados.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = reitAtivosComPlanejados.reduce(
    (sum, ativo) => sum + ativo.quantoFalta,
    0,
  );
  const totalNecessidadeAporte = reitAtivosComPlanejados.reduce(
    (sum, ativo) => sum + ativo.necessidadeAporte,
    0,
  );
  const totalRisco = reitAtivosComPlanejados.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = rentabilidadeAgregada(
    reitAtivosComPlanejados,
    (a) => a.valorTotal,
    (a) => a.valorAtualizado + (a.proventos ?? 0),
  );

  // Agrupar por estratégia
  const REIT_SECTION_ORDER = ['value', 'growth', 'risk'] as const;
  const REIT_SECTION_NAMES: Record<string, string> = {
    value: 'Value',
    growth: 'Growth',
    risk: 'Risk',
  };
  const secoesMap = new Map<string, typeof reitAtivosComPlanejados>();
  reitAtivosComPlanejados.forEach((ativo) => {
    const e = ativo.estrategia;
    const list = secoesMap.get(e) || [];
    list.push(ativo);
    secoesMap.set(e, list);
  });

  const secoes = REIT_SECTION_ORDER.map((estrategia) => {
    const ativos = secoesMap.get(estrategia) || [];
    return {
      estrategia,
      nome: REIT_SECTION_NAMES[estrategia],
      ativos,
      totalQuantidade: 0,
      totalValorAplicado: 0,
      totalValorAtualizado: 0,
      totalPercentualCarteira: 0,
      totalRisco: 0,
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: 0,
      totalProventos: 0,
    };
  });

  // Calcular valores das seções
  secoes.forEach((secao) => {
    secao.totalQuantidade = secao.ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    secao.totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
    secao.totalProventos = secao.ativos.reduce((sum, ativo) => sum + (ativo.proventos ?? 0), 0);
    secao.totalValorAtualizado = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.valorAtualizado,
      0,
    );
    secao.totalPercentualCarteira = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.percentualCarteira,
      0,
    );
    secao.totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    secao.totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    secao.totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    secao.totalNecessidadeAporte = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.necessidadeAporte,
      0,
    );
    secao.rentabilidadeMedia = rentabilidadeAgregada(
      secao.ativos,
      (a) => a.valorTotal,
      (a) => a.valorAtualizado + (a.proventos ?? 0),
    );
  });

  // Calcular resumo (US$). O caixa (R$) NÃO entra no total: fica em caixaParaInvestirBRL,
  // numa linha própria (antes era somado ao total em US$).
  const caixaEmUsd = cotacaoDolar ? caixaParaInvestir / cotacaoDolar : 0;
  const totais = totaisEua(reitAtivosComPlanejados, cotacaoDolar);
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: caixaParaInvestir,
    saldoInicioMes: totalValorAplicado,
    valorAtualizado: totalValorAtualizado,
    rendimento: totalValorAtualizado + totalProventos - totalValorAplicado,
    rentabilidade:
      totalValorAplicado > 0
        ? ((totalValorAtualizado + totalProventos - totalValorAplicado) / totalValorAplicado) * 100
        : 0,
  };

  // Calcular alocação por ativo
  const totalValor = reitAtivosComPlanejados.reduce((sum, a) => sum + a.valorAtualizado, 0);
  const alocacaoAtivo = reitAtivosComPlanejados
    .filter((a) => !(a as { planejado?: boolean }).planejado)
    .map((ativo) => ({
      ticker: ativo.ticker,
      valor: ativo.valorAtualizado,
      percentual: totalValor > 0 ? (ativo.valorAtualizado / totalValor) * 100 : 0,
      cor: getAtivoColor(ativo.ticker),
    }));

  // Tabela auxiliar (cotacaoAtual, necessidadeAporte, loteAproximado): a base do aporte
  // inclui o caixa da aba convertido para US$.
  const totalTabValue = totalValorAtualizado + caixaEmUsd;
  const tabelaAuxiliar = reitAtivosComPlanejados
    .filter((a) => !(a as { planejado?: boolean }).planejado)
    .map((ativo) => {
      const percentualCarteira =
        totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
      const quantoFalta = (ativo.objetivo ?? 0) - percentualCarteira;
      const necessidadeAporte =
        totalTabValue > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalTabValue : 0;
      const loteAproximado =
        ativo.cotacaoAtual > 0 ? Math.ceil(necessidadeAporte / ativo.cotacaoAtual) : 0;
      return {
        ticker: ativo.ticker,
        nome: ativo.nome,
        cotacaoAtual: ativo.cotacaoAtual,
        necessidadeAporte,
        loteAproximado,
      };
    });

  const data = {
    cotacaoDolar,
    taxaData: cotacaoHoje?.data.toISOString().slice(0, 10) ?? null,
    // Chave CARTEIRA_EUA_DOLAR_HABILITADO: só o layout novo da tabela (os valores não mudam).
    layoutUsd: carteiraEuaDolarHabilitado(),
    caixaParaInvestirBRL: caixaParaInvestir,
    totalUSD: totais.totalUSD,
    totalBRL: totais.totalBRL,
    posicoesSemCambio: totais.posicoesSemCambio,
    resumo,
    secoes,
    totalGeral: {
      quantidade: totalQuantidade,
      valorAplicado: totalValorAplicado,
      valorAtualizado: totalValorAtualizado, // Sem o caixa (R$): ver caixaParaInvestirBRL
      percentualCarteira: 100.0,
      risco: totalRisco,
      objetivo: totalObjetivo,
      quantoFalta: totalQuantoFalta,
      necessidadeAporte: totalNecessidadeAporte,
      rentabilidade: rentabilidadeMedia,
      proventos: totalProventos,
    },
    alocacaoAtivo,
    tabelaAuxiliar,
  };

  return NextResponse.json(data);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const body = await request.json();
  const { ativoId, objetivo: _objetivo, cotacao: _cotacao, caixaParaInvestir } = body;

  if (caixaParaInvestir !== undefined) {
    return handleCaixaAbaPost(request, auth, 'reit', body);
  }

  if (!ativoId) {
    return NextResponse.json({ error: 'Parâmetro obrigatório: ativoId' }, { status: 400 });
  }

  // Simular delay de rede
  await new Promise((resolve) => setTimeout(resolve, 500));

  return NextResponse.json({
    success: true,
    message: 'Dados atualizados com sucesso',
  });
});
