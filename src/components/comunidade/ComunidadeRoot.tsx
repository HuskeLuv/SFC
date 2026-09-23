'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { CATEGORIAS_COMUNIDADE, type CategoriaComunidade } from '@/constants/comunidade';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { useFeedComunidade } from '@/hooks/useComunidade';
import type { MeComunidadeResponse } from '@/types/comunidade';
import { AvisoSuspensao, ComunidadeGate } from './ComunidadeGate';
import { Composer } from './Composer';
import { DenunciaModal } from './DenunciaModal';
import { PostCard } from './PostCard';
import { BOTAO_SECUNDARIO, CARD_CLASS } from './shared';
import { useConfirmacoes } from './useConfirmacoes';

/** Categorias em que quem está vendo pode publicar (espelha podePublicarNaCategoria). */
export const categoriasPublicaveis = (me: MeComunidadeResponse): CategoriaComunidade[] =>
  CATEGORIAS_COMUNIDADE.filter(
    (c) =>
      c.restricao === 'todos' ||
      me.moderador ||
      (c.restricao === 'consultores' && me.usuario.selos.includes('consultor')),
  );

function Feed({ me }: { me: MeComunidadeResponse }) {
  const [categoria, setCategoria] = useState<string | null>(null);
  const [denuncia, setDenuncia] = useState<{ postId?: string; commentId?: string } | null>(null);
  const { pedir, modal } = useConfirmacoes();
  const feed = useFeedComunidade({ categoria, enabled: true });
  const publicaveis = useMemo(() => categoriasPublicaveis(me), [me]);

  const fixados = feed.data?.pages[0]?.fixados ?? [];
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  const cardProps = {
    moderador: me.moderador,
    suspenso: me.suspenso,
    onDenunciar: setDenuncia,
    onConfirmar: pedir,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">Comunidade</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Troque experiências com quem segue a mesma metodologia.
          </p>
        </div>
        {me.moderador && (
          <Link href="/comunidade/moderacao" className={BOTAO_SECUNDARIO}>
            Moderação
          </Link>
        )}
      </header>

      <AvisoSuspensao me={me} />

      <nav aria-label="Categorias" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ chave: null, nome: 'Todas' }, ...CATEGORIAS_COMUNIDADE].map((c) => {
          const ativo = categoria === c.chave;
          return (
            <button
              key={c.chave ?? 'todas'}
              type="button"
              onClick={() => setCategoria(c.chave)}
              aria-pressed={ativo}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
                ativo
                  ? 'text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400'
              }`}
              style={
                ativo
                  ? {
                      background: MYFINANCE_BRAND.seguranca,
                      borderColor: MYFINANCE_BRAND.seguranca,
                    }
                  : undefined
              }
            >
              {c.nome}
            </button>
          );
        })}
      </nav>

      {!me.suspenso && <Composer me={me} categorias={publicaveis} categoriaInicial={categoria} />}

      {feed.isLoading && <p className="text-sm text-gray-500">Carregando publicações…</p>}
      {feed.error && (
        <div className={`${CARD_CLASS} text-sm text-error-600`}>{feed.error.message}</div>
      )}

      {fixados.map((p) => (
        <PostCard key={`fixado-${p.id}`} post={p} {...cardProps} />
      ))}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} {...cardProps} />
      ))}

      {!feed.isLoading && !feed.error && fixados.length + posts.length === 0 && (
        <div className={`${CARD_CLASS} text-center text-sm text-gray-500 dark:text-gray-400`}>
          Nenhuma publicação{categoria ? ' nesta categoria' : ''} ainda. Que tal começar?
        </div>
      )}

      {feed.hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            className={BOTAO_SECUNDARIO}
          >
            {feed.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      )}

      <DenunciaModal alvo={denuncia} onFechar={() => setDenuncia(null)} />
      {modal}
    </div>
  );
}

export default function ComunidadeRoot() {
  return <ComunidadeGate>{(me) => <Feed me={me} />}</ComunidadeGate>;
}
