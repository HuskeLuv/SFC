'use client';

/**
 * Página /analise-ativos/salvos (bloco 1, fatia C). Estado na URL (?lista=&classe=&ordem=&dir=&
 * modo=&janela=&aba=listas|alertas): recarregar, voltar do ativo ou compartilhar o link mantém a
 * lista, a classe, a ordem, o modo e a janela. Valores inválidos caem no padrão.
 *
 * - Segmento "Listas | Alertas" (44px) só com recursos.alertas; a aba Alertas é a <AbaAlertas/>
 *   da fatia D (os avisos de 90 dias).
 * - Rail das listas (ordem de criação) + "Nova lista"; cabeçalho da lista (Alertas da lista,
 *   Renomear, Apagar lista com confirmação); abas Ações · FIIs com contador.
 * - Tabela com as colunas do Quadro + "Adicionado em" + "×" (Desfazer no aviso); cartões no
 *   celular. Resumo | Detalhado e janela 3 | 5 | 10 como no Quadro; A–Z padrão; "Fora do Quadro".
 * - Comparações salvas da classe (ListaComparacoesSalvas, variante página) só com
 *   recursos.comparador.
 * - Estados: carregando (esqueleto), erro ("Tentar de novo"), sem listas, lista vazia, lista sem
 *   ativos da classe (atalho para a outra aba) e modo consultor (as listas são pessoais: nada é
 *   lido; "Ir para o Quadro").
 * A flag (notFound) fica no page.tsx; o gate da área, no layout.
 */
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import PilulasJanela from '@/components/analiseAtivos/comum/PilulasJanela';
import { useNaCarteira } from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { rotuloOrdem, textoDirecao } from '@/components/analiseAtivos/quadro/QuadroAnalise';
import SheetOrdem, { type OpcaoOrdem } from '@/components/analiseAtivos/quadro/SheetOrdem';
import { ordensDaClasse } from '@/components/analiseAtivos/quadro/useEstadoQuadroUrl';
import AbaAlertas from '@/components/analiseAtivos/salvos/AbaAlertas';
import AlertasDaLista from '@/components/analiseAtivos/salvos/AlertasDaLista';
import CabecalhoLista from '@/components/analiseAtivos/salvos/CabecalhoLista';
import ConfirmarApagarLista from '@/components/analiseAtivos/salvos/ConfirmarApagarLista';
import EstadoVazioSalvos, {
  BOTAO_SECUNDARIO_SALVOS,
  ErroSalvos,
  EsqueletoSalvos,
} from '@/components/analiseAtivos/salvos/EstadoVazioSalvos';
import SeletorListas, { IconeSino } from '@/components/analiseAtivos/salvos/SeletorListas';
import TabelaSalvos from '@/components/analiseAtivos/salvos/TabelaSalvos';
import ListaComparacoesSalvas from '@/components/analiseAtivos/salvos/compartilhados/ListaComparacoesSalvas';
import ModalNomeLista from '@/components/analiseAtivos/salvos/compartilhados/ModalNomeLista';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import { BOTAO_NAVY, IconeMais } from '@/components/analiseAtivos/shell/BotaoCriarLista';
import { COLUNAS, DIRECAO_PADRAO, ORDEM_PADRAO } from '@/constants/analiseAtivosVisual';
import { useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import { useAlertas, useLinhasLista, useListas } from '@/hooks/useAnaliseAtivosSalvos';
import { useAuth } from '@/hooks/useAuth';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { ResponsiveTabNav } from '@/components/ui/tabs/ResponsiveTabNav';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, DirecaoOrdem, ModoQuadro, OrdemQuadro } from '@/types/analiseAtivosApi';
import { JANELAS_CRITERIOS, JANELA_PADRAO, type Janela } from '@/types/analiseAtivosCriterios';
import type { ResumoLista } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.pagina;
const TQ = TEXTOS_QUADRO;
const TT = TEXTOS_TELA.quadro;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

// ---------------------------------------------------------------------------
// Estado na URL
// ---------------------------------------------------------------------------

export type AbaSalvos = 'listas' | 'alertas';

export interface EstadoSalvos {
  lista: string | null;
  classe: ClasseQuadro;
  ordem: OrdemQuadro;
  dir: DirecaoOrdem;
  modo: ModoQuadro;
  janela: Janela;
  aba: AbaSalvos;
}

