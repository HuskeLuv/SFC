'use client';

/**
 * Salvar (bloco 1, fatia B) — o botão do cabeçalho do ativo e a lógica que o marcador do Quadro
 * (BotaoSalvarLinha) e a linha "Salvo em…" (LinhaSalvoEm) compartilham (useSalvarAtivo).
 *
 * Regra do clique (acaoDoSalvar, pelo nº de listas do índice):
 * - 0 listas → PUT ['padrao']: o servidor cria "Salvos" com o ativo. Aviso: "WEGE3 salvo em
 *   Salvos" (+ " · você recebe aviso de resultado e data-com" só com recursos.alertas) + Desfazer.
 * - 1 lista → alterna nela (PUT ['padrao'] para salvar, [] para tirar); "WEGE3 removido de
 *   <lista>" + Desfazer (volta às listas de antes).
 * - 2+ → abre "Salvar em…" (SheetSalvarEmListas: popover no computador, BottomSheet no celular).
 * O índice (useIndiceSalvos) é o mesmo no cabeçalho, nas linhas e nos cartões: o estado bate em
 * todo lugar; a troca é otimista e volta em erro.
 *
 * Consultor agindo pelo cliente (listas pessoais, decisão de 16/10): desabilitado com o title
 * "As listas são pessoais…". Sem recursos.salvos, nada aparece (ligado=false).
 * Visual: botão pequeno branco de 44 px (como Comparar/Planejar), marcador vazio ou preenchido
 * #396CAA; salvo = "Salvo ✓" com fundo selecionado (MYFINANCE_TONS.fundoSelecionado).
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import SheetSalvarEmListas from '@/components/analiseAtivos/ativo/acoes/SheetSalvarEmListas';
import ModalNomeLista from '@/components/analiseAtivos/salvos/compartilhados/ModalNomeLista';
import { juntarNomesListas } from '@/components/analiseAtivos/salvos/compartilhados/formatosSalvos';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import { ErroAnalise, useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import { useDefinirSalvo, useIndiceSalvos, useListas } from '@/hooks/useAnaliseAtivosSalvos';
import { useAuth } from '@/hooks/useAuth';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import {
  LIMITES_SALVOS,
  NOME_LISTA_PADRAO,
  SENTINELA_PADRAO,
  acaoDoSalvar,
  type AcaoDoSalvar,
} from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import type { LimitesSalvos, ResumoLista } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.salvar;
const TT = TEXTOS_SALVOS.toast;

const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

/** Mensagem do erro: 409/403 trazem a frase do servidor (textosSalvos.servidor); o resto, a nossa. */
export function mensagemErroSalvos(err: unknown, padrao: string): string {
  if (err instanceof ErroAnalise && (err.status === 409 || err.status === 403) && err.message) {
    return err.message;
  }
  return padrao;
}

export interface ControleSalvar {
  ticker: string;
  classe: ClasseQuadro;
  /** recursos.salvos (sem ele, nada aparece) */
  ligado: boolean;
  /** índice carregado */
  pronto: boolean;
  /** consultor agindo pelo cliente (ou podeSalvar=false): desabilitado */
  consultor: boolean;
  salvo: boolean;
  /** ids das listas com o ativo (otimista) */
  listaIds: string[];
  /** nomes das listas com o ativo, em ordem de criação */
  nomesListas: string[];
  /** listas do ativo com os avisos (só com `detalhes`) */
  listasDetalhe: ResumoLista[];
  totalListas: number;
  acao: AcaoDoSalvar;
  /** recursos.alertas */
  alertasLigados: boolean;
  ocupado: boolean;
  /** clique no Salvar / marcador (a âncora posiciona o "Salvar em…") */
  clicar: (ancora: HTMLElement | null) => void;
  /** abre (ou fecha) o "Salvar em…" direto ("Mudar listas") */
  abrirEscolha: (ancora: HTMLElement | null) => void;
  escolhaAberta: boolean;
  /** "Salvar em…" + "Nova lista com <T>" (monte uma vez, perto do botão) */
  camadas: ReactNode;
}

/**
 * Estado e ações do Salvar de um ativo. `detalhes` liga a leitura das listas (contagem e avisos)
 * já de cara — a linha "Salvo em…" precisa; o marcador do Quadro só lê ao abrir a escolha.
 */
