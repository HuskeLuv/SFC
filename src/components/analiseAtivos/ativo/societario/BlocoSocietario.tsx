'use client';

/**
 * Card "Dados societários e estatuto" da página da ação (A6, item 6; fatia D). A PaginaAtivo só o
 * monta para ação com recursos.societario, depois de Múltiplos históricos + Pares e antes de
 * Tese/Eventos, dentro de uma SecaoPreguicosa. Busca a rota societario sozinha
 * (useSocietarioAtivo).
 *
 * A partir de xl em 2 colunas: acionistas | circulação, tag along e dividendo mínimo. Cada parte
 * traz o exercício do FRE e a data de entrega (DT_RECEB). Acionistas só por nome e % (decisão 5),
 * com as marcas 'controlador' e 'acordo de acionistas' em chip neutro. Dividendo mínimo: texto do
 * FRE 2022 com o aviso "pode ter sido alterado" e o link do FRE vigente na CVM (nova aba, 44 px no
 * celular). Sem cor semântica: números e marcas em cinza do app; o link no azul da paleta.
 * Nomes vindos do banco levam data-nome-ativo (a varredura de linguagem os ignora).
 */
import CartaoAnalise from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { useSocietarioAtivo } from '@/hooks/useSocietarioAtivo';
import { TEXTOS_SOCIETARIO } from '@/services/analiseAtivos/textosSocietario';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { Estado } from '@/types/analiseAtivosApi';
import type {
  AcionistaFreApi,
  AcionistasFreApi,
  BlocoSocietarioProps,
  CirculacaoFreApi,
  DividendoMinimoApi,
  TagAlongEspecieApi,
} from '@/types/analiseAtivosComplementos';

const T = TEXTOS_SOCIETARIO;
const SEM = TEXTOS_TELA.formato.semDado;

const TH = TABLE_STYLES.compact.th;
const TD = `${TABLE_STYLES.compact.td} tabular-nums`;
/** Tabela de acionistas: padding menor no celular para as 4 colunas caberem em 390 px. */
const TH_A = 'px-2 py-2 font-medium whitespace-nowrap sm:px-3';
const TD_A = 'px-2 py-2 text-xs sm:px-3';
const BOX = 'min-w-0 rounded-xl border border-gray-200 p-3 sm:p-4 dark:border-gray-800';
const CHIP =
  'ml-1.5 inline-block whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-1.5 text-[11px] font-semibold leading-5 text-gray-600 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-300';
const RODAPE = 'mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400';
const MUDO = 'text-gray-500 dark:text-gray-400';

// ---------------------------------------------------------------- formatação

