'use client';

/**
 * Card "Retorno total" (antes "Variação da cotação") da página do ativo (A6, item 5; fatia C). A PaginaAtivo só o monta
 * quando o topo traz `retornos` (ANALISE_ATIVOS_RETORNOS_HABILITADO), em largura total depois de
 * GraficoLucroCotacao + BlocoDividendos e antes de Fundamentos.
 *
 * - 4 janelas (1 mês, 12 meses, 5 e 10 anos a.a.) + distância da máxima de fechamento ajustada.
 * - Sinal +/− em cor NEUTRA (decisão do Wellington, 19/10): nenhuma classe de cor semântica aqui —
 *   o verde/vermelho fica só na variação do dia, no cabeçalho.
 * - Janela sem dado: 'sem dado' + o motivo (série curta, evento em conferência, sem cotação).
 * - Rodapé: retorno total (proventos reinvestidos), fonte e data; no FII, o texto sobre os rendimentos; rentabilidade
 *   passada. Textos só de TEXTOS_RETORNOS.
 * - Grade: 2 colunas no celular (a distância da máxima ocupa a linha toda), 5 a partir de lg.
 */
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_RETORNOS } from '@/services/analiseAtivos/textosRetornos';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { Estado } from '@/types/analiseAtivosApi';
import type { BlocoRetornosCotacaoProps } from '@/types/analiseAtivosComplementos';

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const CELULA =
  'flex min-w-0 flex-col gap-1 rounded-xl border border-gray-200 px-3 py-3 dark:border-gray-800';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'AAAA-MM-DD' → 'dd/mm/aaaa'. */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** 'AAAA-MM-DD' → 'mmm/aaaa' (ex.: 'jan/2015'). */
export function mesAno(iso: string): string {
  const [a, m] = iso.slice(0, 10).split('-');
  return `${MESES[Number(m) - 1] ?? m}/${a}`;
}

interface CelulaProps {
  rotulo: string;
  valor: Estado<number>;
  sub?: string | null;
  larga?: boolean;
  dado: string;
}

function Celula({ rotulo, valor, sub, larga, dado }: CelulaProps) {
  const T = TEXTOS_RETORNOS;
  const ok = valor.estado === 'ok';
  const texto = ok ? formatarAnalise(valor.valor, 'pctSinal') : T.semDado;
  const detalhe = ok ? (sub ?? null) : valor.texto;
  return (
    <div
      data-janela={dado}
      data-estado={valor.estado}
      className={`${CELULA} ${larga ? 'col-span-2 lg:col-span-1' : ''}`}
      aria-label={formatarTexto(T.ariaCelula, { campo: rotulo, valor: texto })}
      role="group"
    >
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{rotulo}</span>
      <span
        className={
          ok
            ? 'text-lg font-semibold tabular-nums text-gray-800 dark:text-white/90'
            : 'text-sm font-medium text-gray-500 dark:text-gray-400'
        }
      >
        {texto}
      </span>
      {detalhe ? (
        <span className="text-xs leading-snug text-gray-500 dark:text-gray-400">{detalhe}</span>
      ) : null}
    </div>
  );
}

export default function BlocoRetornosCotacao({ ticker, retornos }: BlocoRetornosCotacaoProps) {
  const T = TEXTOS_RETORNOS;
  const subMaxima =
    retornos.maxima && retornos.inicioSerie
      ? formatarTexto(T.distanciaMaximaSub, {
          valor: formatarAnalise(retornos.maxima.preco, 'moeda'),
          data: dataBr(retornos.maxima.data),
          desde: mesAno(retornos.inicioSerie),
        })
      : null;
  const idTitulo = `bloco-retornos-h-${ticker}`;

  return (
    <section
      aria-labelledby={idTitulo}
      data-bloco="retornos"
      className={`${CARD} flex min-w-0 flex-col gap-3`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={idTitulo} className="text-base font-semibold text-gray-800 dark:text-white/90">
          {T.titulo}
        </h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">{T.sub}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        {retornos.janelas.map((j) => (
          <Celula key={j.janela} dado={j.janela} rotulo={T.janelas[j.janela]} valor={j.valor} />
        ))}
        <Celula
          dado="maxima"
          rotulo={T.distanciaMaxima}
          valor={retornos.distanciaMaxima}
          sub={subMaxima}
          larga
        />
      </div>
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        <p>{formatarTexto(T.rodape, { data: dataBr(retornos.ateData) })}</p>
        {retornos.classe === 'fii' ? <p data-nota-fii>{T.rodapeFii}</p> : null}
        <p>{T.rentabilidadePassada}</p>
      </div>
    </section>
  );
}