export function useSalvarAtivo({
  ticker,
  classe,
  detalhes = false,
}: {
  ticker: string;
  classe: ClasseQuadro;
  detalhes?: boolean;
}): ControleSalvar {
  const t = ticker.toUpperCase();
  const config = useAnaliseAtivosConfig();
  const ligado = config.data?.recursos?.salvos === true;
  const alertasLigados = ligado && config.data?.recursos?.alertas === true;
  const { actingClient } = useAuth();
  const indice = useIndiceSalvos({ enabled: ligado });
  const definir = useDefinirSalvo();
  const celular = useIsBelowLg();

  const [escolhaAberta, setEscolhaAberta] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const listasQ = useListas({ enabled: ligado && (detalhes || escolhaAberta || modalNova) });

  const fecharEscolha = useCallback(() => setEscolhaAberta(false), []);
  const { fecharEntao } = useMobileHistoryLayer(escolhaAberta, fecharEscolha, celular);

  const dados = indice.data;
  const consultor = !!actingClient || dados?.podeSalvar === false;
  const listaIds = useMemo(() => dados?.porTicker[t] ?? [], [dados, t]);
  const listasIndice = useMemo(() => dados?.listas ?? [], [dados]);
  const nomePorId = useMemo(() => new Map(listasIndice.map((l) => [l.id, l.nome])), [listasIndice]);
  const nomesListas = listasIndice.filter((l) => listaIds.includes(l.id)).map((l) => l.nome);
  const listasDetalhe = (listasQ.data?.listas ?? []).filter((l) => listaIds.includes(l.id));
  const totalListas = listasIndice.length;
  const acao = acaoDoSalvar(totalListas);
  const limites: LimitesSalvos = dados?.limites ?? LIMITES_SALVOS;

  const voltarPara = (ids: string[]) => {
    definir
      .mutateAsync({ ticker: t, listaIds: ids })
      .catch(() => mostrarToastSalvo({ tipo: 'erro', mensagem: TT.erroGenerico }));
  };

  const salvarPadrao = () => {
    const nomeUnica = listasIndice[0]?.nome ?? NOME_LISTA_PADRAO;
    definir
      .mutateAsync({ ticker: t, listaIds: [SENTINELA_PADRAO] })
      .then((r) => {
        const lista =
          r.listaCriada?.nome ??
          (r.listaIds[0] ? nomePorId.get(r.listaIds[0]) : undefined) ??
          nomeUnica;
        mostrarToastSalvo({
          tipo: 'salvo',
          ticker: t,
          lista,
          comAviso: alertasLigados,
          desfazer: () => voltarPara([]),
        });
      })
      .catch((err: unknown) =>
        mostrarToastSalvo({
          tipo: 'erro',
          mensagem: mensagemErroSalvos(err, formatarTexto(TT.erroSalvar, { ticker: t })),
          tentarDeNovo: salvarPadrao,
        }),
      );
  };

  const removerDeTodas = () => {
    const anteriores = [...listaIds];
    const lista = juntarNomesListas(nomesListas) || NOME_LISTA_PADRAO;
    definir
      .mutateAsync({ ticker: t, listaIds: [] })
      .then(() =>
        mostrarToastSalvo({
          tipo: 'removido',
          ticker: t,
          lista,
          desfazer: () => voltarPara(anteriores),
        }),
      )
      .catch((err: unknown) =>
        mostrarToastSalvo({
          tipo: 'erro',
          mensagem: mensagemErroSalvos(err, formatarTexto(TT.erroRemover, { ticker: t })),
        }),
      );
  };

  const abrirEscolha = (el: HTMLElement | null) => {
    if (!ligado || consultor) return;
    setAncora(el);
    setEscolhaAberta((x) => !x);
  };

  const clicar = (el: HTMLElement | null) => {
    if (!ligado || consultor) return;
    if (!dados) {
      void indice.refetch();
      return;
    }
    if (acao === 'escolher') {
      abrirEscolha(el);
      return;
    }
    if (listaIds.length > 0) removerDeTodas();
    else salvarPadrao();
  };

  const alternarLista = (listaId: string, marcar: boolean) => {
    const atuais = new Set(listaIds);
    if (marcar) atuais.add(listaId);
    else atuais.delete(listaId);
    const lista = nomePorId.get(listaId) ?? '';
    definir
      .mutateAsync({ ticker: t, listaIds: [...atuais] })
      .then(() =>
        mostrarToastSalvo(
          marcar
            ? { tipo: 'salvo', ticker: t, lista, comAviso: false }
            : { tipo: 'removido', ticker: t, lista },
        ),
      )
      .catch((err: unknown) =>
        mostrarToastSalvo({
          tipo: 'erro',
          mensagem: mensagemErroSalvos(
            err,
            formatarTexto(marcar ? TT.erroSalvar : TT.erroRemover, { ticker: t }),
          ),
        }),
      );
  };

  const listasEscolha = useMemo(() => {
    const detalhe = new Map((listasQ.data?.listas ?? []).map((l) => [l.id, l]));
    return listasIndice.map((l) => detalhe.get(l.id) ?? l);
  }, [listasIndice, listasQ.data]);
  const totalItens = (listasQ.data?.listas ?? []).reduce(
    (s, l) => s + l.contagem.acao + l.contagem.fii,
    0,
  );

  const camadas =
    ligado && !consultor && (escolhaAberta || modalNova) ? (
      <>
        <SheetSalvarEmListas
          aberto={escolhaAberta}
          onFechar={fecharEscolha}
          ancora={ancora}
          ticker={t}
          celular={celular}
          listas={listasEscolha}
          marcadas={listaIds}
          limites={limites}
          totalItens={totalItens}
          alertasLigados={alertasLigados}
          onAlternar={alternarLista}
          onNovaLista={() => fecharEntao(() => setModalNova(true))}
        />
        {modalNova ? (
          <ModalNomeLista
            aberto
            modo="criar"
            tickerInicial={t}
            alertasLigados={alertasLigados}
            totalListas={totalListas}
            limites={limites}
            onFechar={() => setModalNova(false)}
            onConcluir={() => setModalNova(false)}
          />
        ) : null}
      </>
    ) : null;

  return {
    ticker: t,
    classe,
    ligado,
    pronto: !!dados,
    consultor,
    salvo: listaIds.length > 0,
    listaIds,
    nomesListas,
    listasDetalhe,
    totalListas,
    acao,
    alertasLigados,
    ocupado: definir.isPending,
    clicar,
    abrirEscolha,
    escolhaAberta,
    camadas,
  };
}

