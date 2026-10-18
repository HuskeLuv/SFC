/**
 * Seed das fixtures EUA (Stocks e REITs) do banco efêmero do CI/e2e — sem rede: nada de SEC ao vivo
 * em teste; as fixtures são arquivos locais (prisma/fixtures/analise-ativos/eua-*.json).
 *
 * DONO: fatia C (e2e/analise-ativos-eua.spec.ts); a fatia D usa as MESMAS linhas no e2e de escrita
 * (e2e/analise-ativos-eua-carteira.escrita.spec.ts) sem editar este arquivo. Criado na fatia 0 como
 * STUB com a assinatura final: chamado por seedAnaliseAtivos depois das fixtures BR (só no banco
 * efêmero, o mesmo critério de asset_scores vazio) e, até a fatia C preencher, não grava nada.
 * Quando preencher: SecCompany/SecCompanyTicker + AssetFundamentalsPeriod source 'SEC' de alguns
 * CIKs, depois o job 'criterios-eua' e o 'quadro-eua' (gravadores com CLASSES_EUA — nunca apagam
 * as linhas BR da amostra). Devolve quantas linhas stock/reit ficaram no Quadro.
 */
import type { PrismaClient } from '@prisma/client';

export async function semearFixturesEua(_prisma: PrismaClient): Promise<number> {
  return 0;
}
