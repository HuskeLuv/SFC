'use client';

/**
 * "Meus relatos" (bloco C, fatia D; protótipo U1–U3, M6) + a linha "Você reportou" da página do
 * ativo (LinhasVoceReportou).
 *
 * - Lista dos relatos do usuário LOGADO (useMeusReportes), mais novos primeiro, 20 por vez
 *   ("Carregar mais"). Status com FORMA + texto: Recebido (círculo vazio), Em análise (relógio),
 *   Corrigido (círculo cheio com ✓), "Conferido, sem alteração" (círculo tracejado; é o rejeitado —
 *   decisão 11).
 * - Fechado: "Resposta da equipe" com a frase neutra da resolução + a resposta do curador;
 *   resposta ainda não vista (aviso não lido no sino) fica destacada ("Resposta nova", borda
 *   #0079F2 — elemento não textual). Aberto: "resposta até <data>".
 * - ?relato=<id> (vindo do 409 "Ver o relato") rola até o relato e o destaca.
 * - Estados: carregando, erro (Tentar de novo), vazio (diz onde fica o caminho para relatar).
 * - Texto do usuário e do curador renderizado como TEXTO (nunca HTML, nunca link automático).
 */
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useMeusReportes } from '@/components/analiseAtivos/reporte/useMeusReportes';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { ROTAS_CURADORIA, type BlocoReporte } from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ItemMeuReporte, StatusParaUsuario } from '@/types/analiseAtivosCuradoria';

const T = TEXTOS_TELA.relatos;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const BOTAO_SEC = `inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 lg:min-h-10 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO}`;
const BOTAO_PRI = `inline-flex min-h-12 items-center justify-center rounded-xl bg-[#314666] px-4 text-sm font-semibold text-white lg:min-h-10 dark:bg-[#396CAA] ${FOCO}`;

function dataBr(iso: string | null): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function rotuloCampo(campo: string): string {
  return (T.campos as Record<string, string>)[campo] ?? campo;
}

// ---------------------------------------------------------------------------
// Status (forma + texto)
// ---------------------------------------------------------------------------

