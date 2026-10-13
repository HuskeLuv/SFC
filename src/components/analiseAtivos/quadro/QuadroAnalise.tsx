'use client';

/**
 * Quadro da Análise de Ativos — v2.4, Filtros de Fundamentos (fatia B). Estado (classe, janela,
 * critérios, Na minha carteira, setor, ordem, modo) na URL (useEstadoQuadroUrl); dados de
 * useQuadroAnalise (25 em 25, "Mostrar mais"), filtrados e ordenados NO SERVIDOR (rec. 8).
 *
 * - Barra "Filtros de fundamentos" (BarraFiltrosCriterios): janela 3 | 5 | 10, chips dos critérios
 *   da classe combinados com E (FII em pares tijolo/papel; vacância/inadimplência desabilitado,
 *   D3), Na minha carteira, Setor/Segmento, Limpar filtros.
 * - Contador (aria-live): 'X de N' ou 'X de N atendem a k critérios em J anos' (caso 30).
 * - Ordem padrão A–Z; clicar num cabeçalho ordena pela coluna; a pílula da coluna ativa volta para
 *   A–Z. Resumo | Detalhado. Coluna "Critérios" ('n de 6'; financeiras 'n de 3').
 * - Nota da janela de 10 anos em FII; área recolhível "O que cada critério verifica".
 * - Estados: carregando (cabeçalho real + esqueleto), vazio com critérios ("nenhum ativo atende…
 *   limpe os filtros"), Na minha carteira sem posição, erro (mantém filtros) e cotação atrasada.
 * - Rodapé fixo: o literal 'rodape-quadro' (RodapeCriterios, data-texto-legal) + data das cotações.
 * - Celular (< lg): cartões (rec. 7), chips num trilho próprio, "Ordem" (sheet) + Resumo|Detalhado.
 * Nenhuma referência ao indicador antigo nem a nota/semáforo/destaque.
 *
 * Bloco D (fatia D), só com config.recursos.comparador: botão "Comparar" (aria-pressed, 44px) ao
 * lado de Resumo|Detalhado; ligado, a tabela ganha a coluna de caixas, os cartões a caixa de 44px e
 * aparece a BandejaComparar. Sem o recurso, nada disso aparece.
 */
import Link from 'next/link';
import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import BarraFiltrosCriterios from '@/components/analiseAtivos/quadro/BarraFiltrosCriterios';
import CartoesQuadro from '@/components/analiseAtivos/quadro/CartoesQuadro';
import RodapeCriterios, {
  FaixaFrescorAtrasado,
  FrescorCotacoes,
} from '@/components/analiseAtivos/quadro/RodapeCriterios';
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
import {
  COLUNAS,
  COR_LINK,
  CRITERIOS_NAO_SE_APLICAM_FINANCEIRA,
  ORDEM_PADRAO,
} from '@/constants/analiseAtivosVisual';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useAnaliseAtivosConfig, useQuadroAnalise } from '@/hooks/useAnaliseAtivos';
import { useMeusReportes } from '@/components/analiseAtivos/reporte/useMeusReportes';
import { ROTAS_CURADORIA } from '@/services/analiseAtivos/curadoria/contrato';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { definicoesQuadro } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_QUADRO, textoContadorQuadro } from '@/services/analiseAtivos/textosQuadro';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  ClasseQuadro,
  DirecaoOrdem,
  ModoQuadro,
  OrdemQuadro,
  QuadroAnaliseProps,
} from '@/types/analiseAtivosApi';
import type { DefCriterioChip, IdCriterio } from '@/types/analiseAtivosCriterios';

export type { QuadroAnaliseProps };

const T = TEXTOS_TELA.quadro;
const TQ = TEXTOS_QUADRO;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

/** Rótulo de uma ordem ('A–Z' no padrão; senão o cabeçalho da coluna). */
export function rotuloOrdem(classe: ClasseQuadro, ordem: OrdemQuadro): string {
  if (ordem === 'ticker') return TQ.ordem.az;
  for (const modo of ['resumo', 'detalhado'] as const) {
    const c = COLUNAS[classe][modo].find((x) => x.ordem === ordem);
    if (c) return rotuloColuna(c);
  }
  return TQ.ordem.az;
}

export function textoDirecao(dir: DirecaoOrdem): string {
  return dir === 'desc' ? T.maiorPrimeiro : T.menorPrimeiro;
}

/** 'A–Z' ou 'P/L, menor primeiro' (legenda, contagem e botão do celular). */
function textoOrdenacao(classe: ClasseQuadro, ordem: OrdemQuadro, dir: DirecaoOrdem): string {
  if (ordem === 'ticker' && dir === 'asc') return TQ.ordem.az;
  return `${rotuloOrdem(classe, ordem)}, ${textoDirecao(dir)}`;
}

