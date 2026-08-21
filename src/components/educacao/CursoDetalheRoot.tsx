'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCurso, useMarcarAula, type AulaDetalhe } from '@/hooks/useEducacao';
import { accessLevelLabel } from '@/utils/accessLevel';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import VturbPlayer from './VturbPlayer';

const formatDuracao = (seconds: number | null): string | null => {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** Página de um curso: player VTurb + lista de módulos/aulas com progresso. */
export default function CursoDetalheRoot({ slug }: { slug: string }) {
  const { curso, loading, error } = useCurso(slug);
  const marcarAula = useMarcarAula(slug);
  const [aulaSelecionadaId, setAulaSelecionadaId] = useState<string | null>(null);

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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href="/educacao"
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            ← Educação
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{curso.title}</h1>
          {curso.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{curso.description}</p>
          )}
        </div>
        <div className="text-right text-sm text-gray-600 dark:text-gray-300">
          <div className="font-semibold">{curso.progresso}% concluído</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {curso.aulasConcluidas} de {curso.totalAulas} aulas
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Player + info da aula ativa */}
        <div className="xl:col-span-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            {aulaAtiva ? (
              <>
                <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white/90">
                  {aulaAtiva.title}
                </h2>
                {aulaAtiva.bloqueada ? (
                  <div
                    className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl text-white"
                    style={{ backgroundColor: MYFINANCE_BRAND.seguranca }}
                  >
                    <span className="text-3xl">🔒</span>
                    <p className="text-sm">
                      Esta aula faz parte do plano{' '}
                      <strong>{accessLevelLabel(aulaAtiva.requiredLevel)}</strong>.
                    </p>
                  </div>
                ) : aulaAtiva.vturbEmbed ? (
                  <VturbPlayer embed={aulaAtiva.vturbEmbed} />
                ) : (
                  <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    <span className="text-3xl">🎬</span>
                    <p className="text-sm">Vídeo ainda não conectado à VTurb.</p>
                  </div>
                )}
                {aulaAtiva.description && (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                    {aulaAtiva.description}
                  </p>
                )}
                {!aulaAtiva.bloqueada && (
                  <button
                    onClick={() =>
                      marcarAula.mutate({
                        lessonId: aulaAtiva.id,
                        concluida: !aulaAtiva.concluida,
                      })
                    }
                    disabled={marcarAula.isPending}
                    className={`mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 ${
                      aulaAtiva.concluida
                        ? 'bg-gray-500 hover:bg-gray-600'
                        : 'bg-brand-500 hover:bg-brand-600'
                    }`}
                  >
                    {aulaAtiva.concluida ? 'Desmarcar conclusão' : '✓ Marcar como concluída'}
                  </button>
                )}
              </>
            ) : (
              <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                Este curso ainda não tem aulas.
              </p>
            )}
          </div>
        </div>

        {/* Lista de módulos/aulas */}
        <div className="xl:col-span-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            {curso.modulos.map((modulo) => (
              <div key={modulo.id} className="mb-4 last:mb-0">
                <h3
                  className="mb-2 rounded-lg px-3 py-1.5 text-sm font-bold text-white"
                  style={{ backgroundColor: MYFINANCE_BRAND.seguranca }}
                >
                  {modulo.title}
                </h3>
                <ul className="space-y-1">
                  {modulo.aulas.map((aula) => {
                    const ativa = aulaAtiva?.id === aula.id;
                    const duracao = formatDuracao(aula.durationSeconds);
                    return (
                      <li key={aula.id}>
                        <button
                          onClick={() => setAulaSelecionadaId(aula.id)}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            ativa
                              ? 'bg-blue-50 font-medium text-blue-900 dark:bg-blue-900/20 dark:text-blue-100'
                              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span className="shrink-0">
                            {aula.bloqueada ? '🔒' : aula.concluida ? '✅' : '▶️'}
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
