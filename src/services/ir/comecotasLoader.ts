/**
 * Carrega a projeção de come-cotas de um usuário (posições em fundos CVM).
 *
 * A inferência de tipo de fundo e a leitura do Portfolio moravam dentro de
 * /api/analises/ir-comecotas; foram extraídas aqui para que a Agenda (fonte
 * `ir`) marque 31/05 e 30/11 com o MESMO número que a tela de IR mostra.
 */
import { prisma } from '@/lib/prisma';
import { FUNDO_TYPES_ALL, isFundoSubtipo } from '@/lib/fundoTypes';
import type { FundoSubtipo } from '@/lib/fundoTypes';
import {
  projetarComecotas,
  type ComecotasResult,
  type FundoPosicao,
  type FundoTipo,
} from './comecotasIR';

/**
 * Subtipo que o usuário escolheu no wizard ("FIA", "FIP", "Renda Fixa"…) →
 * regime de come-cotas. É a resposta mais confiável que temos para o fundo
 * MANUAL, que não tem classificação CVM: só o dono sabe o que comprou.
 *
 * Curto × longo prazo não sai daqui: depende do prazo médio da carteira do
 * fundo, que o wizard não pergunta. Esses caem em longo prazo (15%) e só a
 * heurística de nome tenta o curto.
 */
const SUBTIPO_PARA_REGIME: Partial<Record<FundoSubtipo, FundoTipo>> = {
  fia: 'acoes',
  fip: 'fip',
  'fip-infra': 'fip-infra',
  fim: 'longo-prazo',
  rf: 'longo-prazo',
  cambial: 'longo-prazo',
  fidc: 'longo-prazo',
  fiagro: 'longo-prazo',
};

/** Classificação CVM (RCVM 175) → regime de come-cotas. Dado oficial. */
const REGIME_POR_ASSET_TYPE: Record<string, FundoTipo> = {
  fia: 'acoes',
  fip: 'fip',
  'fip-infra': 'fip-infra',
  fidc: 'longo-prazo',
  fiagro: 'longo-prazo',
  multimercado: 'longo-prazo',
  'fund-rf': 'longo-prazo',
  'fund-cambial': 'longo-prazo',
  'etf-cvm': 'longo-prazo',
};

/**
 * Palpite pelo NOME, último recurso — e o único caminho para "curto prazo",
 * que nenhum cadastro informa hoje.
 */
export function inferirTipoFundo(
  assetType: string | null | undefined,
  nome: string | null | undefined,
): FundoTipo {
  const porType = assetType ? REGIME_POR_ASSET_TYPE[assetType] : undefined;
  if (porType) return porType;
  if (!nome) return 'longo-prazo';
  const lower = nome.toLowerCase();
  if (lower.includes('ações') || lower.includes('fia') || lower.includes('acoes')) return 'acoes';
  if (lower.includes('curto prazo') || lower.includes('cp ')) return 'curto-prazo';
  return 'longo-prazo';
}

/**
 * Regime de come-cotas do fundo, na ordem em que a informação é confiável:
 *  1. **Classificação CVM** (`Asset.type` específico) — dado oficial.
 *  2. **Subtipo do wizard** (`notes.tipoFundo`) — o que o usuário respondeu ao
 *     cadastrar. Vale para o fundo manual e para o CVM sem classificação
 *     ('fund'/'funds'), que antes caía direto no palpite por nome: um FIA
 *     chamado "Alpha Valor" pagava come-cotas que não devia.
 *  3. **Palpite pelo nome** — último recurso.
 *
 * Mesma precedência que a aba "Fundos" já usa (ver /api/carteira/fim-fia).
 */
export function resolverRegimeComecotas(
  assetType: string | null | undefined,
  nome: string | null | undefined,
  tipoFundoDoWizard?: unknown,
): FundoTipo {
  const porType = assetType ? REGIME_POR_ASSET_TYPE[assetType] : undefined;
  if (porType) return porType;

  if (isFundoSubtipo(tipoFundoDoWizard)) {
    const doWizard = SUBTIPO_PARA_REGIME[tipoFundoDoWizard];
    if (doWizard) return doWizard;
  }
  return inferirTipoFundo(assetType, nome);
}

function parseNotes(notes?: string | null): Record<string, unknown> | null {
  if (!notes) return null;
  try {
    return JSON.parse(notes) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Subtipo informado no wizard, por ativo — vem das notes da compra mais
 * recente de cada fundo (mesmo lugar que a aba "Fundos" lê).
 */
async function tipoFundoPorAsset(
  userId: string,
  assetIds: string[],
): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (assetIds.length === 0) return out;
  const compras = await prisma.stockTransaction.findMany({
    where: { userId, assetId: { in: assetIds }, type: 'compra' },
    select: { assetId: true, notes: true },
    orderBy: { date: 'desc' },
  });
  for (const c of compras) {
    if (!c.assetId || out.has(c.assetId)) continue;
    const tipo = parseNotes(c.notes)?.tipoFundo;
    if (tipo !== undefined) out.set(c.assetId, tipo);
  }
  return out;
}

export async function carregarPosicoesFundos(userId: string): Promise<FundoPosicao[]> {
  const portfolio = await prisma.portfolio.findMany({
    where: { userId, asset: { type: { in: [...FUNDO_TYPES_ALL] } } },
    include: { asset: true },
  });

  const emCarteira = portfolio.filter((p) => p.quantity > 0 && p.assetId);
  const tipoPorAsset = await tipoFundoPorAsset(
    userId,
    emCarteira.map((p) => p.assetId as string),
  );

  return emCarteira.map((p) => {
    const valorAplicado = p.totalInvested || p.quantity * p.avgPrice;
    const currentPrice = p.asset?.currentPrice ? Number(p.asset.currentPrice) : p.avgPrice;
    const valorAtualizado =
      currentPrice && p.quantity > 0 ? p.quantity * currentPrice : valorAplicado;
    return {
      symbol: p.asset?.symbol || 'FUNDO',
      nome: p.asset?.name || p.asset?.symbol || 'Fundo',
      valorAplicado,
      valorAtualizado,
      startDate: p.lastUpdate ?? new Date(),
      tipo: resolverRegimeComecotas(
        p.asset?.type,
        p.asset?.name,
        tipoPorAsset.get(p.assetId as string),
      ),
    };
  });
}

export async function carregarComecotas(
  userId: string,
  asOfDate: Date = new Date(),
): Promise<ComecotasResult> {
  return projetarComecotas(await carregarPosicoesFundos(userId), asOfDate);
}