function opcoesOrdem(classe: ClasseQuadro, modo: ModoQuadro): OpcaoOrdem[] {
  const vistas = new Set<OrdemQuadro>();
  const out: OpcaoOrdem[] = [];
  const add = (ordem: OrdemQuadro) => {
    if (vistas.has(ordem)) return;
    vistas.add(ordem);
    out.push({
      ordem,
      rotulo: ordem === 'ticker' ? TQ.ordem.azPadrao : rotuloOrdem(classe, ordem),
    });
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

/** Pílula de 32 px visíveis num alvo de 44 px (min-h-11), também no computador. */
function Pilula({
  pressionada,
  onClick,
  children,
  ariaLabel,
}: {
  pressionada: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressionada}
      aria-label={ariaLabel}
      onClick={onClick}
      className="group inline-flex min-h-11 shrink-0 items-center outline-none"
    >
      <span
        className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap group-focus-visible:ring-[3px] group-focus-visible:ring-[#0079F2] dark:group-focus-visible:ring-[#6E9DC4] ${
          pressionada
            ? 'border-[#396CAA] bg-[#EDF2F8] text-[#314666] dark:border-[#6E9DC4] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-[#2E3440] dark:bg-transparent dark:text-gray-300'
        }`}
      >
        {children}
      </span>
    </button>
  );
}

function PilulasModo({ modo, onModo }: { modo: ModoQuadro; onModo: (m: ModoQuadro) => void }) {
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
          className={`inline-flex min-h-11 items-center justify-center rounded-[9px] px-3 text-sm font-semibold ${FOCO} ${
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
  texto?: ReactNode;
  acao?: ReactNode;
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

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "O que cada critério verifica" (recolhível): definição de cada chip e do par de papel. */
function ExplicacaoCriterios({
  classe,
  definicoes,
}: {
  classe: ClasseQuadro;
  definicoes: DefCriterioChip[];
}) {
  const semFonte = TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel as Partial<
    Record<IdCriterio, string>
  >;
  const itens: Array<{ id: string; rotulo: string; texto: string }> = [];
  for (const d of definicoes) {
    let texto = d.definicao;
    if (!d.habilitado && semFonte[d.id]) texto += `. ${maiuscula(semFonte[d.id]!)}`;
    if (classe === 'acao' && CRITERIOS_NAO_SE_APLICAM_FINANCEIRA.includes(d.id)) {
      texto += `. ${TQ.explicacao.financeira}`;
    }
    itens.push({ id: d.id, rotulo: d.rotulo, texto });
  }
  for (const d of definicoes) {
    const eq = d.equivalente;
    if (!eq) continue;
    const motivo = semFonte[eq.id];
    itens.push({
      id: eq.id,
      rotulo: eq.rotulo,
      texto: motivo ? `${eq.definicao}. ${maiuscula(motivo)}` : eq.definicao,
    });
  }
  return (
    <details
      data-explicacao-criterios=""
      className="group rounded-xl border border-gray-200 px-3 dark:border-[#2E3440]"
    >
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 ${FOCO}`}
      >
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
        {TQ.explicacao.resumo}
      </summary>
      <dl className="grid gap-x-4 gap-y-2 pb-3 text-sm sm:grid-cols-[minmax(10rem,auto)_1fr]">
        {itens.map((i) => (
          <div key={i.id} className="contents">
            <dt className="font-semibold text-gray-800 dark:text-white/90">{i.rotulo}</dt>
            <dd className="text-gray-600 dark:text-gray-300">{i.texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const BOTAO_SEC = `inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO}`;
const BOTAO_PRI = `inline-flex min-h-12 items-center justify-center rounded-xl bg-[#314666] px-4 text-sm font-semibold text-white lg:min-h-11 ${FOCO}`;
const LINK_INLINE = `inline-flex min-h-11 items-center align-middle font-medium underline underline-offset-2 ${COR_LINK.classes} ${FOCO}`;

function QuadroConteudo({ className = '' }: QuadroAnaliseProps) {
  const url = useEstadoQuadroUrl();
  const { estado, filtros } = url;
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
  // chips: os da resposta; antes dela, os do params v1 (mesma regra), para a barra não pular
  const definicoes = useMemo(
    () =>
      daClasse && primeira?.definicoes?.length
        ? primeira.definicoes
        : definicoesQuadro(estado.classe, CRITERIA_PARAMS_V1),
    [daClasse, primeira, estado.classe],
  );

  const rotulo = rotuloOrdem(estado.classe, estado.ordem);
  const ordenacao = textoOrdenacao(estado.classe, estado.ordem, estado.dir);
  const legenda = formatarTexto(T.legenda, {
    classe: T.classesMinusculas[estado.classe],
    valor: ordenacao,
  });

  const contagens = primeira?.contagens;
  const abas = (['acao', 'fii'] as const).map((c) => ({
    id: c,
    label: contagens ? `${T.abas[c]} ${contagens[c]}` : T.abas[c],
  }));

  const totalClasse = daClasse ? (primeira?.totalClasse ?? contagens?.[estado.classe]) : undefined;
  const contador =
    daClasse && totalClasse !== undefined
      ? textoContadorQuadro({
          n: total,
          total: totalClasse,
          criterios: estado.criterios.length,
          janela: estado.janela,
        })
      : null;

  const soCarteira = estado.naCarteira && estado.criterios.length === 0 && !estado.setor;

  let corpo: ReactNode;
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
    if (estado.criterios.length > 0) {
      corpo = (
        <CaixaEstado
          titulo={TQ.vazio.titulo}
          texto={
            <>
              {formatarTexto(TQ.vazio.criteriosAntes, { anos: estado.janela })}
              <button
                type="button"
                onClick={url.limparFiltros}
                className={LINK_INLINE}
                data-limpar-vazio=""
              >
                {TQ.vazio.criteriosLink}
              </button>
              {TQ.vazio.criteriosDepois}
            </>
          }
        />
      );
    } else if (soCarteira) {
      corpo = (
        <CaixaEstado
          titulo={estado.classe === 'acao' ? T.semPosicaoAcao : T.semPosicaoFii}
          texto={T.semPosicaoTexto}
          acao={
            <Link href="/carteira" className={BOTAO_PRI}>
              {TEXTOS_TELA.acoes.registrar}
            </Link>
          }
        />
      );
    } else {
      corpo = (
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
    }
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
        definicoes={definicoes}
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
        definicoes={definicoes}
      />
    );
  }

  const barra = (
    <BarraFiltrosCriterios
      classe={estado.classe}
      janela={estado.janela}
      definicoes={definicoes}
      selecionados={estado.criterios}
      naCarteira={estado.naCarteira}
      setor={estado.setor}
      setores={daClasse ? (primeira?.facetas.setores ?? []) : []}
      onTrocarJanela={url.setJanela}
      onAlternarCriterio={url.alternarCriterio}
      onAlternarNaCarteira={url.alternarNaCarteira}
      onTrocarSetor={url.setSetor}
      onLimpar={url.limparFiltros}
    />
  );

  const contadorEl = (
    <p
      aria-live="polite"
      data-quadro-contador=""
      className="min-h-5 text-sm text-gray-600 tabular-nums dark:text-gray-300"
    >
      {contador}
    </p>
  );

  const ordemAz = estado.ordem === 'ticker' && estado.dir === 'asc';
  const pilulasOrdem = (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-gray-500 dark:text-gray-400">{TQ.ordem.rotulo}</span>
      <div role="group" aria-label={TQ.ordem.grupo} className="flex items-center gap-1">
        <Pilula pressionada={ordemAz} onClick={url.voltarAz}>
          {TQ.ordem.az}
        </Pilula>
        {!ordemAz ? (
          <Pilula
            pressionada
            onClick={url.voltarAz}
            ariaLabel={formatarTexto(TQ.ordem.voltarAz, {
              valor: rotulo,
              direcao: estado.dir === 'asc' ? TQ.ordem.crescente : TQ.ordem.decrescente,
            })}
          >
            {rotulo} <span aria-hidden="true">{estado.dir === 'asc' ? '▲' : '▼'}</span>
          </Pilula>
        ) : null}
      </div>
    </div>
  );

  return (
    <section
      aria-label={T.rotulo}
      data-quadro-classe={estado.classe}
      className={`flex min-w-0 flex-col gap-3 lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-white lg:p-5 dark:lg:border-gray-800 dark:lg:bg-white/[0.03] ${className}`}
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

      {barra}

      {celular ? (
        <div className="flex flex-col gap-1 [&>*]:shrink-0">
          {contadorEl}
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
                {formatarTexto(T.ordemBotao, { valor: rotulo })}
                {ordemAz ? null : (
                  <>
                    {' '}
                    <span aria-hidden="true">{estado.dir === 'desc' ? '↓' : '↑'}</span>
                    <span className="sr-only">{textoDirecao(estado.dir)}</span>
                  </>
                )}
              </span>
            </button>
            <PilulasModo modo={estado.modo} onModo={url.setModo} />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-quadro-ordem-linha="">
          {contadorEl}
          <span className="flex-1" />
          {pilulasOrdem}
          {botaoComparar}
          <PilulasModo modo={estado.modo} onModo={url.setModo} />
        </div>
      )}

      {estado.classe === 'fii' && estado.janela === 10 ? (
        <p
          data-nota-janela-fii=""
          className="rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
        >
          {TEXTOS_CRITERIOS.fonte.janela10Fii}
        </p>
      ) : null}

      <ExplicacaoCriterios classe={estado.classe} definicoes={definicoes} />

      <FaixaFrescorAtrasado frescor={daClasse ? primeira?.frescorCotacao : undefined} />

      {corpo}

      {itens.length > 0 ? (
        <div className="flex flex-col items-center gap-3 lg:flex-row lg:justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400" data-quadro-contagem="">
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

      <div className="flex flex-col gap-2">
        <RodapeCriterios />
        <FrescorCotacoes frescor={daClasse ? primeira?.frescorCotacao : undefined} />
      </div>

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
