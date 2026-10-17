/**
 * planning_asset_targets — LEGADO do "Planejar na carteira" da v2.5 (alvo em % da carteira TOTAL).
 *
 * Desde 17/10/2026 o Planejar grava o Objetivo da Carteira (objetivoAtivo.ts): a tabela não é mais
 * lida nem gravada pela Análise. O modelo fica no schema (sem migration) até as linhas existentes
 * passarem pelo script scripts/analise-ativos/migrar-alvos-para-objetivo.ts. Enquanto houver linha,
 * a LGPD continua valendo para ela:
 * - alvosParaExportacao (Art. 18, V) na exportação do perfil;
 * - apagarAlvosDoUsuario na exclusão de conta — o User é ANONIMIZADO, não apagado, então o
 *   onDelete Cascade da FK nunca roda (achado da revisão).
 */
import prisma from '@/lib/prisma';

/** Alvos (legado) do usuário para a exportação LGPD (Art. 18, V). */
export async function alvosParaExportacao(userId: string) {
  const linhas = await prisma.planningAssetTarget.findMany({
    where: { userId },
    select: {
      targetPct: true,
      atualizadoPorUserId: true,
      createdAt: true,
      updatedAt: true,
      asset: { select: { symbol: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return linhas.map((l) => ({
    ticker: l.asset?.symbol ?? null,
    targetPct: Number(l.targetPct),
    atualizadoPorUserId: l.atualizadoPorUserId,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }));
}

/** Exclusão de conta (Art. 18, VI): apaga todos os alvos (legado) do usuário. */
export async function apagarAlvosDoUsuario(userId: string): Promise<number> {
  const { count } = await prisma.planningAssetTarget.deleteMany({ where: { userId } });
  return count;
}
