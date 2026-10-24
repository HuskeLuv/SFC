'use client';

/**
 * Card "Composição do fundo" (A6, item 2; fatia A): barra 100% horizontal + legenda com as fatias
 * sobre a base (caixa + imóveis + papéis + fundos) do último informe mensal. Tons neutros da paleta My Finance (azuis e cinzas),
 * nenhuma fatia com cor de "bom" ou "ruim". `largo` (papel e FoF, sem lista ao lado): barra e legenda
 * à esquerda, "Como ler" à direita a partir de md.
 */
import CartaoAnalise from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import type { Estado } from '@/types/analiseAtivosApi';
import type { CodigoFatiaComposicao, ComposicaoFiiApi } from '@/types/analiseAtivosComplementos';

const T = TEXTOS_IMOVEIS_FII.composicao;

/** Cor de cada fatia (paleta My Finance + cinzas do app), claro/escuro. Sem cor semântica. */
export const COR_FATIA: Readonly<Record<CodigoFatiaComposicao, string>> = {
  imoveis: 'bg-mf-seguranca dark:bg-mf-tranquilidade',
  cri_cra: 'bg-mf-patrimonio dark:bg-mf-patrimonio',
  cotas_fii: 'bg-mf-outside/70 dark:bg-mf-outside/60',
  caixa_renda_fixa: 'bg-mf-transparencia dark:bg-gray-500',
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-09-01' → 'set/2026'. */
export function mesAno(refMonth: string): string {
  const m = Number(refMonth.slice(5, 7));
  return `${MESES[m - 1] ?? refMonth.slice(5, 7)}/${refMonth.slice(0, 4)}`;
}

const pct = (v: number) => formatarAnalise(v, 'pct');
const reais = (v: number) => formatarAnalise(v, 'moedaCompacta');

interface Props {
  ticker: string;
  composicao: Estado<ComposicaoFiiApi>;
  largo?: boolean;
  /** papel/FoF: frase de que a lista de imóveis não se aplica (no "Como ler") */
  semLista?: boolean;
}

function Barra({ c }: { c: ComposicaoFiiApi }) {
  const visiveis = c.fatias.filter((f) => f.pct > 0);
  return (
    <div
      role="img"
      aria-label={`${T.ariaBarra}: ${c.fatias
        .map((f) => `${T.fatias[f.codigo]} ${pct(f.pct)}`)
        .join(', ')}`}
      className="flex h-4 w-full gap-0.5 overflow-hidden rounded-md bg-gray-100 dark:bg-white/[0.06]"
      data-composicao-barra=""
    >
      {visiveis.map((f) => (
        <i
          key={f.codigo}
          title={`${T.fatias[f.codigo]}: ${pct(f.pct)}`}
          style={{ width: `${f.pct}%` }}
          className={`block h-full min-w-0.5 ${COR_FATIA[f.codigo]}`}
        />
      ))}
    </div>
  );
}

function Legenda({ c }: { c: ComposicaoFiiApi }) {
  const sub = T.subFatias as Partial<Record<CodigoFatiaComposicao, string>>;
  return (
    <ul className="m-0 mt-3 flex list-none flex-col p-0">
      {c.fatias.map((f) => (
        <li
          key={f.codigo}
          data-fatia={f.codigo}
          className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-gray-100 py-2 text-[13px] last:border-b-0 dark:border-gray-800"
        >
          <i aria-hidden className={`block size-3 rounded-[3px] ${COR_FATIA[f.codigo]}`} />
          <span className="min-w-0 text-gray-700 dark:text-gray-200">
            {T.fatias[f.codigo]}
            {sub[f.codigo] ? (
              <small className="block text-[11px] text-gray-500 dark:text-gray-400">
                {sub[f.codigo]}
              </small>
            ) : null}
          </span>
          <span className="text-right font-semibold whitespace-nowrap text-gray-800 tabular-nums dark:text-white/90">
            {pct(f.pct)}
            <em className="ml-2 text-[11.5px] font-normal not-italic text-gray-500 dark:text-gray-400">
              {reais(f.valor)}
            </em>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ComposicaoAtivoFii({ ticker, composicao, largo, semLista }: Props) {
  const rodape =
    composicao.estado === 'ok' ? (
      <p className="m-0 text-xs text-gray-500 dark:text-gray-400">
        {formatarTexto(T.base, { valor: reais(composicao.valor.base) })} ·{' '}
        {formatarTexto(T.ativoTotal, { valor: reais(composicao.valor.ativoTotal) })} ·{' '}
        {formatarTexto(T.rodape, { data: mesAno(composicao.valor.refMonth) })}
      </p>
    ) : null;
  const comoLer = (
    <div className="rounded-xl bg-gray-50 px-4 py-3 text-[13px] leading-relaxed text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
      <b className="text-gray-800 dark:text-white/90">{T.comoLerTitulo}.</b> {T.comoLer}
      {semLista ? <span className="mt-2 block">{T.semLista}</span> : null}
    </div>
  );
  return (
    <CartaoAnalise id={`composicao-${ticker}`} titulo={T.titulo} sub={T.sub}>
      <div data-composicao-fii="">
        {composicao.estado !== 'ok' ? (
          <p className="m-0 text-sm text-gray-600 dark:text-gray-300" data-composicao-sem-dado="">
            {composicao.texto}
          </p>
        ) : largo ? (
          <div className="grid items-start gap-5 md:grid-cols-2">
            <div className="min-w-0">
              <Barra c={composicao.valor} />
              <Legenda c={composicao.valor} />
            </div>
            {comoLer}
          </div>
        ) : (
          <>
            <Barra c={composicao.valor} />
            <Legenda c={composicao.valor} />
          </>
        )}
        {composicao.estado !== 'ok' && largo ? <div className="mt-3">{comoLer}</div> : null}
      </div>
      {rodape}
    </CartaoAnalise>
  );
}
