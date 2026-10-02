/**
 * Gate da área /analise-ativos (decisão 10). Layout SERVER, filho do AdminLayoutClient:
 * - flag ANALISE_ATIVOS_HABILITADA desligada → notFound(). Lançado no próprio layout, ele sobe
 *   para o src/app/not-found.tsx da RAIZ (o segmento não tem not-found próprio).
 * - flag ligada e usuário fora do beta → tela informativa "Área em beta fechado".
 * - liberada → children.
 * O acesso é do usuário LOGADO (cookie 'token', verificado com jose como em src/app/page.tsx).
 * O middleware já redireciona quem não tem sessão; a revogação (sessionVersion) é checada nas APIs.
 */
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { jwtVerify } from 'jose';
import TelaForaDoBeta from '@/components/analiseAtivos/shell/TelaForaDoBeta';
import { analiseAtivosHabilitada } from '@/lib/analiseAtivosConfig';
import { estadoAcessoAnalise } from '@/services/analiseAtivos/acesso/acessoAnalise';

export const dynamic = 'force-dynamic';

async function usuarioDaSessao(): Promise<string | null> {
  const token = (await cookies()).get('token')?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return typeof payload.id === 'string' ? payload.id : null;
  } catch {
    return null;
  }
}

export default async function AnaliseAtivosLayout({ children }: { children: React.ReactNode }) {
  if (!analiseAtivosHabilitada()) notFound();
  const userId = await usuarioDaSessao();
  if (!userId) notFound();
  const estado = await estadoAcessoAnalise(userId);
  if (estado === 'desligada') notFound();
  if (estado === 'fora_do_beta') return <TelaForaDoBeta />;
  return <>{children}</>;
}
