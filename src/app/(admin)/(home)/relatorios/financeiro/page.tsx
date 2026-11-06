import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import RelatorioFinanceiroPage from '@/components/relatorios/financeiro/RelatorioFinanceiroPage';
import { ehPlano } from '@/lib/planos';
import { relatorioFinanceiroHabilitado } from '@/lib/relatorioFinanceiroConfig';
import {
  MESES_RELATORIO,
  type MesesRelatorio,
  type RelatorioFinanceiro,
} from '@/types/relatorioFinanceiro';

/**
 * /relatorios/financeiro — Relatório financeiro (ticket 86e3yg90z).
 *
 * Server component: com a chave RELATORIO_FINANCEIRO_HABILITADO desligada, 404 (a API e o menu
 * também somem). O período mora na URL (?meses=1|3|6|12).
 *
 * Modo demonstração (?fixture=exemplo&plano=basic|pro|adv): o relatório de exemplo do Pedro
 * (Ana Ribeiro, gerado em 03/11/2026), montado AQUI no servidor com o cadeado aplicado — o
 * módulo do exemplo nunca vai para os chunks do navegador. Só fora de produção ou com
 * RELATORIO_PLANO_FORCADO_PERMITIDO=1 (build de produção do e2e).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Relatório financeiro | My Finance' };

type Busca = Record<string, string | string[] | undefined>;

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ?meses=N (padrão 1), o mesmo critério do cliente (RelatorioFinanceiroPage). */
function mesesDaBusca(v: string | undefined): MesesRelatorio {
  const n = Number(v);
  return (MESES_RELATORIO as readonly number[]).includes(n) ? (n as MesesRelatorio) : 1;
}

function demonstracaoPermitida(): boolean {
  return (
    process.env.NODE_ENV !== 'production' || process.env.RELATORIO_PLANO_FORCADO_PERMITIDO === '1'
  );
}

async function relatorioDeDemonstracao(busca: Busca): Promise<RelatorioFinanceiro | null> {
  if (primeiro(busca.fixture) !== 'exemplo' || !demonstracaoPermitida()) return null;
  const plano = primeiro(busca.plano);
  const { relatorioExemplo } =
    await import('@/components/relatorios/financeiro/__fixtures__/relatorioExemplo');
  return relatorioExemplo(mesesDaBusca(primeiro(busca.meses)), ehPlano(plano) ? plano : 'adv');
}

export default async function RelatorioFinanceiroRota({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  if (!relatorioFinanceiroHabilitado()) notFound();
  const demonstracao = await relatorioDeDemonstracao(await searchParams);
  return (
    <ProtectedRoute>
      <RelatorioFinanceiroPage demonstracao={demonstracao} />
    </ProtectedRoute>
  );
}
