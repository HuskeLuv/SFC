'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePostComunidade } from '@/hooks/useComunidade';
import type { MeComunidadeResponse } from '@/types/comunidade';
import { AvisoSuspensao, ComunidadeGate } from './ComunidadeGate';
import { DenunciaModal } from './DenunciaModal';
import { PostCard } from './PostCard';
import { CARD_CLASS } from './shared';
import { useConfirmacoes } from './useConfirmacoes';

function Detalhe({ id, me }: { id: string; me: MeComunidadeResponse }) {
  const router = useRouter();
  const { data, isLoading, error } = usePostComunidade(id);
  const [denuncia, setDenuncia] = useState<{ postId?: string; commentId?: string } | null>(null);
  const { pedir, modal } = useConfirmacoes((c) => {
    if (
      (c.tipo === 'excluir-post' || c.tipo === 'ocultar-post') &&
      c.postId === id &&
      !me.moderador
    ) {
      router.push('/comunidade');
    }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/comunidade"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        ← Voltar para a comunidade
      </Link>
      <AvisoSuspensao me={me} />
      {isLoading && <p className="text-sm text-gray-500">Carregando…</p>}
      {error && (
        <div className={`${CARD_CLASS} text-sm text-gray-600 dark:text-gray-400`}>
          {error.message}
        </div>
      )}
      {data && (
        <PostCard
          post={data.post}
          moderador={me.moderador}
          suspenso={me.suspenso}
          comentariosAbertos
          onDenunciar={setDenuncia}
          onConfirmar={pedir}
        />
      )}
      <DenunciaModal alvo={denuncia} onFechar={() => setDenuncia(null)} />
      {modal}
    </div>
  );
}

export default function PostDetalheRoot({ id }: { id: string }) {
  return <ComunidadeGate>{(me) => <Detalhe id={id} me={me} />}</ComunidadeGate>;
}
