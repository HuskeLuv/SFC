'use client';

/**
 * Bandeja do modo Comparar do Quadro (Bloco D, fatia D). Fundo #314666 com texto branco:
 * "n de 4 selecionados", os tickers marcados (ou a instrução) e, no limite, "limite atingido" —
 * tudo numa região aria-live, que é onde o motivo das caixas desabilitadas é anunciado.
 * "Comparar n" abre o Comparador com os tickers nos slots, na ordem marcada, a partir de 1 ativo
 * (decisão 13); com 0 fica desabilitado. Computador: sticky no rodapé do card do Quadro. Celular:
 * fixa acima da barra de abas (--mf-bottom-nav-h já inclui a área segura; +1,75rem para o "+ Lançar",
 * que sobressai da barra) e o botão flutuante do assistente some enquanto ela existe (mesmo padrão
 * da barra de comentário da Comunidade). Alvos de 44px.
 */
import Link from 'next/link';
import { MAX_ATIVOS_COMPARADOR, ROTAS_BLOCO_D } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import { podeComparar } from '@/components/analiseAtivos/quadro/useSelecaoComparar';
import type { BandejaCompararProps } from '@/types/analiseAtivosBlocoD';

const T = TEXTOS_ENTRADAS_COMPARADOR.bandeja;
const FOCO_CLARO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#314666]';
const BOTAO = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold ${FOCO_CLARO}`;

/** Ícone de duas colunas (comparar). */
export function IconeComparar({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M4 5h6v14H4zM14 5h6v14h-6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BandejaComparar({ classe, tickers, onLimpar }: BandejaCompararProps) {
  const n = tickers.length;
  const max = MAX_ATIVOS_COMPARADOR;
  const cheio = n >= max;
  const habilitado = podeComparar(n);
  const instrucao = formatarTexto(classe === 'fii' ? T.instrucaoFii : T.instrucaoAcao, { max });
  const detalhe =
    n > 0 ? `${tickers.join(', ')}${cheio ? ` · ${T.limiteAtingido}` : ''}` : instrucao;
  const rotuloComparar = n > 0 ? formatarTexto(T.compararN, { n }) : T.comparar;

  return (
    <div
      role="region"
      aria-label={T.rotulo}
      data-bandeja-comparar=""
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl bg-[#314666] py-2 pr-2 pl-4 text-white shadow-lg max-lg:fixed max-lg:inset-x-4 max-lg:bottom-[calc(var(--mf-bottom-nav-h,0px)+1.75rem)] max-lg:z-[9985] lg:sticky lg:bottom-3 lg:z-20 dark:ring-1 dark:ring-white/15"
    >
      {/* celular: o botão flutuante do assistente cobriria o "Comparar" e some enquanto a bandeja
          existe; o conteúdo ganha espaço no fim para nada ficar embaixo dela. Computador: com o botão
          do assistente na tela, a bandeja para acima dele */}
      <style>{`@media (width < 64rem) { :root:has([data-bandeja-comparar]) [data-mf-fab] { display: none; } :root:has([data-bandeja-comparar]) [data-mf-content] { padding-bottom: 8rem; } } @media (width >= 64rem) { :root:has([data-mf-fab]) [data-bandeja-comparar] { bottom: 5.5rem; } }`}</style>
      <p aria-live="polite" className="min-w-0 text-sm font-medium" data-bandeja-texto="">
        {formatarTexto(T.contagem, { n, max })}
        <small className="block truncate text-xs font-normal text-[#EAEAEA]">{detalhe}</small>
        {cheio ? (
          <span className="sr-only">
            {formatarTexto(TEXTOS_ENTRADAS_COMPARADOR.quadro.caixaDesabilitada, { max })}
          </span>
        ) : null}
      </p>
      <div className="ml-auto flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={onLimpar}
          disabled={n === 0}
          className={`${BOTAO} border border-white/40 text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {T.limpar}
        </button>
        {habilitado ? (
          <Link
            href={ROTAS_BLOCO_D.comparar(tickers)}
            aria-label={formatarTexto(T.compararAria, { valor: tickers.join(', ') })}
            data-bandeja-ir=""
            className={`${BOTAO} bg-white text-[#314666] hover:bg-[#EAEAEA]`}
          >
            <IconeComparar />
            {rotuloComparar}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            data-bandeja-ir=""
            className={`${BOTAO} cursor-not-allowed bg-white/70 text-[#314666]`}
          >
            <IconeComparar />
            {rotuloComparar}
          </button>
        )}
      </div>
    </div>
  );
}
