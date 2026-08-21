'use client';

import React from 'react';
import Link from 'next/link';
import { useCursos } from '@/hooks/useEducacao';
import { accessLevelLabel } from '@/utils/accessLevel';
import { MYFINANCE_BRAND } from '@/constants/brandColors';

/** Grade de cursos da Área Educacional (conteúdo Escolhi Ser Rico). */
export default function EducacaoRoot() {
  const { cursos, loading, error } = useCursos();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Educação</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Cursos de educação financeira do Escolhi Ser Rico, direto no My Finance
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cursos.map((curso) => (
          <Link
            key={curso.id}
            href={`/educacao/${curso.slug}`}
            className="group rounded-2xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div
              className="mb-4 flex h-32 items-center justify-center rounded-xl text-white"
              style={{
                background: curso.coverUrl
                  ? `url(${curso.coverUrl}) center/cover`
                  : `linear-gradient(135deg, ${MYFINANCE_BRAND.seguranca}, ${MYFINANCE_BRAND.outside})`,
              }}
            >
              {!curso.coverUrl && (
                <span className="px-4 text-center text-lg font-bold">{curso.title}</span>
              )}
            </div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-gray-900 group-hover:underline dark:text-white/90">
                {curso.title}
              </h3>
              {curso.bloqueado && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: MYFINANCE_BRAND.seguranca }}
                  title={`Disponível no plano ${accessLevelLabel(curso.requiredLevel)}`}
                >
                  🔒 {accessLevelLabel(curso.requiredLevel)}
                </span>
              )}
            </div>
            {curso.description && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                {curso.description}
              </p>
            )}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {curso.aulasConcluidas}/{curso.totalAulas} aulas
                </span>
                <span>{curso.progresso}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${curso.progresso}%`,
                    backgroundColor: MYFINANCE_BRAND.outside,
                  }}
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
