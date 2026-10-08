'use client';

/**
 * Botão "Comparar" do cabeçalho do ativo (Bloco D, fatia D): link para
 * ROTAS_BLOCO_D.comparar([ticker]) — o Comparador abre com o ativo no 1º slot (decisão 13). Botão
 * branco com borda (o mesmo secundário de "Registrar operação"), 44px ou mais.
 *
 * LinhaAcoesCabecalho é a linha de ações do CabecalhoAtivo: sem config.recursos.comparador ela é
 * exatamente o <div className="min-w-0"> de hoje (regressão da decisão 15); com o recurso, põe o
 * "Comparar" depois de "Planejar na Carteira" / "Registrar operação", sem mudar a ordem deles.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconeComparar } from '@/components/analiseAtivos/quadro/BandejaComparar';
import { BOTAO_SECUNDARIO } from '@/components/analiseAtivos/ativo/usuario/AcoesCarteiraAtivo';
import { useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import { ROTAS_BLOCO_D } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import type { BotaoCompararProps } from '@/types/analiseAtivosBlocoD';

const T = TEXTOS_ENTRADAS_COMPARADOR.cabecalhoAtivo;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

/** Recurso Comparador ligado para o usuário e classe com Comparador (ação ou FII). */
export function useComparadorLigado(classe: ClasseQuadro): boolean {
  const config = useAnaliseAtivosConfig();
  return config.data?.recursos?.comparador === true && (classe === 'acao' || classe === 'fii');
}

/** Só o link (sem checar a flag): quem monta decide. */
export function LinkComparar({ ticker }: { ticker: string }) {
  const t = ticker.toUpperCase();
  return (
    <Link
      href={ROTAS_BLOCO_D.comparar([t])}
      aria-label={formatarTexto(T.aria, { ticker: t })}
      data-botao-comparar=""
      className={`${BOTAO_SECUNDARIO} gap-1.5 ${FOCO}`}
    >
      <IconeComparar />
      {T.botao}
    </Link>
  );
}

export default function BotaoComparar({ ticker, classe }: BotaoCompararProps) {
  const ligado = useComparadorLigado(classe);
  if (!ligado) return null;
  return <LinkComparar ticker={ticker} />;
}

export function LinhaAcoesCabecalho({
  ticker,
  classe,
  children,
}: BotaoCompararProps & { children: ReactNode }) {
  const ligado = useComparadorLigado(classe);
  if (!ligado) return <div className="min-w-0">{children}</div>;
  return (
    <div
      data-acoes-cabecalho=""
      className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-end"
    >
      {children}
      <LinkComparar ticker={ticker} />
    </div>
  );
}
