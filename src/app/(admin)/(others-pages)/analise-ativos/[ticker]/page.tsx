import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import PaginaAtivo from '@/components/analiseAtivos/pagina/PaginaAtivo';
import { analiseAtivosEuaHabilitado } from '@/lib/analiseAtivosConfig';
import { ehTickerEua, symbolAnaliseDaSec } from '@/types/analiseAtivosEua';

/** Ticker de ação/FII da B3: 4 letras/dígitos + 1–2 dígitos (WEGE3, KLBN11, HGLG11). */
const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

/**
 * Stocks e REITs (fatia C): com ANALISE_ATIVOS_EUA_HABILITADO o ticker EUA também vale (AAPL, O,
 * BRK.B; a forma da SEC BRK-B redireciona para BRK.B). Sem a chave, segue 404 como hoje.
 */
function tickerValido(t: string): boolean {
  return TICKER_RE.test(t) || (analiseAtivosEuaHabilitado() && ehTickerEua(t));
}

type Params = Promise<{ ticker: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { ticker } = await params;
  const t = decodeURIComponent(ticker).toUpperCase();
  return { title: tickerValido(t) ? `${t} · Análise de Ativos` : 'Análise de Ativos' };
}

/**
 * Página do ativo com URL própria (decisão 8): /analise-ativos/WEGE3. Ticker em minúsculas
 * redireciona para maiúsculas; formato inválido → 404 da raiz. Ticker válido mas fora da área
 * → a PaginaAtivo mostra "não encontrado" (a API responde 404).
 */
export default async function AtivoPage({ params }: { params: Params }) {
  const { ticker } = await params;
  const bruto = decodeURIComponent(ticker);
  const maiusculo = bruto.toUpperCase();
  if (!tickerValido(maiusculo)) notFound();
  const t = TICKER_RE.test(maiusculo) ? maiusculo : symbolAnaliseDaSec(maiusculo);
  if (bruto !== t) redirect(`/analise-ativos/${encodeURIComponent(t)}`);
  return (
    <AnaliseAtivosShell variante="ativo">
      <PaginaAtivo ticker={t} />
    </AnaliseAtivosShell>
  );
}
