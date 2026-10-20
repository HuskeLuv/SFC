'use client';

/**
 * Card "Imóveis do fundo" (A6, item 1; fatia A): resumo (nº de imóveis de renda, área informada à
 * CVM, vacância física ponderada = a célula do Essencial, estados identificados no endereço),
 * locatários ('sem dado' com o motivo) e setores reais, tabela ordenada por área e o expansível
 * "Outros imóveis (N)".
 *
 * - Sem cor semântica (vacância por imóvel sem cor); inadimplência por imóvel não aparece.
 * - % da receita como informado (sem normalizar); soma fora de 90–105% ⇒ nota.
 * - Computador (md+): tabela TABLE_STYLES. Celular: cartões (TABLE_MOBILE_STYLES). Os dois saem do
 *   mesmo array; o CSS escolhe (sem medir a tela, sem pulo na hidratação).
 */
import { useState } from 'react';
import CartaoAnalise, {
  FUNDO_STICKY,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import {
  TABLE_HEADER_STYLE,
  TABLE_MOBILE_STYLES,
  TABLE_STYLES,
} from '@/components/ui/table/tableStyles';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { Estado } from '@/types/analiseAtivosApi';
import type { ImovelFiiApi, ListaImoveisFiiApi } from '@/types/analiseAtivosComplementos';

const T = TEXTOS_IMOVEIS_FII.imoveis;
const R = T.resumo;
const C = T.colunas;
/** imóveis mostrados antes de "Ver os N imóveis" */
export const IMOVEIS_INICIAIS = 10;
/** setores no resumo antes de "+ N setores" */
export const SETORES_INICIAIS = 6;
/** endereço truncado na tabela (o completo fica no title) */
const MAX_ENDERECO = 80;

const SEM = TEXTOS_TELA.formato.semDado;
const num = (v: number | null, f: 'pct' | 'inteiro') => (v === null ? SEM : formatarAnalise(v, f));

/** '2026-06-30' → '30/06/2026'. */
export function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Área total: '1,12 mi m²' a partir de 1 milhão; abaixo, inteiro ('48.700 m²'). */
export function areaCompacta(m2: number): string {
  if (m2 >= 1e6) return `${formatarAnalise(m2 / 1e6, 'numero2')} mi m²`;
  return `${formatarAnalise(m2, 'inteiro')} m²`;
}

function truncar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function textoUf(uf: string | null): string {
  return uf ? formatarTexto(T.uf, { valor: uf }) : T.ufNaoIdentificada;
}

function Quadro({
  rotulo,
  valor,
  sub,
  destaque,
}: {
  rotulo: string;
  valor: string;
  sub: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl px-3.5 py-3 ${
        destaque
          ? 'bg-mf-patrimonio/[0.08] dark:bg-mf-tranquilidade/[0.10]'
          : 'bg-gray-50 dark:bg-white/[0.03]'
      }`}
    >
      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{rotulo}</div>
      <div className="mt-1 text-lg leading-tight font-bold text-gray-800 tabular-nums dark:text-white/90">
        {valor}
      </div>
      <div className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{sub}</div>
    </div>
  );
}

function Resumo({ l }: { l: ListaImoveisFiiApi }) {
  const r = l.resumo;
  const vac = r.vacanciaFisicaPct;
  const setores = r.setores.slice(0, SETORES_INICIAIS);
  const resto = r.setores.length - setores.length;
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" data-resumo-imoveis="">
        <Quadro
          destaque
          rotulo={R.imoveisRenda}
          valor={formatarAnalise(r.nImoveisRenda, 'inteiro')}
          sub={r.nOutros > 0 ? formatarTexto(R.outrasClasses, { n: r.nOutros }) : ' '}
        />
        <Quadro
          rotulo={R.area}
          valor={r.areaTotalM2 === null ? SEM : areaCompacta(r.areaTotalM2)}
          sub={R.areaSub}
        />
        <Quadro
          rotulo={R.vacancia}
          valor={vac.estado === 'ok' ? formatarAnalise(vac.valor, 'pct') : SEM}
          sub={vac.estado === 'ok' ? R.vacanciaSub : vac.texto}
        />
        <Quadro
          rotulo={R.estados}
          valor={formatarAnalise(r.nEstados, 'inteiro')}
          sub={formatarTexto(R.estadosSub, { x: r.nComUf, y: r.nImoveisRenda })}
        />
      </div>
      <p
        className="m-0 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300"
        data-locatarios=""
      >
        <b className="text-gray-800 dark:text-white/90">{R.locatariosRotulo}</b>{' '}
        {R.locatariosSemDado}
        {setores.length > 0 ? (
          <span className="block" data-setores="">
            <b className="text-gray-800 dark:text-white/90">{R.setoresRotulo}</b> ({R.setoresSub}):{' '}
            {setores
              .map((s) =>
                formatarTexto(R.setorItem, {
                  nome: s.setor,
                  valor: s.receitaPct === null ? SEM : formatarAnalise(s.receitaPct, 'pct'),
                }),
              )
              .join(' · ')}
            {resto > 0 ? ` · ${formatarTexto(R.setoresMais, { n: resto })}` : ''}
          </span>
        ) : null}
      </p>
    </>
  );
}

function Tabela({ imoveis, ticker }: { imoveis: ImovelFiiApi[]; ticker: string }) {
  return (
    <div
      className={`${TABLE_STYLES.wrapper} hidden md:block`}
      role="region"
      tabIndex={0}
      aria-label={T.rotuloRegiao}
      data-imoveis-tabela=""
    >
      <table className={TABLE_STYLES.table}>
        <caption className="sr-only">{formatarTexto(T.caption, { ticker })}</caption>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <th
              scope="col"
              className={`${TABLE_STYLES.compact.th} sticky left-0 z-10 text-left`}
              style={TABLE_HEADER_STYLE}
            >
              {C.imovel}
            </th>
            <th scope="col" className={`${TABLE_STYLES.compact.th} text-left`}>
              {C.endereco}
            </th>
            <th scope="col" className={`${TABLE_STYLES.compact.th} text-right`}>
              {C.area}
            </th>
            <th scope="col" className={`${TABLE_STYLES.compact.th} text-right`}>
              {C.unidades}
            </th>
            <th scope="col" className={`${TABLE_STYLES.compact.th} text-right`}>
              {C.vacancia}
            </th>
            <th scope="col" className={`${TABLE_STYLES.compact.th} text-right`}>
              {C.receita}
            </th>
          </tr>
        </thead>
        <tbody>
          {imoveis.map((i) => (
            <tr key={i.ordem} className={TABLE_STYLES.row} data-imovel={i.ordem}>
              <th
                scope="row"
                className={`${TABLE_STYLES.compact.td} sticky left-0 z-[1] min-w-[150px] text-left font-semibold whitespace-normal text-gray-800 dark:text-white/90 ${FUNDO_STICKY}`}
              >
                {i.nome ?? SEM}
              </th>
              <td
                className={`${TABLE_STYLES.compact.td} max-w-[300px] min-w-[200px] whitespace-normal`}
              >
                <span title={i.endereco ?? undefined} className="text-gray-600 dark:text-gray-300">
                  {i.endereco ? truncar(i.endereco, MAX_ENDERECO) : SEM}
                </span>
                <small className="block text-[11px] text-gray-500 dark:text-gray-400">
                  {textoUf(i.uf)}
                </small>
              </td>
              <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                {num(i.areaM2, 'inteiro')}
              </td>
              <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                {num(i.unidades, 'inteiro')}
              </td>
              <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                {num(i.vacanciaPct, 'pct')}
              </td>
              <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                {num(i.receitaPct, 'pct')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cartoes({ imoveis }: { imoveis: ImovelFiiApi[] }) {
  const M = TABLE_MOBILE_STYLES;
  return (
    <ul className={`${M.cardList} m-0 list-none p-0 md:hidden`} data-imoveis-cartoes="">
      {imoveis.map((i) => (
        <li key={i.ordem} className={M.card} data-imovel={i.ordem}>
          <div className={M.cardTitle}>{i.nome ?? SEM}</div>
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            {i.endereco ?? SEM}
            <span className="block text-[11px] text-gray-500 dark:text-gray-400">
              {textoUf(i.uf)}
            </span>
          </div>
          <dl className={`${M.cardDetailGrid} m-0 mt-2`}>
            {(
              [
                [C.area, num(i.areaM2, 'inteiro')],
                [C.unidades, num(i.unidades, 'inteiro')],
                [C.vacancia, num(i.vacanciaPct, 'pct')],
                [C.receita, num(i.receitaPct, 'pct')],
              ] as const
            ).map(([rot, v]) => (
              <div key={rot} className="min-w-0">
                <dt className={M.cardDetailLabel}>{rot}</dt>
                <dd className={`${M.cardDetailValue} m-0`}>{v}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Outros({ l }: { l: ListaImoveisFiiApi }) {
  if (l.outros.length === 0) return null;
  return (
    <details
      className="rounded-xl border border-gray-200 dark:border-gray-800"
      data-imoveis-outros=""
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[13px] font-semibold text-gray-700 dark:text-gray-200">
        {formatarTexto(T.outros, { n: l.outros.length })}
      </summary>
      <ul className="m-0 list-none px-4 pb-3">
        {l.outros.map((o) => (
          <li
            key={o.ordem}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-gray-100 py-2 text-[13px] last:border-b-0 dark:border-gray-800"
          >
            <span className="min-w-0 text-gray-800 dark:text-white/90">
              {o.nome ?? SEM}
              <small className="block text-[11px] text-gray-500 dark:text-gray-400">
                {C.classe}: {o.classe ?? SEM}
              </small>
            </span>
            <span className="text-right text-gray-700 tabular-nums dark:text-gray-200">
              {o.areaM2 === null ? SEM : `${formatarAnalise(o.areaM2, 'inteiro')} m²`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

interface Props {
  ticker: string;
  imoveis: Estado<ListaImoveisFiiApi>;
}

export default function ListaImoveisFii({ ticker, imoveis }: Props) {
  const [todos, setTodos] = useState(false);
  if (imoveis.estado !== 'ok') {
    return (
      <CartaoAnalise id={`imoveis-${ticker}`} titulo={T.titulo}>
        <p className="m-0 text-sm text-gray-600 dark:text-gray-300" data-imoveis-sem-dado="">
          {imoveis.texto}
        </p>
      </CartaoAnalise>
    );
  }
  const l = imoveis.valor;
  const total = l.imoveis.length;
  const mostrados = todos ? l.imoveis : l.imoveis.slice(0, IMOVEIS_INICIAIS);
  return (
    <CartaoAnalise
      id={`imoveis-${ticker}`}
      titulo={T.titulo}
      sub={formatarTexto(T.sub, { n: mostrados.length, total })}
    >
      <div className="flex flex-col gap-3" data-lista-imoveis="">
        <Resumo l={l} />
        <Tabela imoveis={mostrados} ticker={ticker} />
        <Cartoes imoveis={mostrados} />
        {total > IMOVEIS_INICIAIS ? (
          <button
            type="button"
            onClick={() => setTodos((v) => !v)}
            aria-expanded={todos}
            className="inline-flex min-h-11 items-center self-start rounded-lg px-1 text-[13px] font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
            data-ver-todos=""
          >
            {todos ? T.verMenos : formatarTexto(T.verTodos, { n: total })}
          </button>
        ) : null}
        <Outros l={l} />
        <p className="m-0 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {l.somaReceitaForaDaFaixa && l.somaReceitaPct !== null ? (
            <span className="block" data-soma-receita-fora="">
              {formatarTexto(T.somaReceitaFora, {
                valor: formatarAnalise(l.somaReceitaPct, 'pct'),
              })}
            </span>
          ) : null}
          {formatarTexto(T.rodape, { data: dataBr(l.refQuarter) })}
        </p>
      </div>
    </CartaoAnalise>
  );
}
