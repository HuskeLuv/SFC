'use client';

/**
 * Fundamentos · Raio-X (Bloco D, fatia A). Mesmo card do Essencial (CartaoAnalise com id
 * fundamentos-<ticker>, menu ⋯ e frescor do Bloco C) e TABLE_STYLES compacto.
 *
 * - Anos em colunas, o mais recente à esquerda (peso 600); 1ª coluna FIXA com fundo opaco
 *   (150–170px no celular, 220–260px no computador); colunas de ano com 84px no mínimo.
 * - Faixas de bloco no azul `patrimonio` (TABLE_SECTION_STYLE, th scope=rowgroup); chips por bloco:
 *   no computador com "Todos"; no celular abre no 1º bloco, sem "Todos". Chips com 44px.
 * - Razões (margens, retornos, múltiplos) em itálico com fundo #F2F4F7 / #26262A e '(razão)' para
 *   o leitor de tela; negativos com '−' em #D92D20 / #F97066.
 * - Célula: sem dado = '—' com title; n/a = 'n/a'; em conferência = hachura + '—' (ocultar) ou o
 *   valor (selo) + ChipConferencia (o "Por quê?" da página; sem grupo do Bloco C, montado aqui).
 * - Topo: 'Valores em R$ mi · ano fiscal · fonte: CVM' + Exportar CSV. Fim: "Sobre os dados".
 * - Estados: carregando (esqueleto do card), erro com "Tentar de novo", vazio só com zero linhas.
 */
