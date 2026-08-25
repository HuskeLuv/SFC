'use client';

/**
 * Área Educacional (cursos Escolhi Ser Rico, vídeos VTurb) — ticket 21/08/2026.
 * Lista de cursos, árvore do curso e mutação de progresso da aula.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import type { ContinuarAula, ModuloTrilha } from '@/utils/educacaoTrilha';

export type { ContinuarAula, ModuloTrilha };

export interface CursoBase {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  requiredLevel: number;
  bloqueado: boolean;
  totalAulas: number;
  aulasConcluidas: number;
  progresso: number;
}

export interface CursoResumo extends CursoBase {
  duracaoSegundos: number;
  modulos: ModuloTrilha[];
  modulosConcluidos: number;
  /** Aula sugerida no hero "Continue de onde parou"; null se bloqueado/concluído. */
  continuar: ContinuarAula | null;
}

export interface AulaDetalhe {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  requiredLevel: number;
  bloqueada: boolean;
  concluida: boolean;
  /** Snippet de embed da VTurb; null quando bloqueada ou sem vídeo conectado. */
  vturbEmbed: string | null;
}

export interface ModuloDetalhe {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  aulas: AulaDetalhe[];
}

export interface CursoDetalhe extends CursoBase {
  modulos: ModuloDetalhe[];
}

export function useCursos() {
  const query = useQuery<{ cursos: CursoResumo[]; accessLevel: number }, Error>({
    queryKey: queryKeys.educacao.cursos(),
    queryFn: async () => {
      const res = await fetch('/api/educacao/cursos', { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar cursos (${res.status})`);
      return res.json();
    },
  });
  return {
    cursos: query.data?.cursos ?? [],
    accessLevel: query.data?.accessLevel ?? 0,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}

export function useCurso(slug: string) {
  const query = useQuery<{ curso: CursoDetalhe; accessLevel: number }, Error>({
    queryKey: queryKeys.educacao.curso(slug),
    queryFn: async () => {
      const res = await fetch(`/api/educacao/cursos/${encodeURIComponent(slug)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Erro ao carregar curso (${res.status})`);
      return res.json();
    },
    enabled: slug.length > 0,
  });
  return {
    curso: query.data?.curso ?? null,
    accessLevel: query.data?.accessLevel ?? 0,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}

export function useMarcarAula(slug: string) {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<void, Error, { lessonId: string; concluida: boolean }>({
    mutationFn: async ({ lessonId, concluida }) => {
      const res = await csrfFetch('/api/educacao/progresso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId, concluida }),
      });
      if (!res.ok) throw new Error(`Erro ao salvar progresso (${res.status})`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.educacao.curso(slug) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.educacao.cursos() });
    },
  });
}
