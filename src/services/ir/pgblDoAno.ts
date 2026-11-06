import { prisma } from '@/lib/prisma';
import { sugerirTipoPlanoPrevidencia, type TipoPlanoPrevidencia } from '@/services/ir/irpfAnual';

/**
 * Aportes do ano nos planos de previdência da carteira (Asset.type = 'previdencia'), agrupados
 * por plano, com o saldo atual. Serve a aba PGBL do IR (GET /api/analises/ir-pgbl) e a seção 8
 * do Relatório financeiro. Só leitura.
 *
 * A carteira não grava se o plano é PGBL ou VGBL (o fundo de previdência do catálogo CVM serve
 * aos dois). `tipoSugerido` é só um palpite pelo nome; quem decide é o usuário na tela.
 */

export interface PlanoPrevidenciaIR {
  assetId: string;
  nome: string;
  cnpj: string | null;
  tipoSugerido: TipoPlanoPrevidencia;
  aportesQuantidade: number;
  aportesTotal: number;
  resgatesTotal: number;
  saldoAtual: number;
}

const arred = (v: number) => Math.round(v * 100) / 100;

export async function pgblDoAno(userId: string, year: number): Promise<PlanoPrevidenciaIR[]> {
  const inicio = new Date(Date.UTC(year, 0, 1));
  const fim = new Date(Date.UTC(year + 1, 0, 1));

  const [posicoes, transacoes] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId, asset: { type: 'previdencia' } },
      include: { asset: true },
    }),
    prisma.stockTransaction.findMany({
      where: {
        userId,
        asset: { type: 'previdencia' },
        date: { gte: inicio, lt: fim },
      },
      include: { asset: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const planos = new Map<string, PlanoPrevidenciaIR>();
  const plano = (asset: { id: string; name: string; cnpj: string | null }) => {
    let p = planos.get(asset.id);
    if (!p) {
      p = {
        assetId: asset.id,
        nome: asset.name,
        cnpj: asset.cnpj ?? null,
        tipoSugerido: sugerirTipoPlanoPrevidencia(asset.name),
        aportesQuantidade: 0,
        aportesTotal: 0,
        resgatesTotal: 0,
        saldoAtual: 0,
      };
      planos.set(asset.id, p);
    }
    return p;
  };

  // Saldo atual: mesma regra da aba Previdência e Seguros (cota CVM × quantidade, senão o
  // preço médio editado, senão o investido).
  for (const item of posicoes) {
    if (!item.asset) continue;
    const cota = item.asset.currentPrice?.toNumber() ?? 0;
    const saldo =
      cota > 0 && item.quantity > 0
        ? cota * item.quantity
        : item.avgPrice > 0 && item.quantity > 0
          ? item.avgPrice * item.quantity
          : item.totalInvested;
    plano(item.asset).saldoAtual += saldo;
  }

  for (const t of transacoes) {
    if (!t.asset) continue;
    const valor = Math.abs(t.total || t.quantity * t.price);
    const p = plano(t.asset);
    if (t.type === 'compra') {
      p.aportesQuantidade += 1;
      p.aportesTotal += valor;
    } else if (t.type === 'venda') {
      p.resgatesTotal += valor;
    }
  }

  return [...planos.values()]
    .filter((p) => p.aportesQuantidade > 0 || p.saldoAtual > 0)
    .map((p) => ({
      ...p,
      aportesTotal: arred(p.aportesTotal),
      resgatesTotal: arred(p.resgatesTotal),
      saldoAtual: arred(p.saldoAtual),
    }))
    .sort((a, b) => b.aportesTotal - a.aportesTotal || a.nome.localeCompare(b.nome));
}