function IconeStatus({ status }: { status: StatusParaUsuario }) {
  const comum = {
    viewBox: '0 0 16 16',
    'aria-hidden': true as const,
    className: 'h-4 w-4 shrink-0',
  };
  switch (status) {
    case 'em_analise':
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 4.8V8l2.2 1.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'corrigido':
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path
            d="M5.2 8.2l1.9 1.9 3.7-3.8"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'conferido_sem_alteracao':
      return (
        <svg {...comum}>
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2.4 2"
          />
          <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

const ESTILO_STATUS: Record<StatusParaUsuario, string> = {
  aberto:
    'border border-gray-300 bg-white text-gray-800 dark:border-gray-700 dark:bg-transparent dark:text-white/90 [&>svg]:text-gray-500 dark:[&>svg]:text-gray-400',
  em_analise:
    'bg-[#396CAA]/10 text-gray-900 dark:bg-[#6E9DC4]/15 dark:text-white/90 [&>svg]:text-[#396CAA] dark:[&>svg]:text-[#6E9DC4]',
  corrigido:
    'bg-[#396CAA]/10 text-gray-900 dark:bg-[#6E9DC4]/15 dark:text-white/90 [&>svg]:text-[#396CAA] dark:[&>svg]:text-[#6E9DC4]',
  conferido_sem_alteracao:
    'border border-dashed border-gray-400 text-gray-700 dark:border-gray-500 dark:text-gray-200 [&>svg]:text-gray-500 dark:[&>svg]:text-gray-400',
};

export function StatusRelato({ status }: { status: StatusParaUsuario }) {
  return (
    <span
      data-relato-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-1.5 text-[12.5px] font-semibold whitespace-nowrap ${ESTILO_STATUS[status]}`}
    >
      <IconeStatus status={status} />
      {T.meus.status[status]}
    </span>
  );
}

function IconeRelogio() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 shrink-0">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4.8V8l2.2 1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Cartão de um relato
// ---------------------------------------------------------------------------

function CartaoRelato({ r, alvo }: { r: ItemMeuReporte; alvo: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (alvo) ref.current?.scrollIntoView({ block: 'center' });
  }, [alvo]);
  const fechado = r.caso.status === 'corrigido' || r.caso.status === 'conferido_sem_alteracao';
  const resolucao = r.caso.resolucao ? T.meus.resolucoes[r.caso.resolucao] : null;
  const meta = [
    formatarTexto(TEXTOS_TELA.relatos.sucesso.protocolo, { protocolo: r.protocolo }),
    formatarTexto(T.meus.enviadoEm, { data: dataBr(r.criadoEm) }),
    r.valorExibido ? `${T.form.valor}: ${r.valorExibido}` : null,
  ].filter(Boolean);
  return (
    <li
      ref={ref}
      id={`relato-${r.id}`}
      data-relato-item={r.id}
      data-relato-alvo={alvo ? '1' : undefined}
      className={`flex flex-col gap-2 rounded-2xl border bg-white px-4 py-3.5 dark:bg-white/[0.03] ${
        alvo ? 'border-[#0079F2] ring-1 ring-[#0079F2]' : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white/90">
            <Link
              href={`/analise-ativos/${encodeURIComponent(r.ticker)}`}
              className={`inline-flex min-h-11 items-center lg:min-h-0 ${COR_LINK.classes} ${FOCO}`}
            >
              {r.ticker}
            </Link>
            {' · '}
            {rotuloCampo(r.campo)}
            {r.periodo ? (
              <span className="font-normal text-gray-500 dark:text-gray-400"> ({r.periodo})</span>
            ) : null}
          </h3>
          <p className="text-[12.5px] text-gray-500 tabular-nums dark:text-gray-400">
            {meta.join(' · ')}
          </p>
        </div>
        <StatusRelato status={r.caso.status} />
      </div>

      {r.mensagem ? (
        <blockquote className="border-l-[3px] border-gray-200 pl-2.5 text-sm break-words whitespace-pre-line text-gray-700 dark:border-gray-700 dark:text-gray-300">
          {r.mensagem}
        </blockquote>
      ) : null}
      {r.valorEsperado || r.fonteEsperada ? (
        <dl className="flex flex-col gap-0.5 text-[13px] text-gray-600 dark:text-gray-400">
          {r.valorEsperado ? (
            <div className="flex flex-wrap gap-x-1.5">
              <dt>{T.form.valorEsperado}:</dt>
              <dd className="break-words text-gray-800 dark:text-gray-200">{r.valorEsperado}</dd>
            </div>
          ) : null}
          {r.fonteEsperada ? (
            <div className="flex flex-wrap gap-x-1.5">
              <dt>{T.form.ondeViu}</dt>
              <dd className="min-w-0 break-words text-gray-800 dark:text-gray-200">
                {r.fonteEsperada}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {fechado ? (
        <div
          data-relato-resposta={r.caso.novo ? 'nova' : 'vista'}
          className={`flex flex-col gap-1 rounded-[10px] bg-gray-50 px-3 py-2.5 text-sm text-gray-800 dark:bg-white/[0.04] dark:text-gray-200 ${
            r.caso.novo ? 'ring-2 ring-[#0079F2] ring-inset' : ''
          }`}
        >
          <p className="text-[12.5px] font-semibold text-gray-500 dark:text-gray-400">
            {T.meus.respostaEquipe} · {dataBr(r.caso.atualizadoEm)}
            {r.caso.novo ? (
              <span className="ml-1.5 rounded-full bg-[#396CAA] px-2 py-0.5 text-[11.5px] font-semibold text-white">
                {T.meus.respostaNova}
              </span>
            ) : null}
          </p>
          {resolucao ? <p>{resolucao}</p> : null}
          {r.caso.respostaPublica ? (
            <p className="break-words whitespace-pre-line">{r.caso.respostaPublica}</p>
          ) : null}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-[13px] text-gray-500 dark:text-gray-400">
          <IconeRelogio />
          {formatarTexto(T.meus.prazo, { data: dataBr(r.caso.slaAte) })}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

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
      data-relatos-estado={alerta ? 'erro' : 'vazio'}
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center dark:border-gray-700"
    >
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{titulo}</h2>
      {texto ? <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">{texto}</p> : null}
      {acao}
    </div>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" data-relatos-estado="carregando" className="flex flex-col gap-3">
      <p className="sr-only" role="status">
        {T.meus.carregando}
      </p>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex animate-pulse flex-col gap-2.5 rounded-2xl border border-gray-200 px-4 py-4 dark:border-gray-800"
        >
          <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-white/10" />
          <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-white/[0.06]" />
          <div className="h-10 w-full rounded bg-gray-100 dark:bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

function ListaMeusRelatos() {
  const q = useMeusReportes();
  const params = useSearchParams();
  const alvo = params?.get('relato') ?? null;
  const itens = useMemo(() => q.data?.pages.flatMap((p) => p.itens) ?? [], [q.data]);

  if (q.isPending) return <Esqueleto />;
  if (q.isError && itens.length === 0) {
    return (
      <CaixaEstado
        alerta
        titulo={T.meus.erro}
        acao={
          <button type="button" onClick={() => void q.refetch()} className={BOTAO_PRI}>
            {T.erros.tentarDeNovo}
          </button>
        }
      />
    );
  }
  if (itens.length === 0) {
    return <CaixaEstado titulo={T.meus.vazio} texto={T.meus.vazioAjuda} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3" data-relatos-lista="">
        {itens.map((r) => (
          <CartaoRelato key={r.id} r={r} alvo={alvo === r.id} />
        ))}
      </ul>
      {q.isFetchNextPageError ? (
        <p role="alert" className="text-sm text-[#D92D20] dark:text-[#F97066]">
          {T.meus.erro}
        </p>
      ) : null}
      {q.hasNextPage ? (
        <button
          type="button"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
          aria-busy={q.isFetchingNextPage || undefined}
          className={`${BOTAO_SEC} w-full self-center lg:w-auto`}
        >
          {T.meus.carregarMais}
        </button>
      ) : null}
    </div>
  );
}

export default function MeusRelatos() {
  return (
    <section aria-labelledby="meus-relatos-titulo" className="flex min-w-0 flex-col gap-4">
      <div>
        <h1
          id="meus-relatos-titulo"
          className="text-xl font-semibold text-gray-800 md:text-2xl dark:text-white/90"
        >
          {T.meus.titulo}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{T.meus.sub}</p>
      </div>
      <Suspense fallback={<Esqueleto />}>
        <ListaMeusRelatos />
      </Suspense>
    </section>
  );
}

// ---------------------------------------------------------------------------
// "Você reportou" (página do ativo)
// ---------------------------------------------------------------------------

/**
 * Linhas "Você reportou <dado> em <data> · <status> · resposta até <data>" no rodapé de um bloco
 * da página do ativo. Só os relatos do usuário logado para o ticker (GET meus-reportes?ticker=, no
 * balde geral; o envio invalida a lista). Sem relato (ou com `habilitado` false) não renderiza.
 */
export function LinhasVoceReportou({
  ticker,
  bloco,
  habilitado,
  className,
}: {
  ticker: string;
  bloco?: BlocoReporte;
  habilitado: boolean;
  className?: string;
}) {
  const q = useMeusReportes({ ticker, enabled: habilitado });
  const itens = (q.data?.pages[0]?.itens ?? []).filter((r) => !bloco || r.bloco === bloco);
  if (!habilitado || itens.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-1.5 ${className ?? ''}`} data-voce-reportou={bloco ?? ''}>
      {itens.slice(0, 3).map((r) => {
        const fechado =
          r.caso.status === 'corrigido' || r.caso.status === 'conferido_sem_alteracao';
        return (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[10px] border border-gray-100 bg-gray-50 px-3 py-0.5 text-[13px] text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300"
          >
            <StatusRelato status={r.caso.status} />
            <span>
              {formatarTexto(T.meus.voceReportou, {
                campo: rotuloCampo(r.campo),
                data: dataBr(r.criadoEm),
              })}
              {!fechado && r.caso.slaAte
                ? ` · ${formatarTexto(T.meus.prazo, { data: dataBr(r.caso.slaAte) })}`
                : null}
            </span>
            <Link
              href={`${ROTAS_CURADORIA.meusRelatos}?relato=${encodeURIComponent(r.id)}`}
              className={`inline-flex min-h-11 items-center font-semibold ${COR_LINK.classes} ${FOCO}`}
            >
              {T.meus.link}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
