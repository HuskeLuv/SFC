'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCurso, useMarcarAula, type AulaDetalhe, type ModuloDetalhe } from '@/hooks/useEducacao';
import { accessLevelLabel } from '@/utils/accessLevel';
import { formatDuracaoCurta } from '@/utils/educacaoTrilha';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import VturbPlayer from './VturbPlayer';

const OK_GREEN = '#1d9e6f';
const HERO_GRADIENT = `linear-gradient(118deg, #1c2a44 0%, ${MYFINANCE_BRAND.seguranca} 52%, ${MYFINANCE_BRAND.patrimonio} 100%)`;

const numeroModulo = (idx: number) => String(idx + 1).padStart(2, '0');

const formatDuracao = (seconds: number | null): string | null => {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/* ---------- ícones (stroke, mesmo traço do layout de referência) ---------- */
const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
const PlayIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);
const CheckIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} {...iconProps}>
    <path d="M5 12.5 9.5 17 19 7.5" />
  </svg>
);
const LockIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} {...iconProps}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const ChevronIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} {...iconProps}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} {...iconProps}>
    <path d="M19 12H5m6-6-6 6 6 6" />
  </svg>
);
const ClapperIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 120" className={className} {...iconProps} strokeWidth={6.5}>
    <rect x="18" y="38" width="84" height="62" rx="8" />
    <path d="M18 56h84M30 38l14-18M52 38l14-18M74 38l14-18" />
    <path d="M52 66v22l20-11z" fill="rgba(255,255,255,.25)" />
  </svg>
);

/** Miniatura da capa do módulo (ou placeholder no gradiente da marca). */
function CapaMini({ modulo, index }: { modulo: ModuloDetalhe; index: number }) {
  return modulo.coverUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={modulo.coverUrl} alt="" className="h-12 w-[84px] shrink-0 rounded-lg object-cover" />
  ) : (
    <div
      className="flex h-12 w-[84px] shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
      style={{ background: HERO_GRADIENT }}
    >
      {numeroModulo(index)}
    </div>
  );
}