/** Marcador (bookmark) de 18 px: vazio ou preenchido. */
export function IconeMarcador({ cheio, className = '' }: { cheio: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-[18px] w-[18px] flex-none ${className}`}
      fill={cheio ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M6 4h12v16l-6-4-6 4z" />
    </svg>
  );
}

const BASE_BOTAO = `inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border px-3 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto lg:min-h-11 ${FOCO}`;
/** Não salvo: o mesmo branco dos botões pequenos do cabeçalho. */
const BOTAO_SALVAR = `${BASE_BOTAO} border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5`;
/** Salvo: fundo selecionado (#EDF2F8) e borda #DCE6F2 (MYFINANCE_TONS); escuro com o patrimônio claro. */
const BOTAO_SALVO = `${BASE_BOTAO} border-[#DCE6F2] bg-[#EDF2F8] text-[#314666] hover:bg-[#DCE6F2] dark:border-[#6E9DC4]/40 dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4] dark:hover:bg-[#6E9DC4]/25`;

export interface BotaoSalvarAtivoProps {
  controle: ControleSalvar;
}

/** "Salvar" / "Salvo ✓" do cabeçalho do ativo (entre Comparar e Planejar na carteira). */
export default function BotaoSalvarAtivo({ controle: c }: BotaoSalvarAtivoProps) {
  const ref = useRef<HTMLButtonElement>(null);
  if (!c.ligado) return null;
  const rotulo = c.consultor
    ? formatarTexto(TEXTOS_SALVOS.consultor.marcadorAria, { ticker: c.ticker })
    : c.salvo
      ? formatarTexto(T.ariaSalvo, { listas: juntarNomesListas(c.nomesListas) })
      : formatarTexto(T.aria, { ticker: c.ticker });
  return (
    <button
      ref={ref}
      type="button"
      className={c.salvo && !c.consultor ? BOTAO_SALVO : BOTAO_SALVAR}
      onClick={() => c.clicar(ref.current)}
      disabled={c.consultor}
      title={c.consultor ? TEXTOS_SALVOS.consultor.titleListas : undefined}
      aria-pressed={c.consultor ? undefined : c.salvo}
      aria-haspopup={c.acao === 'escolher' && !c.consultor ? 'dialog' : undefined}
      aria-expanded={c.acao === 'escolher' && !c.consultor ? c.escolhaAberta : undefined}
      aria-label={rotulo}
      aria-busy={c.ocupado || undefined}
      data-botao-salvar=""
      data-salvo={c.salvo ? '' : undefined}
    >
      <IconeMarcador
        cheio={c.salvo && !c.consultor}
        className={c.salvo && !c.consultor ? 'text-[#396CAA] dark:text-[#6E9DC4]' : ''}
      />
      {c.salvo && !c.consultor ? T.salvo : T.salvar}
    </button>
  );
}