/** id de lista (uuid ou cuid); outro valor é ignorado. */
const RE_ID_LISTA = /^[A-Za-z0-9_-]{1,64}$/;

export function lerEstadoSalvos(params: URLSearchParams): EstadoSalvos {
  const classe: ClasseQuadro = params.get('classe') === 'fii' ? 'fii' : 'acao';
  const ordemBruta = params.get('ordem') as OrdemQuadro | null;
  const ordem =
    ordemBruta && ordensDaClasse(classe).includes(ordemBruta) ? ordemBruta : ORDEM_PADRAO;
  const dirBruta = params.get('dir');
  const dir: DirecaoOrdem =
    dirBruta === 'asc' || dirBruta === 'desc' ? dirBruta : DIRECAO_PADRAO[ordem];
  const modo: ModoQuadro = params.get('modo') === 'detalhado' ? 'detalhado' : 'resumo';
  const j = Number(params.get('janela'));
  const janela = (JANELAS_CRITERIOS as readonly number[]).includes(j)
    ? (j as Janela)
    : JANELA_PADRAO;
  const listaBruta = params.get('lista')?.trim() ?? '';
  const lista = RE_ID_LISTA.test(listaBruta) ? listaBruta : null;
  const aba: AbaSalvos = params.get('aba') === 'alertas' ? 'alertas' : 'listas';
  return { lista, classe, ordem, dir, modo, janela, aba };
}

export function escreverEstadoSalvos(e: EstadoSalvos): URLSearchParams {
  const qs = new URLSearchParams();
  if (e.lista) qs.set('lista', e.lista);
  if (e.classe !== 'acao') qs.set('classe', e.classe);
  if (e.ordem !== ORDEM_PADRAO || e.dir !== DIRECAO_PADRAO[e.ordem]) {
    qs.set('ordem', e.ordem);
    qs.set('dir', e.dir);
  }
  if (e.modo !== 'resumo') qs.set('modo', e.modo);
  if (e.janela !== JANELA_PADRAO) qs.set('janela', String(e.janela));
  if (e.aba !== 'listas') qs.set('aba', e.aba);
  return qs;
}

function useEstadoSalvosUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const chave = params?.toString() ?? '';
  const estado = useMemo(() => lerEstadoSalvos(new URLSearchParams(chave)), [chave]);
  const aplicar = useCallback(
    (parcial: Partial<EstadoSalvos>) => {
      const qs = escreverEstadoSalvos({ ...estado, ...parcial }).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, estado],
  );
  return { estado, aplicar };
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

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

/** Pílula de 32 px visíveis num alvo de 44 px (como no Quadro). */
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
      aria-label={TT.modosRotulo}
      data-salvos-modos=""
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
          {TT.modos[m]}
        </button>
      ))}
    </div>
  );
}

