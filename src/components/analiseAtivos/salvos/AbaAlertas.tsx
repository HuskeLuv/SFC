'use client';

/**
 * AbaAlertas (bloco 1, fatia D) — Salvos › Alertas: os avisos das listas dos últimos 90 dias,
 * lidos das próprias Notification (GET /api/analise-ativos/alertas via useAlertas), agrupados por
 * dia no horário de Brasília ("Hoje · 16/10", "Ontem · 15/10"), na classe da aba (Ações · FIIs, com
 * contagem; o resumo "Novidades em N ativos" aparece nas duas). Só é montada com recursos.alertas.
 *
 * Estados: carregando (aria-busy), erro com "Tentar de novo", consultor (os avisos são pessoais),
 * vazio (atalho "Ligar alertas de <lista>" ou "Criar lista"), vazio da classe (com a contagem da
 * outra). "Marcar todos como lidos" (useMarcarAlertasLidos, invalida a aba e o sino); tocar num
 * aviso marca só ele e abre o href do metadata.
 *
 * Ao lado (embaixo no celular), o painel "Como os avisos chegam": sino sempre; notificação no
 * celular conforme o Perfil (linha "Análise de Ativos", PATCH /api/push/preferencias {analise});
 * resumo acima de 5; exemplo da notificação; horário "por volta das 8h".
 */
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FOCO_MODAL } from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { Interruptor } from '@/components/analiseAtivos/salvos/AlertasDaLista';
import {
  formatarDataCurta,
  formatarDataLonga,
  formatarHora,
} from '@/components/analiseAtivos/salvos/compartilhados/formatosSalvos';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import { useAlertas, useMarcarAlertasLidos } from '@/hooks/useAnaliseAtivosSalvos';
import { useCsrf } from '@/hooks/useCsrf';
import { isPushSupported, permissaoAtual } from '@/lib/pwa/pushClient';
import { CLASSES_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_ALERTAS } from '@/services/analiseAtivos/textosAlertas';
import type {
  AbaAlertasProps,
  AvisoApi,
  ClasseItemSalvo,
  TipoAviso,
} from '@/types/analiseAtivosSalvos';

export type { AbaAlertasProps };

const T = TEXTOS_ALERTAS.aba;
const C = TEXTOS_ALERTAS.comoChegam;
const FUSO = 'America/Sao_Paulo';
const PREFERENCIAS_URL = '/api/push/preferencias';
const PERFIL_URL = '/profile';

const BOTAO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ${FOCO_MODAL}`;
const BOTAO_SECUNDARIO = `${BOTAO} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5`;
const BOTAO_PRIMARIO = `${BOTAO} bg-[#396CAA] text-white hover:bg-[#314666] dark:hover:bg-[#6E9DC4] dark:hover:text-gray-900`;
const LINK = `inline-flex min-h-11 items-center text-sm font-medium text-[#396CAA] underline-offset-2 hover:underline dark:text-[#6E9DC4] ${FOCO_MODAL}`;

/** 'AAAA-MM-DD' do instante no horário de Brasília. */
export function diaCivilSp(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: FUSO });
}

/** Rótulo do dia: "Hoje · 16/10", "Ontem · 15/10" ou "14/10/2026". */
export function rotuloDia(iso: string, agora: Date = new Date()): string {
  const dia = diaCivilSp(iso);
  const hoje = diaCivilSp(agora.toISOString());
  const ontem = diaCivilSp(new Date(agora.getTime() - 86_400_000).toISOString());
  if (dia === hoje) return formatarTexto(T.hoje, { data: formatarDataCurta(iso) });
  if (dia === ontem) return formatarTexto(T.ontem, { data: formatarDataCurta(iso) });
  return formatarDataLonga(iso);
}

/** Avisos em grupos por dia (a API já vem do mais novo para o mais velho). */
export function agruparPorDia(
  avisos: readonly AvisoApi[],
  agora: Date = new Date(),
): Array<{ dia: string; rotulo: string; avisos: AvisoApi[] }> {
  const grupos: Array<{ dia: string; rotulo: string; avisos: AvisoApi[] }> = [];
  for (const a of avisos) {
    const dia = diaCivilSp(a.criadoEm);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.avisos.push(a);
    else grupos.push({ dia, rotulo: rotuloDia(a.criadoEm, agora), avisos: [a] });
  }
  return grupos;
}

/** O aviso conta na classe da aba (o resumo, sem classe, conta nas duas). */
const daClasse = (a: AvisoApi, classe: ClasseItemSalvo) => a.classe === null || a.classe === classe;

