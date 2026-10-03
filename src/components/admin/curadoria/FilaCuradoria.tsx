'use client';

/**
 * Fila do curador /admin/curadoria (bloco C, fatia C; protótipo K1–K10, M7).
 *
 * Computador (lg+): contadores que filtram, abas/filtros, tabela TABLE_STYLES (Caso, Origem,
 * Efeito, Status com responsável, Prazo — o cabeçalho da ordem em #396CAA com "ordem crescente"
 * oculto) e o detalhe ao lado. Celular: cartões; o caso abre em página própria
 * (/admin/curadoria/[id], voltar do navegador). Estados: carregando (esqueleto), vazia, erro,
 * salvo (aviso role=status).
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TABLE_HEADER_STYLE,
  TABLE_MOBILE_STYLES,
  TABLE_STYLES,
} from '@/components/ui/table/tableStyles';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { ROTAS_CURADORIA } from '@/services/analiseAtivos/curadoria/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import {
  ErroAcessoNegado,
  useFilaCuradoria,
  type CasosListaFiltro,
} from '@/hooks/useCuradoriaAnalise';
import type { CasoListaItem } from '@/types/analiseAtivosCuradoria';
import ContadoresFila from './ContadoresFila';
import FiltrosFila from './FiltrosFila';
import DetalheCaso from './DetalheCaso';
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_BOTAO_SECUNDARIO,
  AvisoSalvo,
  IconeInfo,
  MarcaEfeito,
  MarcaOrigem,
  MarcaPrazo,
  MarcaStatus,
  T_CUR,
  TEXTOS_FILA,
  rotuloCampo,
  textoRelatos,
} from './marcasCaso';

const LG = '(min-width: 1024px)';

function ehComputador(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(LG).matches === true;
}

function CelulaCaso({
  caso,
  selecionado,
  onSelecionar,
}: {
  caso: CasoListaItem;
  selecionado: boolean;
  onSelecionar: (id: string) => void;
}) {
  return (
    <Link
      href={ROTAS_CURADORIA.caso(caso.id)}
      aria-current={selecionado ? 'true' : undefined}
      onClick={(e) => {
        if (ehComputador()) {
          e.preventDefault();
          onSelecionar(caso.id);
        }
      }}
      className="flex min-h-11 flex-col justify-center gap-0.5 py-1"
      aria-label={formatarTexto(TEXTOS_FILA.abrirCaso, {
        valor: `${caso.symbol} · ${rotuloCampo(caso.campo)}`,
      })}
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-gray-900 dark:text-white/90">{caso.symbol}</span>
        <span className="text-xs text-gray-600 dark:text-gray-300">
          {textoRelatos(caso.nReportes)}
        </span>
      </span>
      <span className="text-[12.5px] font-medium text-gray-700 dark:text-gray-200">
        {rotuloCampo(caso.campo)}
        {caso.periodo ? ` · ${caso.periodo}` : ''}
      </span>
      {caso.regraCodigo &&
        !caso.regraAtiva &&
        (caso.status === 'aberto' || caso.status === 'em_analise') && (
          <span
            className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300"
            data-regra-parou
          >
            <IconeInfo />
            {T_CUR.regraParou}
          </span>
        )}
    </Link>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" className={`${TABLE_STYLES.wrapper} p-3`}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 py-2.5">
          {Array.from({ length: 4 }, (__, j) => (
            <div key={j} className="h-4 animate-pulse rounded bg-gray-100 dark:bg-white/[0.06]" />
          ))}
        </div>
      ))}
      <p className="sr-only" aria-live="polite">
        {T_CUR.carregando}
      </p>
    </div>
  );
}

function Vazio({ titulo, ajuda }: { titulo: string; ajuda: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-sm font-semibold text-gray-900 dark:text-white/90">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-600 dark:text-gray-300">{ajuda}</p>
    </div>
  );
}

export default function FilaCuradoria() {
  const [filtros, setFiltros] = useState<CasosListaFiltro>({ fila: 'principal' });
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [itens, setItens] = useState<CasoListaItem[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const consulta = useMemo(() => ({ ...filtros, cursor }), [filtros, cursor]);
  const q = useFilaCuradoria(consulta);

  useEffect(() => {
    if (!q.data || q.isPlaceholderData) return;
    setItens((atual) => (cursor ? [...atual, ...q.data.itens] : q.data.itens));
  }, [q.data, q.isPlaceholderData, cursor]);

  // computador: seleciona o primeiro caso quando o selecionado sai da lista
  useEffect(() => {
    if (!ehComputador()) return;
    if (itens.length === 0) return;
    if (!selecionado || !itens.some((i) => i.id === selecionado)) setSelecionado(itens[0].id);
  }, [itens, selecionado]);

  const mudarFiltros = useCallback((f: CasosListaFiltro) => {
    setCursor(undefined);
    setFiltros(f);
  }, []);
  const fecharAviso = useCallback(() => setAviso(null), []);

  const fila = filtros.fila ?? 'principal';
  const fechados = fila === 'fechados';
  const contagens = q.data?.contagens ?? null;
  const carregandoPrimeira = q.isLoading || (q.isPlaceholderData && !cursor);
  const temFiltro = !!(filtros.q || filtros.classe || filtros.origem || filtros.responsavel);

  let lista: React.ReactNode;
  if (carregandoPrimeira) {
    lista = <Esqueleto />;
  } else if (q.error) {
    lista = (
      <div
        role="alert"
        className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <p className="text-sm font-semibold text-gray-900 dark:text-white/90">
          {q.error instanceof ErroAcessoNegado ? TEXTOS_FILA.acessoRestrito : T_CUR.erro}
        </p>
        {!(q.error instanceof ErroAcessoNegado) && (
          <>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{TEXTOS_FILA.erroAjuda}</p>
            <button
              type="button"
              className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}
              onClick={() => q.refetch()}
            >
              {T_CUR.tentarDeNovo}
            </button>
          </>
        )}
      </div>
    );
  } else if (itens.length === 0) {
    lista = (
      <Vazio
        titulo={T_CUR.vazia}
        ajuda={
          fila === 'principal' && !temFiltro ? TEXTOS_FILA.vaziaAjuda : TEXTOS_FILA.vaziaFiltroAjuda
        }
      />
    );
  } else {
    lista = (
      <>
        {/* computador: tabela */}
        <div className={`${TABLE_STYLES.wrapper} max-lg:hidden`}>
          <table className={TABLE_STYLES.table}>
            <thead>
              <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                <th scope="col" className={`${TABLE_STYLES.th} text-left`}>
                  {T_CUR.colunas.caso}
                </th>
                <th scope="col" className={`${TABLE_STYLES.th} text-left`}>
                  {T_CUR.colunas.origem}
                </th>
                <th scope="col" className={`${TABLE_STYLES.th} text-left`}>
                  {T_CUR.colunas.efeito}
                </th>
                <th scope="col" className={`${TABLE_STYLES.th} text-left`}>
                  {T_CUR.colunas.status}
                </th>
                <th
                  scope="col"
                  className={`${TABLE_STYLES.th} text-left`}
                  aria-sort={fechados ? undefined : 'ascending'}
                  style={fechados ? undefined : { backgroundColor: MYFINANCE_BRAND.patrimonio }}
                >
                  {T_CUR.colunas.prazo}
                  {!fechados && (
                    <>
                      <span aria-hidden="true"> ▲</span>
                      <span className="sr-only">, {T_CUR.ordemCrescente}</span>
                    </>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c) => {
                const sel = selecionado === c.id;
                return (
                  <tr
                    key={c.id}
                    data-caso={c.id}
                    data-selecionado={sel ? '' : undefined}
                    className={`${TABLE_STYLES.row} ${
                      sel ? 'bg-[#6E9DC4]/[0.14] dark:bg-[#6E9DC4]/[0.12]' : TABLE_STYLES.rowHover
                    }`}
                  >
                    <th scope="row" className="px-4 py-1.5 text-left font-normal">
                      <CelulaCaso caso={c} selecionado={sel} onSelecionar={setSelecionado} />
                    </th>
                    <td className={TABLE_STYLES.td}>
                      <MarcaOrigem origem={c.origem} />
                    </td>
                    <td className={TABLE_STYLES.td}>
                      <MarcaEfeito caso={c} />
                    </td>
                    <td className={TABLE_STYLES.td}>
                      <MarcaStatus status={c.status} />
                      {c.responsavel && (
                        <span className="block text-xs text-gray-600 dark:text-gray-300">
                          {c.responsavel.nome}
                        </span>
                      )}
                    </td>
                    <td
                      className={`${TABLE_STYLES.td} ${fechados ? '' : TABLE_STYLES.highlightTd}`}
                    >
                      <MarcaPrazo caso={c} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* celular: cartões; o caso abre em página própria */}
        <ul className={`${TABLE_MOBILE_STYLES.list} lg:hidden`}>
          {itens.map((c) => (
            <li key={c.id}>
              <Link
                href={ROTAS_CURADORIA.caso(c.id)}
                className={`${TABLE_MOBILE_STYLES.card} ${TABLE_MOBILE_STYLES.cardClickable} flex flex-col gap-2`}
                data-caso={c.id}
              >
                <span className={TABLE_MOBILE_STYLES.cardHeader}>
                  <span className="min-w-0">
                    <span className={`${TABLE_MOBILE_STYLES.cardTitle} block`}>
                      {c.symbol} · {rotuloCampo(c.campo)}
                      {c.periodo ? ` · ${c.periodo}` : ''}
                    </span>
                    <span className={`${TABLE_MOBILE_STYLES.cardSubtitle} block`}>
                      {textoRelatos(c.nReportes)}
                      {c.responsavel ? ` · ${c.responsavel.nome}` : ''}
                    </span>
                  </span>
                  <MarcaStatus status={c.status} />
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <MarcaOrigem origem={c.origem} />
                  <MarcaEfeito caso={c} />
                  <MarcaPrazo caso={c} />
                </span>
                {c.regraCodigo &&
                  !c.regraAtiva &&
                  (c.status === 'aberto' || c.status === 'em_analise') && (
                    <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <IconeInfo />
                      {T_CUR.regraParou}
                    </span>
                  )}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {formatarTexto(fechados ? TEXTOS_FILA.contagemFechados : TEXTOS_FILA.contagem, {
              n: itens.length,
            })}
          </span>
          {q.data?.proximoCursor && (
            <button
              type="button"
              className={CLASSE_BOTAO_SECUNDARIO}
              disabled={q.isFetching}
              onClick={() => setCursor(q.data?.proximoCursor ?? undefined)}
            >
              {TEXTOS_FILA.carregarMais}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="@container flex flex-col gap-4" data-fila={fila}>
      <p className="text-sm text-gray-600 dark:text-gray-300">{T_CUR.sub}</p>
      <ContadoresFila
        contagens={contagens}
        fila={fila}
        onFiltrar={(f) => mudarFiltros({ ...filtros, fila: f })}
      />
      <FiltrosFila filtros={filtros} contagens={contagens} onMudar={mudarFiltros} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">{lista}</div>
        <div className="min-w-0 max-lg:hidden">
          {selecionado && itens.length > 0 && !q.error ? (
            <DetalheCaso key={selecionado} id={selecionado} onSalvo={setAviso} />
          ) : (
            !carregandoPrimeira &&
            !q.error &&
            itens.length > 0 && (
              <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
                {TEXTOS_FILA.selecione}
              </p>
            )
          )}
        </div>
      </div>
      <AvisoSalvo mensagem={aviso} onFechar={fecharAviso} />
    </div>
  );
}