export function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** % com 2 casas (participações e circulação). */
function pct2(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return SEM;
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** % sem casas fixas (tag along, dividendo mínimo: '100%', '25%'). */
function pctCurto(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return SEM;
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/** 359032 ⇒ '359 mil'; 2900 ⇒ '2,9 mil'; 812 ⇒ '812'; null ⇒ '—'. */
export function contagemCompacta(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return SEM;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (n >= 1e3) {
    const casas = n >= 1e4 ? 0 : 1;
    return `${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: casas })} mil`;
  }
  return n.toLocaleString('pt-BR');
}

function estadoPct(e: Estado<number>): string {
  if (e.estado === 'ok') return pct2(e.valor);
  return e.estado === 'nao_se_aplica' ? e.texto : SEM;
}

function Ausente({ e }: { e: { texto: string } }) {
  return <p className="text-sm text-gray-600 dark:text-gray-300">{e.texto}</p>;
}

function SubTitulo({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{titulo}</h3>
      <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span>
    </div>
  );
}

// ---------------------------------------------------------------- partes

function nomeAcionista(a: AcionistaFreApi): string {
  if (a.sintetica === 'outros') return T.acionistas.outros;
  if (a.sintetica === 'tesouraria') return T.acionistas.tesouraria;
  return a.nome;
}

function Acionistas({ ticker, e }: { ticker: string; e: Estado<AcionistasFreApi> }) {
  if (e.estado !== 'ok') {
    return (
      <div className="min-w-0">
        <SubTitulo titulo={T.acionistas.titulo} sub={T.sub} />
        <Ausente e={e} />
      </div>
    );
  }
  const v = e.valor;
  const sub = v.dtReceb
    ? formatarTexto(T.acionistas.sub, { ano: v.anoFre, data: dataBr(v.dtReceb) })
    : formatarTexto(T.acionistas.subSemData, { ano: v.anoFre });
  const C = T.acionistas.colunas;
  // companhia sem PN: a coluna sai (o rodapé diz 'não emite PN')
  const semPn = v.acionistas.every((a) => a.pctPn === null);
  return (
    <div className="min-w-0">
      <SubTitulo titulo={T.acionistas.titulo} sub={sub} />
      <div className={TABLE_STYLES.wrapper}>
        <table className={TABLE_STYLES.table}>
          <caption className="sr-only">{formatarTexto(T.acionistas.caption, { ticker })}</caption>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <th scope="col" className={`${TH_A} text-left`}>
                {C.acionista}
              </th>
              <th scope="col" className={`${TH_A} text-right`}>
                {C.on}
              </th>
              {semPn ? null : (
                <th scope="col" className={`${TH_A} text-right`}>
                  {C.pn}
                </th>
              )}
              <th scope="col" className={`${TH_A} text-right`}>
                {C.total}
              </th>
            </tr>
          </thead>
          <tbody>
            {v.acionistas.map((a, i) => (
              <tr key={`${a.sintetica ?? 'd'}-${i}`} className={TABLE_STYLES.row}>
                <th
                  scope="row"
                  className={`${TD_A} min-w-[7rem] text-left font-normal whitespace-normal ${a.sintetica ? MUDO : ''}`}
                >
                  <span data-nome-ativo={a.sintetica ? undefined : ''}>{nomeAcionista(a)}</span>
                  {a.controlador ? <span className={CHIP}>{T.acionistas.controlador}</span> : null}
                  {a.acordoAcionistas ? <span className={CHIP}>{T.acionistas.acordo}</span> : null}
                </th>
                <td className={`${TD_A} tabular-nums text-right whitespace-nowrap`}>
                  {pct2(a.pctOn)}
                </td>
                {semPn ? null : (
                  <td
                    className={`${TD_A} tabular-nums text-right whitespace-nowrap ${a.pctPn === null ? MUDO : ''}`}
                  >
                    {pct2(a.pctPn)}
                  </td>
                )}
                <td className={`${TD_A} tabular-nums text-right whitespace-nowrap`}>
                  {pct2(a.pctTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={RODAPE}>
        {T.acionistas.rodape} {T.acionistas.outrosInclui}
        {semPn ? ` ${T.acionistas.naoEmitePn}` : ''}
      </p>
    </div>
  );
}

function Circulacao({ e }: { e: Estado<CirculacaoFreApi> }) {
  if (e.estado !== 'ok') {
    return (
      <div className={BOX}>
        <SubTitulo titulo={T.circulacao.titulo} sub={T.sub} />
        <Ausente e={e} />
      </div>
    );
  }
  const v = e.valor;
  const celulas: [string, Estado<number>][] = [
    [T.circulacao.on, v.pctOn],
    [T.circulacao.pn, v.pctPn],
    [T.circulacao.total, v.pctTotal],
  ];
  const temContagem =
    v.nAcionistasPf !== null || v.nAcionistasPj !== null || v.nAcionistasInst !== null;
  return (
    <div className={BOX}>
      <SubTitulo
        titulo={T.circulacao.titulo}
        sub={formatarTexto(T.circulacao.sub, { ano: v.anoFre })}
      />
      <dl className="grid grid-cols-3 gap-2">
        {celulas.map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0">
            <dt className="text-xs text-gray-500 dark:text-gray-400">{rotulo}</dt>
            <dd
              className={`text-base font-semibold tabular-nums ${valor.estado === 'ok' ? 'text-gray-800 dark:text-white/90' : 'text-sm font-normal text-gray-500 dark:text-gray-400'}`}
              title={valor.estado === 'ok' ? undefined : valor.texto}
            >
              {estadoPct(valor)}
            </dd>
          </div>
        ))}
      </dl>
      {temContagem ? (
        <p className={RODAPE}>
          {formatarTexto(T.circulacao.acionistas, {
            pf: contagemCompacta(v.nAcionistasPf),
            pj: contagemCompacta(v.nAcionistasPj),
            inst: contagemCompacta(v.nAcionistasInst),
          })}
        </p>
      ) : null}
    </div>
  );
}

function rotuloEspecie(t: TagAlongEspecieApi): string {
  if (t.especie === 'PN' && t.classePn) {
    return formatarTexto(T.tagAlong.pnClasse, { classe: t.classePn });
  }
  return T.tagAlong.especies[t.especie];
}

function TagAlong({ e, segmento }: { e: Estado<TagAlongEspecieApi[]>; segmento: string | null }) {
  const sub = segmento
    ? `${T.tagAlong.sub} · ${formatarTexto(T.tagAlong.segmento, { segmento })}`
    : T.tagAlong.sub;
  if (e.estado !== 'ok') {
    return (
      <div className={BOX}>
        <SubTitulo titulo={T.tagAlong.titulo} sub={sub} />
        <Ausente e={e} />
      </div>
    );
  }
  const C = T.tagAlong.colunas;
  const temUnit = e.valor.some((t) => t.especie === 'UNIT' && t.base !== 'nao_emite');
  return (
    <div className={BOX}>
      <SubTitulo titulo={T.tagAlong.titulo} sub={sub} />
      <div className={TABLE_STYLES.wrapper}>
        <table className={TABLE_STYLES.table}>
          <thead>
            <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <th scope="col" className={`${TH} text-left`}>
                {C.especie}
              </th>
              <th scope="col" className={`${TH} text-right`}>
                {C.tagAlong}
              </th>
              <th scope="col" className={`${TH} text-left`}>
                {C.base}
              </th>
            </tr>
          </thead>
          <tbody>
            {e.valor.map((t) => (
              <tr key={`${t.especie}-${t.classePn}`} className={TABLE_STYLES.row}>
                <th
                  scope="row"
                  className={`${TABLE_STYLES.compact.td} text-left font-normal whitespace-nowrap`}
                >
                  {rotuloEspecie(t)}
                </th>
                <td className={`${TD} text-right whitespace-nowrap ${t.pct === null ? MUDO : ''}`}>
                  {pctCurto(t.pct)}
                </td>
                <td
                  className={`${TABLE_STYLES.compact.td} whitespace-normal ${t.base === 'nao_emite' || t.base === 'conforme_estatuto' ? MUDO : ''}`}
                >
                  {T.tagAlong.bases[t.base]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={RODAPE}>
        {T.tagAlong.rodape}
        {temUnit ? ` ${T.tagAlong.unit}` : ''}
      </p>
    </div>
  );
}

function DividendoMinimo({ e }: { e: Estado<DividendoMinimoApi> }) {
  if (e.estado !== 'ok') {
    return (
      <div className={BOX}>
        <SubTitulo titulo={T.dividendoMinimo.titulo} sub={T.dividendoMinimo.sub} />
        <Ausente e={e} />
      </div>
    );
  }
  const v = e.valor;
  const p = v.pctLucroAjustado;
  return (
    <div className={BOX}>
      <SubTitulo titulo={T.dividendoMinimo.titulo} sub={T.dividendoMinimo.sub} />
      {p.estado === 'ok' ? (
        <p className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-xl font-semibold tabular-nums text-gray-800 dark:text-white/90">
            {pctCurto(p.valor)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {T.dividendoMinimo.sufixo}
          </span>
        </p>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">{p.texto}</p>
      )}
      {v.trecho ? (
        <figure className="mt-2">
          <figcaption className="sr-only">{T.dividendoMinimo.trechoRotulo}</figcaption>
          <blockquote
            data-nome-ativo=""
            className="rounded-r-lg border-l-[3px] border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-700 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300"
          >
            “{v.trecho}”
          </blockquote>
        </figure>
      ) : null}
      <p className={RODAPE}>{T.dividendoMinimo.semInterpretacao}</p>
      {v.linkFreVigente ? (
        <a
          href={v.linkFreVigente}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center text-sm font-medium underline-offset-2 hover:underline lg:min-h-9 ${COR_LINK.classes}`}
        >
          {T.dividendoMinimo.linkFre}
          <span className="sr-only"> {T.dividendoMinimo.linkNovaAba}</span>
        </a>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- card

export default function BlocoSocietario({ ticker }: BlocoSocietarioProps) {
  const q = useSocietarioAtivo(ticker);
  const d = q.data;
  return (
    <CartaoAnalise
      id={`societario-${ticker}`}
      titulo={T.titulo}
      sub={T.sub}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={260}
    >
      {d ? (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
          <Acionistas ticker={ticker} e={d.acionistas} />
          <div className="flex min-w-0 flex-col gap-3">
            <Circulacao e={d.circulacao} />
            <TagAlong e={d.tagAlong} segmento={d.segmentoListagem} />
            <DividendoMinimo e={d.dividendoMinimo} />
          </div>
        </div>
      ) : null}
    </CartaoAnalise>
  );
}