// ---------------------------------------------------------------------------
// Ícones (decorativos)
// ---------------------------------------------------------------------------

function IconeTipo({ tipo }: { tipo: TipoAviso }) {
  const caminho =
    tipo === 'resultado'
      ? 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5'
      : tipo === 'provento'
        ? 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4'
        : tipo === 'criterios'
          ? 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
          : 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0';
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EDF2F8] text-[#314666] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d={caminho}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Abas Ações · FIIs
// ---------------------------------------------------------------------------

function AbasClasse({
  classe,
  contagem,
  onTrocar,
}: {
  classe: ClasseItemSalvo;
  contagem: Record<ClasseItemSalvo, number>;
  onTrocar?: (c: ClasseItemSalvo) => void;
}) {
  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const outra = CLASSES_SALVOS.find((c) => c !== classe) ?? classe;
    onTrocar?.(outra);
  };
  return (
    <div
      role="tablist"
      aria-label={T.titulo}
      onKeyDown={aoTeclar}
      className="flex gap-1 border-b border-gray-200 dark:border-gray-800"
    >
      {CLASSES_SALVOS.map((c) => {
        const ativa = c === classe;
        return (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={ativa}
            tabIndex={ativa ? 0 : -1}
            onClick={() => onTrocar?.(c)}
            data-aba-alertas-classe={c}
            className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium ${FOCO_MODAL} ${
              ativa
                ? 'border-[#396CAA] text-[#314666] dark:border-[#6E9DC4] dark:text-white/90'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white/90'
            }`}
          >
            {T.classe[c]}
            <span className="rounded-full bg-gray-100 px-1.5 text-xs text-gray-600 tabular-nums dark:bg-white/10 dark:text-gray-300">
              {contagem[c]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel "Como os avisos chegam"
// ---------------------------------------------------------------------------

interface PreferenciasPush {
  habilitado: boolean;
  categorias: Record<string, boolean>;
}

/** O aparelho tem uma assinatura de push ativa (permissão concedida + subscription). */
function useAparelhoComPush(): boolean | null {
  const [tem, setTem] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (!isPushSupported() || permissaoAtual() !== 'granted') return setTem(false);
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (vivo) setTem(!!sub);
      } catch {
        if (vivo) setTem(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);
  return tem;
}

export function PainelComoChegam({ desabilitado = false }: { desabilitado?: boolean }) {
  const { csrfFetch } = useCsrf();
  const qc = useQueryClient();
  const aparelho = useAparelhoComPush();
  const idTitulo = useId();
  const idPush = useId();
  const idPushTexto = useId();
  const prefs = useQuery<PreferenciasPush>({
    queryKey: ['push', 'preferencias'],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const r = await fetch(PREFERENCIAS_URL, { credentials: 'include', signal });
      if (!r.ok) throw new Error('preferencias');
      return (await r.json()) as PreferenciasPush;
    },
  });
  const [salvando, setSalvando] = useState(false);
  const pushPossivel = aparelho === true && prefs.data?.habilitado !== false;
  const ligado = pushPossivel && (prefs.data?.categorias.analise ?? true);

  const alternar = useCallback(async () => {
    if (!prefs.data || salvando) return;
    const novo = !ligado;
    setSalvando(true);
    try {
      const r = await csrfFetch(PREFERENCIAS_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analise: novo }),
      });
      if (!r.ok) throw new Error('patch');
      qc.setQueryData<PreferenciasPush>(['push', 'preferencias'], (a) =>
        a ? { ...a, categorias: { ...a.categorias, analise: novo } } : a,
      );
      mostrarToastSalvo({
        tipo: 'info',
        mensagem: novo ? TEXTOS_ALERTAS.perfil.toastLigado : TEXTOS_ALERTAS.perfil.toastDesligado,
      });
    } catch {
      mostrarToastSalvo({ tipo: 'erro', mensagem: TEXTOS_ALERTAS.daLista.erro });
    } finally {
      setSalvando(false);
    }
  }, [csrfFetch, ligado, prefs.data, qc, salvando]);

  const linha = 'flex items-start gap-3 py-3';
  const fixo =
    'shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300';

  return (
    <aside
      aria-labelledby={idTitulo}
      data-como-chegam=""
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <h3 id={idTitulo} className="text-base font-semibold text-gray-800 dark:text-white/90">
        {C.titulo}
      </h3>
      <p className="mt-1 text-[13px] leading-[1.5] text-gray-500 dark:text-gray-400">{C.intro}</p>
      <div className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
        <div className={linha}>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="text-sm font-medium text-gray-800 dark:text-white/90">{C.sinoTitulo}</b>
            <small className="text-xs text-gray-500 dark:text-gray-400">{C.sinoTexto}</small>
          </span>
          <span className={fixo}>{C.sempre}</span>
        </div>
        <div className={linha}>
          <span className="flex min-w-0 flex-1 flex-col">
            <b id={idPush} className="text-sm font-medium text-gray-800 dark:text-white/90">
              {C.pushTitulo}
            </b>
            <small id={idPushTexto} className="text-xs text-gray-500 dark:text-gray-400">
              {aparelho === false ? C.pushDesligadoAparelho : C.pushTexto}
            </small>
            {aparelho === false ? (
              <Link href={PERFIL_URL} className={LINK}>
                {C.abrirPerfil}
              </Link>
            ) : null}
          </span>
          <Interruptor
            ligado={ligado}
            onAlternar={() => void alternar()}
            rotuloId={idPush}
            descricaoId={idPushTexto}
            desabilitado={desabilitado || !pushPossivel || salvando || !prefs.data}
            dataAttr="push-analise"
          />
        </div>
        <div className={linha}>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="text-sm font-medium text-gray-800 dark:text-white/90">{C.resumoTitulo}</b>
            <small className="text-xs text-gray-500 dark:text-gray-400">{C.resumoTexto}</small>
          </span>
          <span className={fixo}>{C.sempre}</span>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {C.exemploTitulo}
        </span>
        <div
          role="img"
          aria-label={C.exemploAria}
          className="mt-2 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900"
        >
          <div aria-hidden="true" className="flex items-baseline gap-2">
            <b className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gray-800 dark:text-white/90">
              {C.exemploTituloNotificacao}
            </b>
            <time className="text-[11px] text-gray-400">{C.exemploAgora}</time>
          </div>
          <span aria-hidden="true" className="text-[12.5px] text-gray-600 dark:text-gray-300">
            {TEXTOS_ALERTAS.push.corpoGenerico}
          </span>
        </div>
        <small className="mt-2 block text-xs leading-[1.45] text-gray-500 dark:text-gray-400">
          {C.exemploNota}
        </small>
      </div>
      <p className="mt-3 text-xs leading-[1.5] text-gray-500 dark:text-gray-400">{C.horario}</p>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Aba
// ---------------------------------------------------------------------------

function Estado({
  titulo,
  texto,
  children,
  atributo,
}: {
  titulo: string;
  texto?: string;
  children?: ReactNode;
  atributo: string;
}) {
  return (
    <div
      data-aba-alertas-estado={atributo}
      className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center dark:border-gray-800"
    >
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{titulo}</h3>
      {texto ? (
        <p className="max-w-md text-[13.5px] leading-[1.5] text-gray-500 dark:text-gray-400">
          {texto}
        </p>
      ) : null}
      {children ? <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export default function AbaAlertas({
  classe,
  onTrocarClasse,
  primeiraLista,
  onConfigurarAlertas,
  onCriarLista,
  rodape,
}: AbaAlertasProps) {
  // Todas as classes numa leitura só: as contagens das abas e o vazio da classe saem dela.
  const alertas = useAlertas();
  const marcar = useMarcarAlertasLidos();
  const consultor = alertas.data?.motivoSemSalvar === 'consultor';

  const contagem = useMemo(() => {
    const todos = alertas.data?.avisos ?? [];
    return {
      acao: todos.filter((a) => daClasse(a, 'acao')).length,
      fii: todos.filter((a) => daClasse(a, 'fii')).length,
      // EUA (fatia D liga as abas; CLASSES_SALVOS decide quais aparecem)
      stock: todos.filter((a) => daClasse(a, 'stock')).length,
      reit: todos.filter((a) => daClasse(a, 'reit')).length,
    } satisfies Record<ClasseItemSalvo, number>;
  }, [alertas.data]);
  const daAba = useMemo(
    () => (alertas.data?.avisos ?? []).filter((a) => daClasse(a, classe)),
    [alertas.data, classe],
  );
  const grupos = useMemo(() => agruparPorDia(daAba), [daAba]);
  const naoLidos = alertas.data?.naoLidos ?? 0;

  const marcarTodos = async () => {
    try {
      await marcar.mutateAsync({});
      mostrarToastSalvo({ tipo: 'info', mensagem: T.marcados });
    } catch {
      mostrarToastSalvo({ tipo: 'erro', mensagem: T.erroTitulo, tentarDeNovo: marcarTodos });
    }
  };

  let conteudo: ReactNode;
  if (alertas.isPending) {
    conteudo = (
      <div aria-busy="true" data-aba-alertas-estado="carregando" className="flex flex-col gap-2">
        <span className="sr-only">{T.carregando}</span>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="h-16 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5"
          />
        ))}
      </div>
    );
  } else if (alertas.isError) {
    conteudo = (
      <Estado titulo={T.erroTitulo} texto={T.erroTexto} atributo="erro">
        <button type="button" onClick={() => void alertas.refetch()} className={BOTAO_SECUNDARIO}>
          {T.tentar}
        </button>
      </Estado>
    );
  } else if (consultor) {
    conteudo = <Estado titulo={T.consultor} atributo="consultor" />;
  } else if ((alertas.data?.avisos.length ?? 0) === 0) {
    conteudo = (
      <Estado titulo={T.vazioTitulo} texto={T.vazioTexto} atributo="vazio">
        {primeiraLista ? (
          <button
            type="button"
            onClick={() => onConfigurarAlertas?.(primeiraLista.id)}
            className={BOTAO_SECUNDARIO}
          >
            {formatarTexto(T.ligarAlertasDe, { lista: primeiraLista.nome })}
          </button>
        ) : (
          <button type="button" onClick={() => onCriarLista?.()} className={BOTAO_PRIMARIO}>
            {T.criarLista}
          </button>
        )}
      </Estado>
    );
  } else if (daAba.length === 0) {
    const outra = classe === 'acao' ? 'fii' : 'acao';
    const n = contagem[outra];
    conteudo = (
      <Estado
        titulo={formatarTexto(T.vazioClasseTitulo, { classe: T.classe[classe] })}
        texto={formatarTexto(n === 1 ? T.vazioClasseUm : T.vazioClasseN, {
          n,
          classe: T.classe[outra],
        })}
        atributo="vazio-classe"
      >
        <button type="button" onClick={() => onTrocarClasse?.(outra)} className={BOTAO_SECUNDARIO}>
          {T.classe[outra]}
        </button>
      </Estado>
    );
  } else {
    conteudo = (
      <ul className="flex flex-col gap-4" data-aba-alertas-lista="">
        {grupos.map((g) => (
          <li key={g.dia}>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
              {g.rotulo}
            </h3>
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {g.avisos.map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.href}
                    onClick={() => {
                      if (!a.lido) marcar.mutate({ ids: [a.id] });
                    }}
                    data-aviso={a.id}
                    data-aviso-lido={a.lido ? '' : undefined}
                    className={`flex min-h-14 items-start gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-white/5 ${FOCO_MODAL} ${
                      a.lido ? '' : 'bg-[#EDF2F8]/60 dark:bg-[#6E9DC4]/10'
                    }`}
                  >
                    <IconeTipo tipo={a.tipo} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <b
                        className={`text-sm text-gray-800 dark:text-white/90 ${a.lido ? 'font-medium' : 'font-semibold'}`}
                      >
                        {a.titulo}
                      </b>
                      <span className="text-[13px] leading-[1.45] text-gray-600 dark:text-gray-300">
                        {a.mensagem}
                      </span>
                      <small className="text-xs text-gray-400 tabular-nums">
                        {formatarHora(a.criadoEm)}
                      </small>
                    </span>
                    {a.lido ? null : (
                      <>
                        <i
                          aria-hidden="true"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#396CAA] dark:bg-[#6E9DC4]"
                        />
                        <span className="sr-only">{T.novoSr}</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    );
  }

  const mostrarTopo = !alertas.isPending && !alertas.isError && !consultor;

  return (
    <div
      data-aba-alertas={classe}
      className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {mostrarTopo ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {naoLidos > 0 ? (
                <>
                  <b className="font-semibold text-gray-800 dark:text-white/90">
                    {naoLidos === 1 ? T.umNovo : formatarTexto(T.novos, { n: naoLidos })}
                  </b>
                  {' · '}
                </>
              ) : null}
              {T.periodo}
            </span>
            {naoLidos > 0 ? (
              <button
                type="button"
                onClick={() => void marcarTodos()}
                disabled={marcar.isPending}
                className={LINK}
                data-aba-alertas-marcar-todos=""
              >
                {T.marcarTodos}
              </button>
            ) : null}
          </div>
        ) : null}
        {mostrarTopo ? (
          <AbasClasse classe={classe} contagem={contagem} onTrocar={onTrocarClasse} />
        ) : null}
        <div role={mostrarTopo ? 'tabpanel' : undefined}>{conteudo}</div>
      </div>
      <div className="flex flex-col gap-3">
        <PainelComoChegam desabilitado={consultor} />
        {rodape}
      </div>
    </div>
  );
}