function IconeLista() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "Listas | Alertas (n)" — só com recursos.alertas. */
function SegmentoSalvos({
  aba,
  naoLidos,
  onAba,
}: {
  aba: AbaSalvos;
  naoLidos: number;
  onAba: (a: AbaSalvos) => void;
}) {
  const t = T.segmento;
  return (
    <div
      role="group"
      aria-label={t.rotulo}
      data-salvos-segmento=""
      className="inline-flex w-fit gap-0.5 rounded-[10px] bg-gray-100 p-[3px] dark:bg-white/[0.06]"
    >
      {(['listas', 'alertas'] as const).map((a) => {
        const atual = aba === a;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={atual}
            onClick={() => onAba(a)}
            data-salvos-aba={a}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-[13.5px] font-semibold ${FOCO} ${
              atual
                ? 'bg-[#314666] text-white dark:bg-[#396CAA]'
                : 'text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
            }`}
          >
            {a === 'listas' ? <IconeLista /> : <IconeSino className="shrink-0" />}
            {t[a]}
            {a === 'alertas' && naoLidos > 0 ? (
              <span
                aria-label={formatarTexto(t.novosAria, { n: naoLidos })}
                className={`inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-[5px] text-[11px] font-bold ${
                  atual ? 'bg-white text-[#314666]' : 'bg-[#396CAA] text-white'
                }`}
              >
                {naoLidos}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function PaginaSalvos() {
  return (
    <Suspense fallback={<EsqueletoSalvos />}>
      <Conteudo />
    </Suspense>
  );
}

type Modal =
  | { tipo: 'criar' }
  | { tipo: 'renomear'; lista: ResumoLista }
  | { tipo: 'apagar'; lista: ResumoLista }
  | { tipo: 'alertas'; lista: ResumoLista }
  | null;

function Conteudo() {
  const { estado, aplicar } = useEstadoSalvosUrl();
  const celular = useIsBelowLg();
  const config = useAnaliseAtivosConfig();
  const recursos = config.data?.recursos;
  const alertasLigados = recursos?.alertas === true;
  const comparadorLigado = recursos?.comparador === true;
  const { actingClient } = useAuth();
  const consultorLocal = !!actingClient;

  const listas = useListas({ enabled: !consultorLocal });
  const consultor = consultorLocal || listas.data?.motivoSemSalvar === 'consultor';
  const todas = useMemo(() => listas.data?.listas ?? [], [listas.data]);
  const lista = todas.find((l) => l.id === estado.lista) ?? todas[0] ?? null;
  const aba: AbaSalvos = alertasLigados ? estado.aba : 'listas';

  const linhas = useLinhasLista(
    lista?.id ?? null,
    {
      classe: estado.classe,
      janela: estado.janela,
      ordem: estado.ordem,
      dir: estado.dir,
      modo: estado.modo,
    },
    { enabled: !consultor && aba === 'listas' },
  );
  const avisos = useAlertas(undefined, { enabled: alertasLigados && !consultor });

  const dados = linhas.data;
  const daVez = !!dados && !!lista && dados.lista.id === lista.id && dados.classe === estado.classe;
  const itens = daVez ? dados.linhas : [];
  const na = useNaCarteira(estado.classe, itens.length > 0);

  const [modal, setModal] = useState<Modal>(null);
  const [sheetOrdem, setSheetOrdem] = useState(false);
  const fechar = () => setModal(null);

  // --- consultor: as listas são pessoais (nada é lido) ---------------------------------------
  if (consultor) {
    return (
      <section
        aria-label={T.titulo}
        data-salvos-pagina="consultor"
        className="lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-white lg:p-5 dark:lg:border-gray-800 dark:lg:bg-white/[0.03]"
      >
        <EstadoVazioSalvos
          estado="consultor"
          titulo={TEXTOS_SALVOS.consultor.paginaTitulo}
          texto={TEXTOS_SALVOS.consultor.paginaTexto}
          acoes={
            <Link href="/analise-ativos" className={BOTAO_SECUNDARIO_SALVOS}>
              {TEXTOS_SALVOS.consultor.irQuadro}
            </Link>
          }
        />
      </section>
    );
  }

  const trocarLista = (id: string) => aplicar({ lista: id });
  const trocarClasse = (classe: ClasseQuadro) => {
    if (classe === estado.classe) return;
    aplicar({ classe, ordem: ORDEM_PADRAO, dir: DIRECAO_PADRAO[ORDEM_PADRAO] });
  };
  const ordenarPor = (ordem: OrdemQuadro) => {
    const dir =
      estado.ordem === ordem ? (estado.dir === 'asc' ? 'desc' : 'asc') : DIRECAO_PADRAO[ordem];
    aplicar({ ordem, dir });
  };
  const voltarAz = () => aplicar({ ordem: ORDEM_PADRAO, dir: DIRECAO_PADRAO[ORDEM_PADRAO] });

  const botaoCriar = (
    <button
      type="button"
      onClick={() => setModal({ tipo: 'criar' })}
      aria-haspopup="dialog"
      className={BOTAO_NAVY}
    >
      <IconeMais />
      {T.vazio.criarLista}
    </button>
  );
  const irQuadro = (
    <Link
      href={estado.classe === 'fii' ? '/analise-ativos?classe=fii' : '/analise-ativos'}
      className={BOTAO_SECUNDARIO_SALVOS}
    >
      {T.vazio.irQuadro}
    </Link>
  );

  // --- corpo da aba Listas --------------------------------------------------------------------
  let corpoListas: ReactNode;
  if (listas.isPending) {
    corpoListas = <EsqueletoSalvos />;
  } else if (listas.isError && todas.length === 0) {
    corpoListas = <ErroSalvos onTentar={() => void listas.refetch()} />;
  } else if (!lista) {
    corpoListas = (
      <EstadoVazioSalvos
        estado="sem-listas"
        titulo={T.vazio.semListasTitulo}
        texto={T.vazio.semListasTexto}
        acoes={
          <>
            {botaoCriar}
            {irQuadro}
          </>
        }
      />
    );
  } else {
    const contagem = daVez ? dados.contagem : lista.contagem;
    const total = contagem.acao + contagem.fii;
    const outra: ClasseQuadro = estado.classe === 'acao' ? 'fii' : 'acao';
    const foraDaClasse = daVez ? dados.foraDoQuadro : [];
    const abas = (['acao', 'fii'] as const).map((c) => ({
      id: c,
      label: `${T.abas[c]} ${contagem[c]}`,
    }));

    let tabela: ReactNode;
    if (total === 0 && foraDaClasse.length === 0) {
      tabela = (
        <EstadoVazioSalvos
          compacto
          estado="lista-vazia"
          titulo={T.vazio.listaVaziaTitulo}
          texto={formatarTexto(T.vazio.listaVaziaTexto, { lista: lista.nome })}
          acoes={irQuadro}
        />
      );
    } else if (contagem[estado.classe] === 0 && foraDaClasse.length === 0) {
      const n = contagem[outra];
      tabela = (
        <EstadoVazioSalvos
          compacto
          estado="sem-classe"
          titulo={formatarTexto(
            estado.classe === 'acao' ? T.vazio.semAcaoTitulo : T.vazio.semFiiTitulo,
            { lista: lista.nome },
          )}
          texto={formatarTexto(n === 1 ? T.vazio.outraClasseUm : T.vazio.outraClasseN, {
            n,
            classe: n === 1 ? T.vazio.classeSingular[outra] : T.vazio.classePlural[outra],
          })}
          acoes={
            <button
              type="button"
              onClick={() => trocarClasse(outra)}
              className={BOTAO_SECUNDARIO_SALVOS}
            >
              {formatarTexto(T.vazio.verOutra, { classe: T.abas[outra] })}
            </button>
          }
        />
      );
    } else if (linhas.isError && !daVez) {
      tabela = <ErroSalvos onTentar={() => void linhas.refetch()} />;
    } else {
      const carregando = !daVez && !linhas.isError;
      const rotulo = rotuloOrdem(estado.classe, estado.ordem);
      const ordemAz = estado.ordem === ORDEM_PADRAO && estado.dir === DIRECAO_PADRAO[ORDEM_PADRAO];
      const janela = (
        <PilulasJanela valor={estado.janela} onTrocar={(janela) => aplicar({ janela })} />
      );
      const modo = <PilulasModo modo={estado.modo} onModo={(m) => aplicar({ modo: m })} />;
      const barra = celular ? (
        <div className="flex flex-col gap-1" data-salvos-barra="">
          {janela}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSheetOrdem(true)}
              aria-haspopup="dialog"
              className={`inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200 ${FOCO}`}
            >
              <span className="truncate">
                {formatarTexto(TT.ordemBotao, { valor: rotulo })}
                {ordemAz ? null : (
                  <>
                    {' '}
                    <span aria-hidden="true">{estado.dir === 'desc' ? '↓' : '↑'}</span>
                    <span className="sr-only">{textoDirecao(estado.dir)}</span>
                  </>
                )}
              </span>
            </button>
            {modo}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-salvos-barra="">
          {janela}
          <span className="flex-1" />
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">{TQ.ordem.rotulo}</span>
            <div role="group" aria-label={TQ.ordem.grupo} className="flex items-center gap-1">
              <Pilula pressionada={ordemAz} onClick={voltarAz}>
                {TQ.ordem.az}
              </Pilula>
              {!ordemAz ? (
                <Pilula
                  pressionada
                  onClick={voltarAz}
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
          {modo}
        </div>
      );
      tabela = (
        <>
          {barra}
          <TabelaSalvos
            lista={lista}
            classe={estado.classe}
            modo={estado.modo}
            ordem={estado.ordem}
            dir={estado.dir}
            janela={estado.janela}
            linhas={itens}
            foraDoQuadro={foraDaClasse}
            onOrdenar={ordenarPor}
            naCarteira={na.info}
            definicoes={daVez ? dados.definicoes : undefined}
            carregando={carregando}
            atualizando={!carregando && linhas.isPlaceholderData}
            celular={celular}
          />
          {celular ? (
            <SheetOrdem
              aberto={sheetOrdem}
              onFechar={() => setSheetOrdem(false)}
              classe={estado.classe}
              opcoes={opcoesOrdem(estado.classe, estado.modo)}
              ordem={estado.ordem}
              dir={estado.dir}
              onAplicar={(ordem, dir) => aplicar({ ordem, dir })}
            />
          ) : null}
        </>
      );
    }

    corpoListas = (
      <>
        {na.fonte}
        <SeletorListas
          listas={todas}
          atual={lista.id}
          onEscolher={trocarLista}
          onNovaLista={() => setModal({ tipo: 'criar' })}
          alertasLigados={alertasLigados}
        />
        <CabecalhoLista
          lista={lista}
          alertasLigados={alertasLigados}
          onAlertas={() => setModal({ tipo: 'alertas', lista })}
          onRenomear={() => setModal({ tipo: 'renomear', lista })}
          onApagar={() => setModal({ tipo: 'apagar', lista })}
        />
        <ResponsiveTabNav
          tabs={abas}
          activeId={estado.classe}
          onChange={(id) => trocarClasse(id as ClasseQuadro)}
          ariaLabel={T.abas.rotulo}
          variant="segmented-sub"
          className="shrink-0 self-start"
        />
        <div data-salvos-classe={estado.classe} className="flex min-w-0 flex-col gap-3">
          {tabela}
        </div>
      </>
    );
  }

  const primeira = todas[0] ? { id: todas[0].id, nome: todas[0].nome } : null;

  return (
    <section
      aria-label={T.titulo}
      data-salvos-pagina={aba}
      className="flex min-w-0 flex-col gap-4 lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-white lg:p-5 dark:lg:border-gray-800 dark:lg:bg-white/[0.03]"
    >
      {alertasLigados ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{T.titulo}</h2>
          <SegmentoSalvos
            aba={aba}
            naoLidos={avisos.data?.naoLidos ?? 0}
            onAba={(a) => aplicar({ aba: a })}
          />
        </div>
      ) : (
        <h2 className="sr-only">{T.titulo}</h2>
      )}

      {aba === 'alertas' ? (
        <AbaAlertas
          classe={estado.classe}
          onTrocarClasse={trocarClasse}
          primeiraLista={primeira}
          onConfigurarAlertas={(id) => {
            const l = todas.find((x) => x.id === id);
            if (l) setModal({ tipo: 'alertas', lista: l });
          }}
          onCriarLista={() => setModal({ tipo: 'criar' })}
        />
      ) : (
        corpoListas
      )}

      {aba === 'listas' && comparadorLigado && !listas.isPending ? (
        <ListaComparacoesSalvas variante="pagina" classe={estado.classe} />
      ) : null}

      <ModalNomeLista
        aberto={modal?.tipo === 'criar' || modal?.tipo === 'renomear'}
        modo={modal?.tipo === 'renomear' ? 'renomear' : 'criar'}
        lista={modal?.tipo === 'renomear' ? modal.lista : undefined}
        onFechar={fechar}
        onConcluir={(l) => {
          const criou = modal?.tipo === 'criar';
          fechar();
          if (criou) aplicar({ lista: l.id, aba: 'listas' });
        }}
        alertasLigados={alertasLigados}
        totalListas={todas.length}
        limites={listas.data?.limites}
      />
      <ConfirmarApagarLista
        aberto={modal?.tipo === 'apagar'}
        lista={modal?.tipo === 'apagar' ? modal.lista : null}
        alertasLigados={alertasLigados}
        onFechar={fechar}
        onApagada={(l) => {
          fechar();
          mostrarToastSalvo({
            tipo: 'info',
            mensagem: formatarTexto(TEXTOS_SALVOS.toast.listaApagada, { lista: l.nome }),
          });
          aplicar({ lista: null });
        }}
      />
      {alertasLigados && modal?.tipo === 'alertas' ? (
        <AlertasDaLista
          aberto
          lista={{
            id: modal.lista.id,
            nome: modal.lista.nome,
            alertas: modal.lista.alertas,
            totalAtivos: modal.lista.contagem.acao + modal.lista.contagem.fii,
          }}
          onFechar={fechar}
        />
      ) : null}
    </section>
  );
}
