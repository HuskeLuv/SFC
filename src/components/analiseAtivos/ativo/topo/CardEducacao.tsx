'use client';

/**
 * Card Educação (fatia B) — "Aprenda a analisar …" com o CARD DO CURSO da Educação (ModuloCard,
 * o mesmo da trilha): busca os cursos (useCursos), acha o curso Escolhi Ser Rico (CURSO_ESR_SLUG)
 * e nele o módulo da classe ('Ações' / 'Fundos Imobiliários', títulos de MODULOS_TRILHA_ESR). O
 * link é o do próprio card (/educacao/<slug>?modulo=<id>); a descrição vem de educacao.descricao.
 * Carregando: esqueleto com a altura do card (capa 16:9), sem salto ao trocar. Erro, sem acesso à
 * lista ou módulo não encontrado: bloco simples (ícone play + descrição + 'Abrir na Educação' para
 * educacao.href, botão de 48px no celular). Sem acesso ao curso: o card com o cadeado, como na
 * Educação.
 */
import Link from 'next/link';
import ModuloCard from '@/components/educacao/ModuloCard';
import { CURSO_ESR_SLUG, MODULOS_TRILHA_ESR } from '@/constants/educacaoModulos';
import { useCursos } from '@/hooks/useEducacao';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, CardEducacaoProps } from '@/types/analiseAtivosApi';

export type { CardEducacaoProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';

/** Módulo da trilha por classe (títulos da seed da trilha ESR). */
const MODULO_DA_CLASSE: Record<ClasseQuadro, string> = {
  acao: MODULOS_TRILHA_ESR[7].title,
  fii: MODULOS_TRILHA_ESR[8].title,
};

/** Classe pelo prop explícito ou pelo título do bloco (TEXTOS_TELA.educacao). */
function classeDoCard(
  educacao: CardEducacaoProps['educacao'],
  classe?: ClasseQuadro,
): ClasseQuadro | null {
  if (classe) return classe;
  if (educacao.titulo === TEXTOS_TELA.educacao.acao.titulo) return 'acao';
  if (educacao.titulo === TEXTOS_TELA.educacao.fii.titulo) return 'fii';
  return null;
}

export default function CardEducacao({
  educacao,
  classe,
}: CardEducacaoProps & { classe?: ClasseQuadro }) {
  const t = TEXTOS_TELA.ativo;
  const { cursos, loading } = useCursos();
  const c = classeDoCard(educacao, classe);
  const curso = c ? cursos.find((x) => x.slug === CURSO_ESR_SLUG) : undefined;
  const idx = curso && c ? curso.modulos.findIndex((m) => m.title === MODULO_DA_CLASSE[c]) : -1;
  const modulo = curso && idx >= 0 ? curso.modulos[idx] : null;

  const titulo = (
    <h2 id="bloco-educacao-h" className="text-base font-semibold text-gray-800 dark:text-white/90">
      {educacao.titulo}
    </h2>
  );

  if (curso && modulo) {
    return (
      <section
        aria-labelledby="bloco-educacao-h"
        data-bloco="educacao"
        className={`${CARD} flex min-w-0 flex-col gap-3`}
      >
        {titulo}
        <ModuloCard
          modulo={modulo}
          index={idx}
          slug={curso.slug}
          bloqueado={curso.bloqueado}
          descricao={educacao.descricao ?? undefined}
          className="w-full sm:max-w-[360px]"
        />
      </section>
    );
  }

  if (loading && c) {
    return (
      <section
        aria-labelledby="bloco-educacao-h"
        aria-busy="true"
        data-bloco="educacao"
        data-educacao="carregando"
        className={`${CARD} flex min-w-0 flex-col gap-3`}
      >
        {titulo}
        <div
          aria-hidden="true"
          className="flex w-full flex-col overflow-hidden rounded-2xl border border-gray-200 sm:max-w-[360px] dark:border-gray-800"
        >
          <div className="aspect-video animate-pulse bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
          <div className="flex flex-col gap-2 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
            <div className="h-3 w-full animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="bloco-educacao-h"
      data-bloco="educacao"
      className={`${CARD} flex min-w-0 flex-col gap-3`}
    >
      {titulo}
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[#314666] text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          {educacao.descricao ? (
            <p className="text-sm text-gray-800 dark:text-white/90">{educacao.descricao}</p>
          ) : null}
          <p className="text-xs text-gray-500 dark:text-gray-400">{t.educacaoNota}</p>
          <Link
            href={educacao.href}
            className="mt-2 inline-flex min-h-12 items-center justify-center self-start rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:min-h-11 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.03]"
          >
            {t.educacaoBotao}
          </Link>
        </div>
      </div>
    </section>
  );
}