import { useState, type ReactNode } from 'react';
import CartaoAnalise, {
  FUNDO_STICKY,
  TEXTO_NEGATIVO,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import BotaoExportarCsv from '@/components/analiseAtivos/ativo/analise/BotaoExportarCsv';
import ChipConferencia, { HACHURA } from '@/components/analiseAtivos/comum/ChipConferencia';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { useConferenciaPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import {
  TABLE_HEADER_STYLE,
  TABLE_SECTION_STYLE,
  TABLE_STYLES,
} from '@/components/ui/table/tableStyles';
import { useRaioX } from '@/hooks/useAnaliseAtivosBlocoD';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import {
  anoDaConferencia,
  grupoDoEstado,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  conferenciaTelaPerShare,
  ehEstadoPerShareEmConferencia,
} from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import { CAMPOS_REPORTAVEIS } from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, ConferenciaTela, Estado } from '@/types/analiseAtivosApi';
import type {
  CodigoBlocoRaioX,
  FormatoRaioX,
  LinhaRaioX,
  RaioXResposta,
} from '@/types/analiseAtivosBlocoD';
import type { DadoBlocoReporte } from '@/types/analiseAtivosCuradoria';

const T = TEXTOS_RAIO_X;
const TODOS = 'todos' as const;
type Filtro = CodigoBlocoRaioX | typeof TODOS;

const FOCO =
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
/** Fundo das linhas de razão (opaco também na coluna fixa). */
const FUNDO_RAZAO = 'bg-[#F2F4F7] dark:bg-[#26262A]';
const COLUNA_FIXA =
  'sticky left-0 min-w-[150px] max-w-[170px] whitespace-normal text-left lg:min-w-[220px] lg:max-w-[260px]';

/** Número da tela por formato (a unidade fica no rótulo ou no topo; '%' nas porcentagens). */
export function formatarRaioX(valor: number, formato: FormatoRaioX, codigo?: string): string {
  switch (formato) {
    case 'moeda':
    case 'multiplo':
      return formatarAnalise(valor, 'numero2');
    case 'pct':
      return `${formatarAnalise(valor, codigo === 'taxaAdmAnoPct' ? 'numero2' : 'numero')}%`;
    case 'inteiro':
      return formatarAnalise(valor, 'inteiro');
    default:
      // moedaMi, milhoes, areaMilM2: 1 casa
      return formatarAnalise(valor, 'numero');
  }
}

/** Conferência da página para o chip de uma célula do Raio-X. */
function conferenciaDaCelula(
  conferencias: readonly ConferenciaTela[],
  l: LinhaRaioX,
  ano: number,
  v: Estado<number>,
): ConferenciaTela | null {
  const c = l.conferencias[ano];
  if (!c) return null;
  const campo = l.campoConferencia ?? l.codigo;
  if (ehEstadoPerShareEmConferencia(v)) return conferenciaTelaPerShare(c.motivo, [campo]);
  const grupo = grupoDoEstado(v);
  const daPagina = grupo
    ? conferencias.find(
        (x) => x.grupo === grupo && (grupo !== 'historico' || anoDaConferencia(x) === ano),
      )
    : null;
  return (
    daPagina ?? {
      grupo: grupo ?? l.codigo,
      campos: [campo],
      exibicao: c.exibicao,
      motivo: c.motivo,
      desde: null,
      efeitoIndice: null,
      origem: 'regra',
      caso: null,
    }
  );
}

/** "Qual dado?" do relato: linhas reportáveis no ano mais recente. */
function dadosReporte(dados: RaioXResposta | undefined): DadoBlocoReporte[] | undefined {
  const ano = dados?.anos[0];
  if (!dados || ano === undefined) return undefined;
  const reportaveis = CAMPOS_REPORTAVEIS.fundamentos as readonly string[];
  return dados.blocos
    .flatMap((b) => b.linhas)
    .filter((l) => l.campoConferencia && reportaveis.includes(l.campoConferencia))
    .map((l) => {
      const v = l.valores[ano];
      return {
        campo: l.campoConferencia as DadoBlocoReporte['campo'],
        rotulo: l.rotulo,
        valorExibido: v
          ? v.estado === 'ok'
            ? formatarRaioX(v.valor, l.formato, l.codigo)
            : v.estado === 'ausente'
              ? TEXTOS_TELA.formato.semDado
              : TEXTOS_TELA.formato.naoSeAplica
          : null,
        periodo: String(ano),
      };
    });
}

function unidadeTopo(d: RaioXResposta): string {
  if (d.classe === 'fii') return T.unidade.fii;
  const partes = [
    d.escopo ? T.unidade.escopo[d.escopo] : null,
    d.padraoContabil
      ? ((TEXTOS_TELA.analise.fundamentos.padrao as Record<string, string>)[d.padraoContabil] ??
        d.padraoContabil)
      : null,
  ].filter(Boolean);
  const base = formatarTexto(T.unidade.acao, { valor: partes.join(' · ') });
  return partes.length ? base : base.replace(/ · $/, '');
}

function Celula({
  l,
  ano,
  recente,
  conferencias,
}: {
  l: LinhaRaioX;
  ano: number;
  recente: boolean;
  conferencias: readonly ConferenciaTela[];
}) {
  const v: Estado<number> = l.valores[ano] ?? {
    estado: 'ausente',
    motivo: 'sem_dado_fonte',
    texto: T.celula.semDado,
  };
  const conf = conferenciaDaCelula(conferencias, l, ano, v);
  const negativo = v.estado === 'ok' && v.valor < 0;
  const selos = l.selos[ano] ?? [];
  const asterisco = selos.includes('proventos_em_conferencia');
  const razao = l.tipo === 'razao';
  let conteudo: ReactNode;
  if (v.estado === 'ok') conteudo = formatarRaioX(v.valor, l.formato, l.codigo);
  else if (v.estado === 'nao_se_aplica') {
    conteudo = (
      <span className="not-italic text-gray-500 dark:text-gray-400">{T.celula.naoSeAplica}</span>
    );
  } else {
    conteudo = (
      <span className="text-gray-500 dark:text-gray-400">{TEXTOS_TELA.formato.semDado}</span>
    );
  }
  return (
    <td
      title={v.estado === 'ok' || conf ? undefined : v.texto}
      data-conferencia={conf?.grupo}
      data-ano={ano}
      className={`${TABLE_STYLES.compact.td} min-w-[84px] text-right tabular-nums text-[13px] ${razao ? `italic ${conf ? '' : FUNDO_RAZAO}` : ''} ${recente ? 'font-semibold' : ''} ${negativo ? TEXTO_NEGATIVO : recente ? 'text-gray-800 dark:text-white/90' : ''} ${conf ? HACHURA : ''}`}
    >
      {conf ? (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span>
            {conteudo}
            {asterisco ? <span aria-label={TEXTOS_TELA.selos.emConferencia}>*</span> : null}
          </span>
          <ChipConferencia
            conferencia={conf}
            campo={l.campoConferencia ?? l.codigo}
            rotuloCampo={`${l.rotulo} · ${ano}`}
            valorNaoPublicado={
              v.estado === 'ausente' && typeof v.valorNaoPublicado === 'number'
                ? formatarRaioX(v.valorNaoPublicado, l.formato, l.codigo)
                : null
            }
            bloco="fundamentos"
            className="not-italic"
          />
        </span>
      ) : (
        <>
          {conteudo}
          {asterisco ? <span aria-label={TEXTOS_TELA.selos.emConferencia}>*</span> : null}
        </>
      )}
    </td>
  );
}

export interface TabelaRaioXProps {
  ticker: string;
  classe: ClasseQuadro;
  /** seletor Essencial | Raio-X no cabeçalho do card */
  cabecalhoExtra?: ReactNode;
}

export default function TabelaRaioX({ ticker, classe, cabecalhoExtra }: TabelaRaioXProps) {
  const q = useRaioX(ticker);
  const ctx = useConferenciaPagina();
  const conferencias = ctx?.conferencias ?? [];
  const celular = useIsBelowLg();
  const [filtro, setFiltro] = useState<Filtro>(TODOS);
  const dados = q.data;
  const blocos = dados?.blocos ?? [];
  const vazio = !!dados && (dados.anos.length === 0 || blocos.length === 0);
  // celular: abre no 1º bloco (sem "Todos")
  const ativo: Filtro = celular && filtro === TODOS ? (blocos[0]?.codigo ?? TODOS) : filtro;
  const visiveis = ativo === TODOS ? blocos : blocos.filter((b) => b.codigo === ativo);
  const sub = classe === 'fii' ? T.sub.raioXFii : T.sub.raioXAcao;
  const opcoesChips: Array<{ codigo: Filtro; rotulo: string }> = [
    ...(celular ? [] : [{ codigo: TODOS as Filtro, rotulo: T.blocos.todos }]),
    ...blocos.map((b) => ({ codigo: b.codigo as Filtro, rotulo: b.rotulo })),
  ];

  return (
    <CartaoAnalise
      id={`fundamentos-${ticker}`}
      titulo={T.titulo}
      sub={sub}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={420}
      acao={cabecalhoExtra}
      dadosReporte={dadosReporte(dados)}
    >
      {vazio ? (
        <p className="text-sm text-gray-600 dark:text-gray-300" data-raio-x-vazio="">
          {T.estados.vazio}
        </p>
      ) : dados ? (
        <div className="flex min-w-0 flex-col gap-3" data-raio-x={dados.variante}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="text-[12.5px] text-gray-500 dark:text-gray-400">
              {unidadeTopo(dados)}
            </span>
            <BotaoExportarCsv ticker={ticker} />
          </div>
          <div
            role="group"
            aria-label={T.blocos.rotuloChips}
            data-mf-scroll-x=""
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
          >
            {opcoesChips.map((o) => {
              const sel = o.codigo === ativo;
              return (
                <button
                  key={o.codigo}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => setFiltro(o.codigo)}
                  className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[13px] ${FOCO} ${
                    sel
                      ? 'border-mf-seguranca bg-mf-seguranca text-white dark:border-mf-tranquilidade dark:bg-mf-tranquilidade/25 dark:text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  {o.rotulo}
                </button>
              );
            })}
          </div>
          <div
            role="region"
            tabIndex={0}
            aria-label={formatarTexto(T.tabela.rotuloRegiao, { ticker })}
            data-rolagem-card="raio-x"
            data-mf-scroll-x=""
            className={`${TABLE_STYLES.wrapper} max-w-full ${FOCO}`}
          >
            <table className={`${TABLE_STYLES.table} min-w-max`}>
              <caption className="sr-only">
                {formatarTexto(T.tabela.caption, {
                  ticker,
                  anos: `${dados.anos[0]}–${dados.anos[dados.anos.length - 1]}`,
                })}
              </caption>
              <thead>
                <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                  <th
                    scope="col"
                    className={`${TABLE_STYLES.compact.th} ${COLUNA_FIXA} z-10`}
                    style={TABLE_HEADER_STYLE}
                  >
                    {T.tabela.colunaIndicador}
                  </th>
                  {dados.anos.map((a) => (
                    <th
                      key={a}
                      scope="col"
                      className={`${TABLE_STYLES.compact.th} min-w-[84px] text-right`}
                    >
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              {visiveis.map((b) => (
                <tbody key={b.codigo} data-bloco={b.codigo}>
                  <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
                    <th
                      scope="rowgroup"
                      colSpan={dados.anos.length + 1}
                      className="px-3 py-2 text-left text-[13px] font-semibold"
                      style={TABLE_SECTION_STYLE}
                    >
                      <span className="sticky left-3">{b.rotulo}</span>
                    </th>
                  </tr>
                  {b.linhas.map((l) => {
                    const razao = l.tipo === 'razao';
                    return (
                      <tr key={l.codigo} className={TABLE_STYLES.row} data-linha={l.codigo}>
                        <th
                          scope="row"
                          className={`${TABLE_STYLES.compact.td} ${COLUNA_FIXA} z-[1] text-[13px] font-medium leading-snug text-gray-800 dark:text-white/90 ${razao ? `italic ${FUNDO_RAZAO}` : FUNDO_STICKY}`}
                        >
                          {l.rotulo}
                          {razao ? <span className="sr-only"> {T.celula.razao}</span> : null}
                          {l.sub ? (
                            <small className="block text-[11.5px] font-normal not-italic text-gray-500 dark:text-gray-400">
                              {l.sub}
                            </small>
                          ) : null}
                        </th>
                        {dados.anos.map((a, i) => (
                          <Celula
                            key={a}
                            l={l}
                            ano={a}
                            recente={i === 0}
                            conferencias={conferencias}
                          />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-[12.5px] font-semibold text-gray-700 dark:text-gray-200">
              {T.sobreOsDados.titulo}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px] text-gray-500 dark:text-gray-400">
              {dados.observacoes.map((o) => (
                <li key={o} className="max-w-[110ch]">
                  {o}
                </li>
              ))}
              <li className="max-w-[110ch]">{T.legenda}</li>
            </ul>
          </div>
        </div>
      ) : null}
    </CartaoAnalise>
  );
}
