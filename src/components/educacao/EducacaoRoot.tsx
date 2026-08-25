'use client';

import React from 'react';
import Link from 'next/link';
import { useCursos, type CursoResumo, type ModuloTrilha } from '@/hooks/useEducacao';
import { accessLevelLabel } from '@/utils/accessLevel';
import { formatDuracaoCurta } from '@/utils/educacaoTrilha';
import { MYFINANCE_BRAND } from '@/constants/brandColors';

const OK_GREEN = '#1d9e6f';

const PlayIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

const CheckIcon = () => (
  <svg
    viewBox="0 0 16 16"
    className="h-3 w-3"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

const numeroModulo = (idx: number) => String(idx + 1).padStart(2, '0');

/** Hero "Continue de onde parou" (ou estado concluído/bloqueado) de um curso. */
function HeroContinuar({ curso }: { curso: CursoResumo }) {
  const c = curso.continuar;
  const trilhaConcluida = !c && !curso.bloqueado && curso.totalAulas > 0 && curso.progresso === 100;

  const restante = c ? formatDuracaoCurta(c.restanteSegundos) : null;
  const linhaAula = c
    ? [
        `Aula ${c.aulaIndex} de ${c.totalAulasModulo}`,
        c.aulaTitle,
        restante && `${restante} restantes`,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const href = c ? `/educacao/${curso.slug}?aula=${c.aulaId}` : `/educacao/${curso.slug}`;

  return (
    <section
      className="flex overflow-hidden rounded-2xl text-white shadow-[0_24px_48px_-20px_rgba(28,42,68,.45)]"
      style={{
        background: `linear-gradient(118deg, #1c2a44 0%, ${MYFINANCE_BRAND.seguranca} 52%, ${MYFINANCE_BRAND.patrimonio} 100%)`,
      }}
    >
      <div className="flex flex-1 flex-col px-7 py-8 sm:px-11 sm:py-9">
        <div
          className="text-xs font-semibold uppercase tracking-[.22em]"
          style={{ color: '#8fc0f7' }}
        >
          {curso.bloqueado
            ? 'Conteúdo exclusivo'
            : trilhaConcluida
              ? 'Trilha concluída'
              : c
                ? 'Continue de onde parou'
                : 'Comece sua trilha'}
        </div>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{c ? c.moduloTitle : curso.title}</h2>
        <p className="mt-1.5 text-sm font-light text-white/75 sm:text-[15px]">
          {curso.bloqueado
            ? `Disponível no plano ${accessLevelLabel(curso.requiredLevel)}.`
            : trilhaConcluida
              ? 'Você concluiu todas as aulas. Reveja quando quiser.'
              : (linhaAula ?? curso.description ?? '')}
        </p>
        {c && (
          <>
            <div className="mt-5 h-[7px] max-w-[420px] rounded-full bg-white/[.18]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${c.progressoModulo}%`,
                  background: `linear-gradient(90deg, ${MYFINANCE_BRAND.outside}, ${MYFINANCE_BRAND.tranquilidade})`,
                }}
              />
            </div>
            <div className="mt-2 text-[13px] text-white/65">
              {c.progressoModulo}% do módulo concluído
            </div>
          </>
        )}
        {!curso.bloqueado && (
          <Link
            href={href}
            className="mt-6 inline-flex items-center gap-2.5 self-start rounded-xl px-6 py-3 text-base font-bold text-white shadow-[0_12px_26px_-8px_rgba(0,121,242,.65)] transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: MYFINANCE_BRAND.outside }}
          >
            <PlayIcon className="h-4 w-4" />
            {trilhaConcluida ? 'Rever aulas' : c ? 'Continuar assistindo' : 'Começar agora'}
          </Link>
        )}
      </div>
      <div
        className="relative hidden w-[36%] min-w-[300px] items-center justify-center lg:flex"
        style={{
          background: `radial-gradient(420px 340px at 78% 22%, rgba(0,121,242,.55) 0%, rgba(0,121,242,0) 65%), linear-gradient(128deg, rgba(49,70,102,0) 0%, ${MYFINANCE_BRAND.patrimonio} 90%)`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(420px 360px at 70% 40%, #000 30%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(420px 360px at 70% 40%, #000 30%, transparent 80%)',
          }}
        />
        <div
          className="relative flex h-[170px] w-[170px] items-center justify-center rounded-3xl border-[1.5px] border-white/30 shadow-[0_26px_50px_rgba(10,20,40,.4),inset_0_1px_0_rgba(255,255,255,.25)]"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,.17), rgba(255,255,255,.05))',
          }}
        >
          {c && (
            <span
              className="absolute -right-3.5 -top-4 rounded-full px-4 py-1 text-lg font-bold shadow-[0_10px_22px_rgba(0,121,242,.55)]"
              style={{ backgroundColor: MYFINANCE_BRAND.outside }}
            >
              {numeroModulo(c.moduloIndex)}
            </span>
          )}
          {curso.bloqueado ? (
            <span className="text-6xl">🔒</span>
          ) : (
            <PlayIcon className="h-20 w-20 text-white/90" />
          )}
        </div>
      </div>
    </section>
  );
}