/** Página de um curso: player VTurb + trilha de módulos/aulas com progresso. */
export default function CursoDetalheRoot({ slug }: { slug: string }) {
  const { curso, loading, error } = useCurso(slug);
  const marcarAula = useMarcarAula(slug);
  const [aulaSelecionadaId, setAulaSelecionadaId] = useState<string | null>(null);
  const [moduloAbertoId, setModuloAbertoId] = useState<string | null>(null);

  const todasAulas = useMemo(() => curso?.modulos.flatMap((m) => m.aulas) ?? [], [curso]);

  // Aula ativa: a selecionada, senão a primeira não-concluída desbloqueada,
  // senão a primeira desbloqueada.
  const aulaAtiva: AulaDetalhe | null = useMemo(() => {
    if (todasAulas.length === 0) return null;
    if (aulaSelecionadaId) {
      return todasAulas.find((a) => a.id === aulaSelecionadaId) ?? null;
    }
    return (
      todasAulas.find((a) => !a.bloqueada && !a.concluida) ??
      todasAulas.find((a) => !a.bloqueada) ??
      todasAulas[0]
    );
  }, [todasAulas, aulaSelecionadaId]);

  // Deep-link da home (cards da trilha / hero "continuar"): ?aula=<id> abre a
  // aula; ?modulo=<id> abre a 1ª aula pendente do módulo (ou a 1ª dele; módulo
  // sem aulas só fica aberto na lista). Lido de window.location uma vez pra
  // não exigir useSearchParams+Suspense.
  const [deepLinkAplicado, setDeepLinkAplicado] = useState(false);
  useEffect(() => {
    if (!curso || deepLinkAplicado) return;
    setDeepLinkAplicado(true);
    const params = new URLSearchParams(window.location.search);
    const aulaParam = params.get('aula');
    const moduloParam = params.get('modulo');
    if (aulaParam && todasAulas.some((a) => a.id === aulaParam)) {
      setAulaSelecionadaId(aulaParam);
      return;
    }
    if (moduloParam) {
      const modulo = curso.modulos.find((m) => m.id === moduloParam);
      if (modulo) setModuloAbertoId(modulo.id);
      const alvo =
        modulo?.aulas.find((a) => !a.bloqueada && !a.concluida) ?? modulo?.aulas[0] ?? null;
      if (alvo) setAulaSelecionadaId(alvo.id);
    }
  }, [curso, todasAulas, deepLinkAplicado]);

  // Módulo em foco: o aberto manualmente (acordeão/deep-link), senão o da
  // aula ativa. A aula só é exibida se pertencer ao módulo em foco — módulo
  // sem aulas mostra o estado "em breve" em vez de uma aula de outro módulo.
  const moduloAtivoIdx = useMemo(() => {
    if (!curso) return -1;
    if (moduloAbertoId) {
      const idx = curso.modulos.findIndex((m) => m.id === moduloAbertoId);
      if (idx >= 0) return idx;
    }
    if (aulaAtiva)
      return curso.modulos.findIndex((m) => m.aulas.some((a) => a.id === aulaAtiva.id));
    return -1;
  }, [curso, aulaAtiva, moduloAbertoId]);
  const moduloAtivo = moduloAtivoIdx >= 0 ? (curso?.modulos[moduloAtivoIdx] ?? null) : null;
  const moduloExpandidoId = moduloAbertoId ?? moduloAtivo?.id ?? null;
  const aulaExibida =
    aulaAtiva && (!moduloAtivo || moduloAtivo.aulas.some((a) => a.id === aulaAtiva.id))
      ? aulaAtiva
      : null;

  const idxAulaAtiva = aulaAtiva ? todasAulas.findIndex((a) => a.id === aulaAtiva.id) : -1;
  const aulaAnterior = idxAulaAtiva > 0 ? todasAulas[idxAulaAtiva - 1] : null;
  const proximaAula =
    idxAulaAtiva >= 0 && idxAulaAtiva < todasAulas.length - 1 ? todasAulas[idxAulaAtiva + 1] : null;

  const selecionarAula = (aula: AulaDetalhe) => {
    setAulaSelecionadaId(aula.id);
    setModuloAbertoId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-500" />
      </div>
    );
  }

  if (error || !curso) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {error ?? 'Curso não encontrado.'}
        </p>
        <Link
          href="/educacao"
          className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Voltar para Educação
        </Link>
      </div>
    );
  }

  const statsModuloAtivo = moduloAtivo
    ? {
        total: moduloAtivo.aulas.length,
        concluidas: moduloAtivo.aulas.filter((a) => a.concluida).length,
        duracao: formatDuracaoCurta(
          moduloAtivo.aulas.reduce((s, a) => s + (a.durationSeconds ?? 0), 0),
        ),
      }
    : null;
  const progressoModulo =
    statsModuloAtivo && statsModuloAtivo.total > 0
      ? Math.round((statsModuloAtivo.concluidas / statsModuloAtivo.total) * 100)
      : 0;
  const posAulaNoModulo =
    moduloAtivo && aulaExibida
      ? moduloAtivo.aulas.findIndex((a) => a.id === aulaExibida.id) + 1
      : 0;

  return (
    <div className="mx-auto max-w-[1240px]">
      {/* ---------- cabeçalho ---------- */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/educacao"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-[.16em] hover:underline"
            style={{ color: MYFINANCE_BRAND.tranquilidade }}
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Educação · {curso.title}
          </Link>
          <div className="mt-1 flex items-center gap-3">
            {moduloAtivo && (
              <span
                className="rounded-full px-3 py-0.5 text-sm font-bold text-white"
                style={{ backgroundColor: MYFINANCE_BRAND.outside }}
              >
                {numeroModulo(moduloAtivoIdx)}
              </span>
            )}
            <h1 className="truncate text-3xl font-bold text-gray-900 dark:text-white">
              {moduloAtivo?.title ?? curso.title}
            </h1>
          </div>
          {(moduloAtivo?.description ?? curso.description) && (
            <p className="mt-1.5 max-w-[60ch] text-base font-light text-gray-500 dark:text-gray-400">
              {moduloAtivo?.description ?? curso.description}
            </p>
          )}
        </div>
        <div className="w-full sm:w-[260px]">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {moduloAtivo
                ? `${statsModuloAtivo?.concluidas ?? 0} de ${statsModuloAtivo?.total ?? 0} aulas do módulo`
                : `${curso.aulasConcluidas} de ${curso.totalAulas} aulas`}
            </span>
            <span className="font-bold" style={{ color: MYFINANCE_BRAND.outside }}>
              {moduloAtivo ? progressoModulo : curso.progresso}%
            </span>
          </div>
          <div className="mt-1.5 h-[6px] rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${moduloAtivo ? progressoModulo : curso.progresso}%`,
                background: `linear-gradient(90deg, ${MYFINANCE_BRAND.outside}, ${MYFINANCE_BRAND.tranquilidade})`,
              }}
            />
          </div>
          <div className="mt-1.5 text-right text-xs text-gray-400 dark:text-gray-500">
            Curso: {curso.progresso}% · {curso.aulasConcluidas}/{curso.totalAulas} aulas
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* ---------- player + aula ativa ---------- */}
        <div className="xl:col-span-8">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_48px_-28px_rgba(28,42,68,.45)] dark:border-gray-800 dark:bg-white/[0.03]">
            {aulaExibida ? (
              <>
                <div
                  className="relative aspect-video w-full text-white"
                  style={{ background: HERO_GRADIENT }}
                >
                  {aulaExibida.bloqueada ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                      <div
                        className="flex h-24 w-24 items-center justify-center rounded-3xl border-[1.5px] border-white/30"
                        style={{
                          background:
                            'linear-gradient(145deg, rgba(255,255,255,.17), rgba(255,255,255,.05))',
                        }}
                      >
                        <LockIcon className="h-11 w-11" />
                      </div>
                      <p className="text-sm text-white/80">
                        Esta aula faz parte do plano{' '}
                        <strong className="text-white">
                          {accessLevelLabel(aulaExibida.requiredLevel)}
                        </strong>
                        .
                      </p>
                    </div>
                  ) : aulaExibida.vturbEmbed ? (
                    <div className="absolute inset-0 bg-black">
                      <VturbPlayer embed={aulaExibida.vturbEmbed} />
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                      <div
                        className="flex h-28 w-28 items-center justify-center rounded-3xl border-[1.5px] border-white/30 shadow-[0_26px_50px_rgba(10,20,40,.4)]"
                        style={{
                          background:
                            'linear-gradient(145deg, rgba(255,255,255,.17), rgba(255,255,255,.05))',
                        }}
                      >
                        <ClapperIcon className="h-16 w-16" />
                      </div>
                      <p className="text-sm text-white/75">Vídeo em breve nesta aula.</p>
                    </div>
                  )}
                </div>

                <div className="px-6 py-5 sm:px-7">
                  <div
                    className="text-xs font-semibold uppercase tracking-[.2em]"
                    style={{ color: MYFINANCE_BRAND.tranquilidade }}
                  >
                    {moduloAtivo && posAulaNoModulo > 0
                      ? `Aula ${posAulaNoModulo} de ${moduloAtivo.aulas.length}`
                      : 'Aula'}
                    {formatDuracao(aulaExibida.durationSeconds) &&
                      ` · ${formatDuracao(aulaExibida.durationSeconds)}`}
                    {aulaExibida.concluida && (
                      <span
                        className="ml-2 normal-case tracking-normal"
                        style={{ color: OK_GREEN }}
                      >
                        ✓ Concluída
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">
                    {aulaExibida.title}
                  </h2>
                  {aulaExibida.description && (
                    <p className="mt-2 text-[15px] font-light leading-relaxed text-gray-600 dark:text-gray-300">
                      {aulaExibida.description}
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {!aulaExibida.bloqueada && (
                      <button
                        onClick={() =>
                          marcarAula.mutate({
                            lessonId: aulaExibida.id,
                            concluida: !aulaExibida.concluida,
                          })
                        }
                        disabled={marcarAula.isPending}
                        className="inline-flex items-center gap-2.5 rounded-xl px-6 py-3 text-base font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                        style={{
                          backgroundColor: aulaExibida.concluida
                            ? OK_GREEN
                            : MYFINANCE_BRAND.outside,
                          boxShadow: aulaExibida.concluida
                            ? '0 12px 26px -8px rgba(29,158,111,.65)'
                            : '0 12px 26px -8px rgba(0,121,242,.65)',
                        }}
                      >
                        <CheckIcon className="h-4 w-4" />
                        {aulaExibida.concluida ? 'Aula concluída' : 'Marcar como concluída'}
                      </button>
                    )}
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={() => aulaAnterior && selecionarAula(aulaAnterior)}
                        disabled={!aulaAnterior}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                      >
                        <ArrowLeftIcon className="h-4 w-4" />
                        Anterior
                      </button>
                      <button
                        onClick={() => proximaAula && selecionarAula(proximaAula)}
                        disabled={!proximaAula}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5"
                      >
                        Próxima aula
                        <ChevronIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div
                className="flex aspect-video flex-col items-center justify-center gap-3 text-white"
                style={{ background: HERO_GRADIENT }}
              >
                <div
                  className="flex h-28 w-28 items-center justify-center rounded-3xl border-[1.5px] border-white/30"
                  style={{
                    background:
                      'linear-gradient(145deg, rgba(255,255,255,.17), rgba(255,255,255,.05))',
                  }}
                >
                  <ClapperIcon className="h-16 w-16" />
                </div>
                <p className="text-sm text-white/75">
                  {moduloAtivo
                    ? 'As aulas deste módulo chegam em breve.'
                    : 'Este curso ainda não tem aulas.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ---------- trilha: módulos (acordeão) + aulas ---------- */}
        <div className="xl:col-span-4">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-baseline justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sua trilha</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {curso.modulos.length} módulos · {curso.totalAulas} aulas
              </span>
            </div>
            <ul>
              {curso.modulos.map((modulo, idx) => {
                const total = modulo.aulas.length;
                const feitas = modulo.aulas.filter((a) => a.concluida).length;
                const concluido = total > 0 && feitas === total;
                const expandido = moduloExpandidoId === modulo.id;
                return (
                  <li
                    key={modulo.id}
                    className="border-b border-gray-100 last:border-b-0 dark:border-gray-800"
                  >
                    <button
                      onClick={() => setModuloAbertoId(expandido ? '' : modulo.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        expandido
                          ? 'bg-[#f0f5fc] dark:bg-white/[0.06]'
                          : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <CapaMini modulo={modulo} index={idx} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[11px] font-bold tracking-[.12em]"
                            style={{ color: MYFINANCE_BRAND.tranquilidade }}
                          >
                            MÓDULO {numeroModulo(idx)}
                          </span>
                          {concluido && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                              style={{ backgroundColor: OK_GREEN }}
                            >
                              <CheckIcon className="h-2.5 w-2.5" />
                              Concluído
                            </span>
                          )}
                        </div>
                        <div className="truncate text-sm font-bold text-gray-900 dark:text-white/90">
                          {modulo.title}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${total > 0 ? (feitas / total) * 100 : 0}%`,
                                background: concluido
                                  ? OK_GREEN
                                  : `linear-gradient(90deg, ${MYFINANCE_BRAND.outside}, ${MYFINANCE_BRAND.tranquilidade})`,
                              }}
                            />
                          </div>
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            {feitas}/{total}
                          </span>
                        </div>
                      </div>
                      <ChevronIcon
                        className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expandido ? 'rotate-90' : ''}`}
                      />
                    </button>

                    {expandido && (
                      <ul className="bg-gray-50/60 py-1 dark:bg-black/10">
                        {modulo.aulas.length === 0 && (
                          <li className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500">
                            Aulas em breve.
                          </li>
                        )}
                        {modulo.aulas.map((aula, aIdx) => {
                          const ativa = aulaAtiva?.id === aula.id;
                          const duracao = formatDuracao(aula.durationSeconds);
                          return (
                            <li key={aula.id}>
                              <button
                                onClick={() => selecionarAula(aula)}
                                className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors ${
                                  ativa
                                    ? 'font-semibold text-gray-900 dark:text-white'
                                    : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-white/[0.04]'
                                }`}
                              >
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                                  style={
                                    aula.bloqueada
                                      ? { backgroundColor: '#e3e9f1', color: '#5d708c' }
                                      : aula.concluida
                                        ? { backgroundColor: OK_GREEN, color: '#fff' }
                                        : ativa
                                          ? {
                                              backgroundColor: MYFINANCE_BRAND.outside,
                                              color: '#fff',
                                            }
                                          : {
                                              border: `1.5px solid ${MYFINANCE_BRAND.tranquilidade}`,
                                              color: MYFINANCE_BRAND.seguranca,
                                            }
                                  }
                                >
                                  {aula.bloqueada ? (
                                    <LockIcon className="h-3.5 w-3.5" />
                                  ) : aula.concluida ? (
                                    <CheckIcon className="h-3.5 w-3.5" />
                                  ) : ativa ? (
                                    <PlayIcon className="h-3.5 w-3.5" />
                                  ) : (
                                    aIdx + 1
                                  )}
                                </span>
                                <span className="flex-1 truncate">{aula.title}</span>
                                {duracao && (
                                  <span className="shrink-0 text-xs text-gray-400">{duracao}</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
