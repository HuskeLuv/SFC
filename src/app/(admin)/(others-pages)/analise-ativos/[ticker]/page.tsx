import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import PaginaAtivo from '@/components/analiseAtivos/pagina/PaginaAtivo';

/** Ticker de ação/FII da B3: 4 letras/dígitos + 1–2 dígitos (WEGE3, KLBN11, HGLG11). */
const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

type Params = Promise<{ ticker: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { ticker } = await params;
  const t = decodeURIComponent(ticker).toUpperCase();
  return { title: TICKER_RE.test(t) ? `${t} · Análise de Ativos` : 'Análise de Ativos' };
}

/**
 * Página do ativo com URL própria (decisão 8): /analise-ativos/WEGE3. Ticker em minúsculas
 * redireciona para maiúsculas; formato inválido → 404 da raiz. Ticker válido mas fora da área
 * → a PaginaAtivo mostra "não encontrado" (a API responde 404).
 */
export default async function AtivoPage({ params }: { params: Params }) {
  const { ticker } = await params;
  const bruto = decodeURIComponent(ticker);
  const t = bruto.toUpperCase();
  if (!TICKER_RE.test(t)) notFound();
  if (bruto !== t) redirect(`/analise-ativos/${t}`);
  return (
    <AnaliseAtivosShell variante="ativo">
      <PaginaAtivo ticker={t} />
    </AnaliseAtivosShell>
  );
}
