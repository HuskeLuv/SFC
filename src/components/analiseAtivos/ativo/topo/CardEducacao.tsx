/**
 * Card Educação (fatia B): aponta para a página do curso (LINK_EDUCACAO) até existirem módulos
 * específicos (decisão 12). Botão principal de 48px no celular.
 */
import Link from 'next/link';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { CardEducacaoProps } from '@/types/analiseAtivosApi';

export type { CardEducacaoProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';

export default function CardEducacao({ educacao }: CardEducacaoProps) {
  const t = TEXTOS_TELA.ativo;
  return (
    <section
      aria-labelledby="bloco-educacao-h"
      data-bloco="educacao"
      className={`${CARD} flex min-w-0 flex-col gap-3`}
    >
      <h2
        id="bloco-educacao-h"
        className="text-base font-semibold text-gray-800 dark:text-white/90"
      >
        {educacao.titulo}
      </h2>
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
