import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuthWithActing } from '@/utils/auth';
import { withErrorHandler, ApiError } from '@/utils/apiErrorHandler';
import { validationError, zPercentage, zString } from '@/utils/validation-schemas';
import {
  ABA_POR_TIPO_OPERACAO,
  SECOES_POR_ABA,
  TIPOS_ATIVO_PLANEJAVEIS,
  TIPOS_OPERACAO_MANUAIS_PLANEJAVEIS,
  assertTickerNaoEhEtfB3,
  criarAssetPlanejadoManual,
  encontrarPlanejadoManual,
  type TipoOperacaoManualPlanejavel,
} from '@/services/portfolio/ativosPlanejados';
import { ETF_MANUAL_ASSET_ID } from '@/lib/ativoEmDolar';
import { carteiraEuaDolarHabilitado } from '@/lib/carteiraEuaConfig';
import { invalidarContextoUsuario } from '@/services/assistente/contexto';
import { recordPlanejadoAdicionado } from '@/services/changeHistory';

/**
 * POST /api/carteira/planejados — inclui um ativo PLANEJADO na aba (sem
 * posição). Ver `services/portfolio/ativosPlanejados.ts` para a decisão de
 * arquitetura.
 *
 * - Catálogo (ações/BDR, FII, ETF, cripto/moeda, fundo CVM, previdência CVM):
 *   `assetId` real.
 * - Manual (stock, REIT, fundo sem catálogo): `assetId` sentinela
 *   (`STOCK-MANUAL` / `REIT-MANUAL` / `FUNDO-MANUAL`) ou ausente + `nome`
 *   (ticker ou nome digitado); o Asset é criado aqui.
 * - ETF americano (nov/2026): manual SÓ com o sentinela `ETF-MANUAL` (ETF sem assetId continua
 *   400, para nenhum ETF em US$ nascer em silêncio). Asset etf/USD, seção 'estados_unidos',
 *   guarda anti-B3 e a chave CARTEIRA_EUA_DOLAR_HABILITADO como interruptor.
 */
const SENTINELAS_MANUAIS = new Set([
  'STOCK-MANUAL',
  'REIT-MANUAL',
  'FUNDO-MANUAL',
  'SEGURO-MANUAL',
]);

const planejadoCreateSchema = z.object({
  assetId: z.string().max(255).optional().nullable(),
  /** Tipo do wizard: acao | bdr | fii | etf | criptoativo | moeda | stock | reit | fundo | previdencia. */
  tipoAtivo: zString(50),
  /** Ticker/nome digitado (ativos manuais). */
  nome: z.string().max(200).optional().nullable(),
  /** Seção da aba (estratégia / tipo do FII / região do ETF / subtipo do fundo). */
  secao: z.string().max(50).optional().nullable(),
  objetivo: zPercentage.optional().default(0),
  observacoes: z.string().max(500).optional().nullable(),
});

const isTipoManual = (t: string): t is TipoOperacaoManualPlanejavel =>
  (TIPOS_OPERACAO_MANUAIS_PLANEJAVEIS as readonly string[]).includes(t);

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;
  const parsed = planejadoCreateSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { tipoAtivo, secao, objetivo, observacoes } = parsed.data;
  const assetIdInformado = parsed.data.assetId?.trim() || null;
  const nome = parsed.data.nome?.trim() || '';

  const aba = ABA_POR_TIPO_OPERACAO[tipoAtivo];
  if (!aba) {
    throw new ApiError(400, 'Este tipo de ativo ainda não pode ser planejado sem posição');
  }

  // ETF: manual só pelo sentinela (o ETF da B3 vem do catálogo; sem assetId é 400).
  const manual =
    tipoAtivo === 'etf'
      ? assetIdInformado === ETF_MANUAL_ASSET_ID
      : !assetIdInformado || SENTINELAS_MANUAIS.has(assetIdInformado);
  if (!manual && !assetIdInformado) {
    throw new ApiError(400, 'Escolha um ativo do catálogo para planejar');
  }
  if (manual && !isTipoManual(tipoAtivo)) {
    throw new ApiError(
      400,
      tipoAtivo === 'previdencia'
        ? 'Para planejar, escolha um fundo de previdência do catálogo (seguros não têm objetivo por aba)'
        : 'Escolha um ativo do catálogo para planejar',
    );
  }
  if (manual && !nome) {
    throw new ApiError(400, 'Informe o ticker ou o nome do ativo');
  }
  const isEtfManual = manual && tipoAtivo === 'etf';
  if (isEtfManual) {
    if (!carteiraEuaDolarHabilitado()) throw new ApiError(400, 'ETF americano indisponível');
    await assertTickerNaoEhEtfB3(prisma, nome);
  }

  const secoesValidas = SECOES_POR_ABA[aba];
  // ETF americano fica sempre na seção EUA (a região não decide moeda; aqui só a seção).
  const secaoFinal = isEtfManual
    ? 'estados_unidos'
    : secoesValidas.length > 0
      ? secao || secoesValidas[0]
      : null;
  if (secaoFinal && !secoesValidas.includes(secaoFinal)) {
    throw new ApiError(400, 'Seção inválida para esta aba');
  }

  let assetId: string;
  let assetDoPlanejado: { symbol: string; name: string; source: string };
  if (manual && isTipoManual(tipoAtivo)) {
    const jaPlanejado = await encontrarPlanejadoManual(targetUserId, tipoAtivo, nome);
    if (jaPlanejado) throw new ApiError(409, 'Este ativo já está planejado nesta aba');
    const asset = await criarAssetPlanejadoManual(tipoAtivo, nome);
    assetId = asset.id;
    assetDoPlanejado = asset;
  } else {
    assetId = assetIdInformado!;
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new ApiError(404, 'Ativo não encontrado');
    assetDoPlanejado = asset;
    const tiposDaAba = TIPOS_ATIVO_PLANEJAVEIS[aba] as readonly string[];
    const pertence =
      tiposDaAba.includes(asset.type) &&
      // Stocks (aba) = type 'stock' em USD; ações B3 também são 'stock'.
      (aba !== 'stocks' || asset.currency === 'USD');
    if (!pertence) {
      throw new ApiError(400, 'O ativo escolhido não pertence a esta aba da carteira');
    }
    // ETF manual (americano) não é catálogo: só nasce pelo sentinela. Por id, seria o Asset de
    // outro usuário (sem dono na tabela) ou um órfão.
    if (tipoAtivo === 'etf' && asset.source === 'manual') {
      throw new ApiError(403, 'Este ativo não está na sua carteira.');
    }

    const posicao = await prisma.portfolio.findFirst({
      where: { userId: targetUserId, assetId },
      select: { id: true },
    });
    if (posicao) {
      throw new ApiError(
        409,
        'Este ativo já está na sua carteira — edite o objetivo na própria aba',
      );
    }
    const existente = await prisma.watchlist.findFirst({
      where: { userId: targetUserId, assetId },
    });
    if (existente) throw new ApiError(409, 'Este ativo já está planejado nesta aba');
  }

  const planejado = await prisma.watchlist.create({
    data: {
      userId: targetUserId,
      assetId,
      objetivo,
      secao: secaoFinal,
      notes: observacoes?.trim() || null,
    },
  });

  invalidarContextoUsuario(targetUserId);
  await recordPlanejadoAdicionado(request, auth, planejado, assetDoPlanejado);
  return NextResponse.json({ success: true, planejado }, { status: 201 });
});
