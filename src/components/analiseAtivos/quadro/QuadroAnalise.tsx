'use client';

/**
 * Quadro da Análise de Ativos (fatia A). Estado (classe, ordem, filtros, modo) na URL
 * (useEstadoQuadroUrl); dados de useQuadroAnalise (25 em 25, "Mostrar mais"). Computador: abas com
 * contador, chips + Setor/Segmento, Resumo|Detalhado e a tabela. Celular (< lg): segmentado
 * Ações|FIIs, trilho de chips numa linha própria, "Ordem" (sheet) + Resumo|Detalhado embaixo e
 * cartões — tudo em flex-col com gap e sem encolher (nada se sobrepõe).
 *
 * Estados: carregando (cabeçalho real + esqueleto; chips continuam clicáveis), vazio por filtro,
 * "Na minha carteira" sem posição, erro (mantém filtros, Tentar de novo) e cotação atrasada.
 *
 * Bloco D (fatia D), só com config.recursos.comparador: botão "Comparar" (aria-pressed, 44px) ao
 * lado de Resumo|Detalhado no computador e na linha das abas no celular. Ligado, a tabela ganha a
 * coluna de caixas, os cartões a caixa de 44px e aparece a BandejaComparar (useSelecaoComparar:
 * sessionStorage, limite de 4, trocar de aba limpa). Sem o recurso, o Quadro é o de sempre.
 */
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import CartoesQuadro from '@/components/analiseAtivos/quadro/CartoesQuadro';
import FiltrosQuadro from '@/components/analiseAtivos/quadro/FiltrosQuadro';
import RodapeFormula, {
  FaixaFrescorAtrasado,
} from '@/components/analiseAtivos/quadro/RodapeFormula';
import SheetOrdem, { type OpcaoOrdem } from '@/components/analiseAtivos/quadro/SheetOrdem';
import TabelaQuadro, {
  rotuloColuna,
  type ControleComparar,
} from '@/components/analiseAtivos/quadro/TabelaQuadro';
import BandejaComparar, { IconeComparar } from '@/components/analiseAtivos/quadro/BandejaComparar';
import { useSelecaoComparar } from '@/components/analiseAtivos/quadro/useSelecaoComparar';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { useNaCarteira } from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { useEstadoQuadroUrl } from '@/components/analiseAtivos/quadro/useEstadoQuadroUrl';
import { COLUNAS, ORDEM_PADRAO } from '@/constants/analiseAtivosVisual';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useAnaliseAtivosConfig, useQuadroAnalise } from '@/hooks/useAnaliseAtivos';
import { useMeusReportes } from '@/components/analiseAtivos/reporte/useMeusReportes';
import { ROTAS_CURADORIA } from '@/services/analiseAtivos/curadoria/contrato';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  ClasseQuadro,
  DirecaoOrdem,
  ModoQuadro,
  OrdemQuadro,
  QuadroAnaliseProps,
} from '@/types/analiseAtivosApi';

export type { QuadroAnaliseProps };

const T = TEXTOS_TELA.quadro;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

/** Rótulo de uma ordem (cabeçalho da coluna; Índice MF por padrão). */
export function rotuloOrdem(classe: ClasseQuadro, ordem: OrdemQuadro): string {
  for (const modo of ['resumo', 'detalhado'] as const) {
    const c = COLUNAS[classe][modo].find((x) => x.ordem === ordem);
    if (c) return rotuloColuna(c);
  }
  return T.colunas.indiceMf;
}

export function textoDirecao(dir: DirecaoOrdem): string {
  return dir === 'desc' ? T.maiorPrimeiro : T.menorPrimeiro;
}

function opcoesOrdem(classe: ClasseQuadro, modo: ModoQuadro): OpcaoOrdem[] {
  const vistas = new Set<OrdemQuadro>();
  const out: OpcaoOrdem[] = [];
  const add = (ordem: OrdemQuadro) => {
    if (vistas.has(ordem)) return;
    vistas.add(ordem);
    out.push({ ordem, rotulo: rotuloOrdem(classe, ordem) });
  };
  add(ORDEM_PADRAO);
  for (const c of COLUNAS[classe][modo]) if (c.ordem && c.ordem !== 'ticker') add(c.ordem);
  return out;
}

