'use client';

import React, { useState } from 'react';
import { useExcluirComentario, useExcluirPost, useModerar } from '@/hooks/useComunidade';
import { ModalConfirmacao } from './shared';

export type Confirmacao =
  | { tipo: 'excluir-post'; postId: string }
  | { tipo: 'excluir-comentario'; commentId: string; postId: string }
  | { tipo: 'ocultar-post'; postId: string }
  | { tipo: 'ocultar-comentario'; commentId: string; postId: string }
  | { tipo: 'suspender'; userId: string; nome: string };

const TEXTOS: Record<
  Confirmacao['tipo'],
  { titulo: string; descricao: string; confirmar: string; motivo?: string; dias?: boolean }
> = {
  'excluir-post': {
    titulo: 'Excluir publicação?',
    descricao: 'Ela some da comunidade junto com os comentários. Não dá para desfazer.',
    confirmar: 'Excluir',
  },
  'excluir-comentario': {
    titulo: 'Excluir comentário?',
    descricao: 'O comentário some da publicação. Não dá para desfazer.',
    confirmar: 'Excluir',
  },
  'ocultar-post': {
    titulo: 'Remover publicação da comunidade?',
    descricao:
      'Ninguém mais vê o post (a equipe ainda vê e pode restaurar). O autor recebe um aviso com o motivo.',
    confirmar: 'Remover',
    motivo: 'Motivo (enviado ao autor)',
  },
  'ocultar-comentario': {
    titulo: 'Remover comentário?',
    descricao: 'O autor recebe um aviso com o motivo. A equipe pode restaurar depois.',
    confirmar: 'Remover',
    motivo: 'Motivo (enviado ao autor)',
  },
  suspender: {
    titulo: 'Suspender participante',
    descricao: 'Durante a suspensão a pessoa lê a comunidade, mas não publica, comenta nem curte.',
    confirmar: 'Suspender',
    motivo: 'Motivo (registro interno)',
    dias: true,
  },
};

/**
 * Fluxos com confirmação (excluir, remover pela equipe, suspender) num único
 * modal. `aoConcluir` roda após sucesso (ex.: voltar ao feed ao excluir o post aberto).
 */
export function useConfirmacoes(aoConcluir?: (c: Confirmacao) => void) {
  const [pendente, setPendente] = useState<Confirmacao | null>(null);
  const excluirPost = useExcluirPost();
  const excluirComentario = useExcluirComentario();
  const moderar = useModerar();

  const mutacoes = [excluirPost, excluirComentario, moderar];
  const carregando = mutacoes.some((m) => m.isPending);
  const erro = mutacoes.find((m) => m.error)?.error?.message ?? null;

  const fechar = () => {
    mutacoes.forEach((m) => m.reset());
    setPendente(null);
  };

  const confirmar = ({ motivo, dias }: { motivo: string; dias: number }) => {
    if (!pendente) return;
    const c = pendente;
    const ok = { onSuccess: () => (setPendente(null), aoConcluir?.(c)) };
    switch (c.tipo) {
      case 'excluir-post':
        return excluirPost.mutate({ id: c.postId }, ok);
      case 'excluir-comentario':
        return excluirComentario.mutate({ id: c.commentId, postId: c.postId }, ok);
      case 'ocultar-post':
        return moderar.mutate(
          { tipo: 'ocultar', postId: c.postId, motivo: motivo || undefined },
          ok,
        );
      case 'ocultar-comentario':
        return moderar.mutate(
          { tipo: 'ocultar', commentId: c.commentId, motivo: motivo || undefined },
          ok,
        );
      case 'suspender':
        return moderar.mutate(
          { tipo: 'suspender', userId: c.userId, dias, motivo: motivo || undefined },
          ok,
        );
    }
  };

  const textos = pendente ? TEXTOS[pendente.tipo] : null;
  const modal = (
    <ModalConfirmacao
      aberto={pendente != null}
      titulo={
        pendente?.tipo === 'suspender' ? `Suspender ${pendente.nome}` : (textos?.titulo ?? '')
      }
      descricao={textos?.descricao}
      confirmar={textos?.confirmar ?? 'Confirmar'}
      perigo
      campoMotivo={textos?.motivo}
      campoDias={textos?.dias}
      carregando={carregando}
      erro={erro}
      onFechar={fechar}
      onConfirmar={confirmar}
    />
  );

  return { pedir: setPendente, modal };
}