/** Card de módulo da trilha (capa 16:9 + badge + progresso). */
function ModuloCard({
  modulo,
  index,
  slug,
  bloqueado,
}: {
  modulo: ModuloTrilha;
  index: number;
  slug: string;
  bloqueado: boolean;
}) {
  const concluido = modulo.status === 'concluido';
  const emAndamento = modulo.status === 'em_andamento';
  const duracao = formatDuracaoCurta(modulo.duracaoSegundos);
  const meta = [`${modulo.totalAulas} ${modulo.totalAulas === 1 ? 'aula' : 'aulas'}`, duracao]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={`/educacao/${slug}?modulo=${modulo.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 transition-all hover:-translate-y-1 hover:shadow-[0_22px_44px_-18px_rgba(28,42,68,.35)] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#0079F2] dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
    >
      <div className="relative aspect-video overflow-hidden">
        {modulo.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={modulo.coverUrl}
            alt={`Capa do módulo ${numeroModulo(index)} — ${modulo.title}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="flex h-full w-full flex-col justify-end p-5 text-white"
            style={{
              background: `linear-gradient(118deg, #1c2a44 0%, ${MYFINANCE_BRAND.seguranca} 52%, ${MYFINANCE_BRAND.patrimonio} 100%)`,
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-[.2em] text-white/70">
              Módulo {numeroModulo(index)}
            </span>
            <span className="mt-1 text-xl font-bold">{modulo.title}</span>
          </div>
        )}
        {(concluido || emAndamento) && (
          <span
            className="absolute right-3 top-3 z-[2] inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: concluido ? OK_GREEN : MYFINANCE_BRAND.outside }}
          >
            {concluido && <CheckIcon />}
            {concluido ? 'Concluído' : 'Em andamento'}
          </span>
        )}
        {bloqueado && (
          <span
            className="absolute left-3 top-3 z-[2] rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: MYFINANCE_BRAND.seguranca }}
          >
            🔒
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-[rgba(20,32,54,.34)] opacity-0 transition-opacity group-hover:opacity-100">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_26px_rgba(10,20,40,.45)]"
            style={{ backgroundColor: 'rgba(0,121,242,.92)' }}
          >
            <PlayIcon className="h-7 w-7" />
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <h3 className="text-lg font-bold">{modulo.title}</h3>
        {modulo.description && (
          <p className="mt-1.5 flex-1 text-[13.5px] font-light leading-relaxed text-gray-500 dark:text-gray-400">
            {modulo.description}
          </p>
        )}
        <div className="mt-4 h-[5px] rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full"
            style={{
              width: `${modulo.progresso}%`,
              background: concluido
                ? OK_GREEN
                : `linear-gradient(90deg, ${MYFINANCE_BRAND.outside}, ${MYFINANCE_BRAND.tranquilidade})`,
            }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>{meta}</span>
          <span
            className="font-bold"
            style={{
              color: concluido ? OK_GREEN : emAndamento ? MYFINANCE_BRAND.outside : undefined,
            }}
          >
            {modulo.status === 'nao_iniciado' ? 'Começar' : `${modulo.progresso}%`}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Home da Área Educacional: hero "continue" + trilha de módulos por curso. */
export default function EducacaoRoot() {
  const { cursos, loading, error } = useCursos();
  const cursoPrincipal = cursos[0];

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-7">
        <div
          className="text-[13px] font-medium uppercase tracking-[.16em]"
          style={{ color: MYFINANCE_BRAND.tranquilidade }}
        >
          {cursoPrincipal?.title ?? 'Área de membros'}
        </div>
        <h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">Educação</h1>
        <p className="mt-1.5 max-w-[60ch] text-base font-light text-gray-500 dark:text-gray-400">
          {cursoPrincipal?.description ??
            'Cursos de educação financeira do Escolhi Ser Rico, direto no My Finance.'}
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand-500" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && cursos.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum curso publicado ainda. Em breve o conteúdo do Escolhi Ser Rico aparece aqui.
          </p>
        </div>
      )}

      {cursos.map((curso, i) => (
        <div key={curso.id} className={i > 0 ? 'mt-14' : undefined}>
          <HeroContinuar curso={curso} />

          <div className="mt-10 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-[23px] font-bold text-gray-900 dark:text-white">
              {cursos.length > 1 ? curso.title : 'Sua trilha'}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {curso.modulosConcluidos} de {curso.modulos.length}{' '}
              {curso.modulos.length === 1 ? 'módulo concluído' : 'módulos concluídos'} ·{' '}
              {curso.totalAulas} {curso.totalAulas === 1 ? 'aula' : 'aulas'} no total
            </span>
          </div>

          {curso.modulos.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
              Este curso ainda não tem módulos.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {curso.modulos.map((modulo, idx) => (
                <ModuloCard
                  key={modulo.id}
                  modulo={modulo}
                  index={idx}
                  slug={curso.slug}
                  bloqueado={curso.bloqueado}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {!loading && cursos.length > 0 && (
        <footer className="mt-14 flex flex-col gap-1 border-t border-gray-200 pt-5 text-[13px] text-gray-400 sm:flex-row sm:justify-between dark:border-gray-800 dark:text-gray-500">
          <span>My Finance · Área de membros</span>
          <span>Educação Financeira do Zero — Escolhi Ser Rico</span>
        </footer>
      )}
    </div>
  );
}