export default function QuadroAnalise(props: QuadroAnaliseProps) {
  return (
    <Suspense fallback={null}>
      <QuadroConteudo {...props} />
    </Suspense>
  );
}

function Pilulas({
  modo,
  onModo,
  celular,
}: {
  modo: ModoQuadro;
  onModo: (m: ModoQuadro) => void;
  celular: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={T.modosRotulo}
      data-quadro-modos=""
      className="flex shrink-0 rounded-xl bg-gray-100 p-[3px] dark:bg-white/[0.06]"
    >
      {(['resumo', 'detalhado'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={modo === m}
          onClick={() => onModo(m)}
          className={`inline-flex items-center justify-center rounded-[9px] px-3 text-sm font-semibold ${FOCO} ${
            celular ? 'min-h-11' : 'h-[34px]'
          } ${
            modo === m
              ? 'bg-white text-gray-900 shadow-sm dark:bg-[#26262A] dark:text-white'
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          {T.modos[m]}
        </button>
      ))}
    </div>
  );
}

function CaixaEstado({
  titulo,
  texto,
  acao,
  alerta = false,
}: {
  titulo: string;
  texto?: string;
  acao?: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div
      role={alerta ? 'alert' : undefined}
      data-quadro-estado={alerta ? 'erro' : 'vazio'}
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700"
    >
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{titulo}</h3>
      {texto ? <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">{texto}</p> : null}
      {acao}
    </div>
  );
}

/**
 * Bloco C (fatia D): link "Meus relatos" no topo do Quadro, só com config.reporteHabilitado, com o
 * selo "Resposta nova" quando há resposta ainda não vista. Flag desligada → nada (Quadro igual).
 */
function LinkMeusRelatos() {
  const config = useAnaliseAtivosConfig();
  const habilitado = config.data?.reporteHabilitado === true;
  const q = useMeusReportes({ enabled: habilitado });
  if (!habilitado) return null;
  const temNova = (q.data?.pages[0]?.itens ?? []).some((r) => r.caso.novo);
  return (
    <Link
      href={ROTAS_CURADORIA.meusRelatos}
      data-link-meus-relatos=""
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 text-sm font-semibold ${COR_LINK.classes} ${FOCO}`}
    >
      {TEXTOS_TELA.relatos.meus.link}
      {temNova ? (
        <span className="rounded-full bg-[#396CAA] px-2 py-0.5 text-[11.5px] font-semibold text-white">
          {TEXTOS_TELA.relatos.meus.respostaNova}
        </span>
      ) : null}
    </Link>
  );
}

/** Bloco D: liga/desliga o modo Comparar (aria-pressed; 44px em todos os tamanhos). */
function BotaoModoComparar({ ativo, onAlternar }: { ativo: boolean; onAlternar: () => void }) {
  const t = TEXTOS_ENTRADAS_COMPARADOR.quadro;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onAlternar}
      data-quadro-comparar=""
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-semibold ${FOCO} ${
        ativo
          ? 'border-[#314666] bg-[#314666] text-white dark:border-[#396CAA] dark:bg-[#396CAA]'
          : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04]'
      }`}
    >
      <IconeComparar />
      {ativo ? t.botaoSair : t.botao}
    </button>
  );
}

const BOTAO_SEC = `inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 lg:min-h-10 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO}`;
const BOTAO_PRI = `inline-flex min-h-12 items-center justify-center rounded-xl bg-[#314666] px-4 text-sm font-semibold text-white lg:min-h-10 ${FOCO}`;

function QuadroConteudo({ className = '' }: QuadroAnaliseProps) {
  const url = useEstadoQuadroUrl();
  const { estado, filtros, temFiltro } = url;
  const celular = useIsBelowLg();
  const [sheetOrdem, setSheetOrdem] = useState(false);
  const config = useAnaliseAtivosConfig();
  const comparadorLigado = config.data?.recursos?.comparador === true;
  const selecao = useSelecaoComparar(estado.classe, comparadorLigado);
  const modoComparar = comparadorLigado && selecao.ativo;
  const controleComparar: ControleComparar | undefined = modoComparar
    ? { marcado: selecao.marcado, desabilitado: selecao.desabilitado, alternar: selecao.alternar }
    : undefined;
  const botaoComparar = comparadorLigado ? (
    <BotaoModoComparar ativo={modoComparar} onAlternar={() => selecao.setAtivo(!selecao.ativo)} />
  ) : null;

  const q = useQuadroAnalise(filtros);
  const paginas = q.data?.pages;
  const primeira = paginas?.[0];
  // placeholderData mostra a página anterior na troca de filtro; na troca de classe, esqueleto
  const daClasse = primeira?.classe === estado.classe;
  const itens = useMemo(
    () => (daClasse && paginas ? paginas.flatMap((p) => p.itens) : []),
    [daClasse, paginas],
  );
  const total = daClasse ? (primeira?.total ?? 0) : 0;
  const carregando = (q.isPending || !daClasse) && !q.isError;
  const na = useNaCarteira(estado.classe, itens.length > 0);

  const rotulo = rotuloOrdem(estado.classe, estado.ordem);
  const ordenacao = `${rotulo}, ${textoDirecao(estado.dir)}`;
  const legenda = formatarTexto(T.legenda, {
    classe: T.classesMinusculas[estado.classe],
    valor: ordenacao,
  });

  const contagens = primeira?.contagens;
  const abas = (['acao', 'fii'] as const).map((c) => ({
    id: c,
    label: contagens ? `${T.abas[c]} ${contagens[c]}` : T.abas[c],
  }));

  const soCarteira = estado.chips.length === 1 && estado.chips[0] === 'naCarteira' && !estado.setor;

  let corpo: React.ReactNode;
  if (q.isError && itens.length === 0) {
    corpo = (
      <CaixaEstado
        alerta
        titulo={T.erroTitulo}
        texto={T.erro}
        acao={
          <button type="button" onClick={() => void q.refetch()} className={BOTAO_PRI}>
            {T.tentarNovamente}
          </button>
        }
      />
    );
  } else if (!carregando && itens.length === 0) {
    corpo = soCarteira ? (
      <CaixaEstado
        titulo={estado.classe === 'acao' ? T.semPosicaoAcao : T.semPosicaoFii}
        texto={T.semPosicaoTexto}
        acao={
          <Link href="/carteira" className={BOTAO_PRI}>
            {TEXTOS_TELA.acoes.registrar}
          </Link>
        }
      />
    ) : (
      <CaixaEstado
        titulo={T.vazioFiltro}
        texto={T.vazioFiltroTexto}
        acao={
          <button type="button" onClick={url.limparFiltros} className={BOTAO_SEC}>
            {T.limparFiltros}
          </button>
        }
      />
    );
  } else if (celular) {
    corpo = (
      <CartoesQuadro
        classe={estado.classe}
        modo={estado.modo}
        linhas={itens}
        naCarteira={na.info}
        carregando={carregando}
        atualizando={!carregando && q.isPlaceholderData}
        comparar={controleComparar}
      />
    );
  } else {
    corpo = (
      <TabelaQuadro
        classe={estado.classe}
        modo={estado.modo}
        ordem={estado.ordem}
        dir={estado.dir}
        linhas={itens}
        onOrdenar={url.ordenarPor}
        naCarteira={na.info}
        carregando={carregando}
        atualizando={!carregando && q.isPlaceholderData}
        legenda={legenda}
        comparar={controleComparar}
      />
    );
  }

  const filtrosEl = (
    <FiltrosQuadro
      classe={estado.classe}
      chips={estado.chips}
      onAlternar={url.alternarFiltro}
      setor={estado.setor}
      setores={daClasse ? (primeira?.facetas.setores ?? []) : []}
      onSetor={url.setSetor}
      temFiltro={temFiltro}
      onLimpar={url.limparFiltros}
      variante={celular ? 'celular' : 'computador'}
    />
  );

  return (
    <section
      aria-label={T.rotulo}
      data-quadro-classe={estado.classe}
      className={`flex min-w-0 flex-col gap-4 lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-white lg:p-5 dark:lg:border-gray-800 dark:lg:bg-white/[0.03] ${className}`}
    >
      {na.fonte}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between [&>*]:shrink-0">
        <ResponsiveTabNav
          tabs={abas}
          activeId={estado.classe}
          onChange={(id) => url.setClasse(id as ClasseQuadro)}
          ariaLabel={T.abasRotulo}
          variant="segmented-sub"
          className="shrink-0"
        />
        {celular && botaoComparar ? (
          <div className="flex items-center justify-between gap-2">
            <LinkMeusRelatos />
            <span className="ml-auto">{botaoComparar}</span>
          </div>
        ) : (
          <LinkMeusRelatos />
        )}
      </div>

      {celular ? (
        <div className="flex flex-col gap-3 [&>*]:shrink-0">
          {filtrosEl}
          <div className="flex items-center justify-between gap-3" data-quadro-ordem-linha="">
            <button
              type="button"
              onClick={() => setSheetOrdem(true)}
              aria-haspopup="dialog"
              className={`inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200 ${FOCO}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="truncate">
                {formatarTexto(T.ordemBotao, { valor: rotulo })}{' '}
                <span aria-hidden="true">{estado.dir === 'desc' ? '↓' : '↑'}</span>
                <span className="sr-only">{textoDirecao(estado.dir)}</span>
              </span>
            </button>
            <Pilulas modo={estado.modo} onModo={url.setModo} celular />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {filtrosEl}
          {botaoComparar ? (
            <div className="flex shrink-0 items-center gap-2">
              {botaoComparar}
              <Pilulas modo={estado.modo} onModo={url.setModo} celular={false} />
            </div>
          ) : (
            <Pilulas modo={estado.modo} onModo={url.setModo} celular={false} />
          )}
        </div>
      )}

      <FaixaFrescorAtrasado frescor={daClasse ? primeira?.frescorCotacao : undefined} />

      {corpo}

      {itens.length > 0 ? (
        <div className="flex flex-col items-center gap-3 lg:flex-row lg:justify-between">
          <p
            aria-live="polite"
            className="text-sm text-gray-500 dark:text-gray-400"
            data-quadro-contagem=""
          >
            {formatarTexto(T.mostrando, { n: itens.length, total })}
            <span className="hidden lg:inline">
              {' · '}
              {formatarTexto(T.ordenadoPor, { valor: ordenacao })}
            </span>
          </p>
          {q.isFetchNextPageError ? (
            <p role="alert" className="text-sm text-[#D92D20] dark:text-[#F97066]">
              {T.erro}
            </p>
          ) : null}
          {q.hasNextPage ? (
            <button
              type="button"
              onClick={() => void q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              aria-busy={q.isFetchingNextPage || undefined}
              className={`${BOTAO_SEC} w-full lg:w-auto`}
            >
              {q.isFetchingNextPage ? T.carregandoMais : T.mostrarMais}
            </button>
          ) : null}
        </div>
      ) : null}

      {modoComparar ? (
        <BandejaComparar
          classe={estado.classe}
          tickers={selecao.tickers}
          onLimpar={selecao.limpar}
        />
      ) : null}

      <RodapeFormula frescor={daClasse ? primeira?.frescorCotacao : undefined} />

      {celular ? (
        <SheetOrdem
          aberto={sheetOrdem}
          onFechar={() => setSheetOrdem(false)}
          classe={estado.classe}
          opcoes={opcoesOrdem(estado.classe, estado.modo)}
          ordem={estado.ordem}
          dir={estado.dir}
          onAplicar={url.setOrdem}
        />
      ) : null}
    </section>
  );
}
