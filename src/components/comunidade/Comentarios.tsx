'use client';

import React, { useState } from 'react';
import { COMUNIDADE_LIMITES } from '@/constants/comunidade';
import {
  useComentar,
  useEditarComentario,
  useModerar,
  usePostComunidade,
} from '@/hooks/useComunidade';
import type { ComentarioComunidade } from '@/types/comunidade';
import {
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CabecalhoAutor,
  INPUT_CLASS,
  MenuAcoes,
  TextoComLinks,
  type ItemMenu,
} from './shared';
import type { Confirmacao } from './useConfirmacoes';

interface Props {
  postId: string;
  moderador: boolean;
  suspenso: boolean;
  onDenunciar: (alvo: { commentId: string }) => void;
  onConfirmar: (c: Confirmacao) => void;
}

function ItemComentario({
  c,
  moderador,
  suspenso,
  onDenunciar,
  onConfirmar,
}: Omit<Props, 'postId'> & { c: ComentarioComunidade }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(c.conteudo);
  const editar = useEditarComentario();
  const moderar = useModerar();

  const itens: ItemMenu[] = [];
  if (c.meu && !c.oculto) {
    if (!suspenso)
      itens.push({ rotulo: 'Editar', onClick: () => (setTexto(c.conteudo), setEditando(true)) });
    itens.push({
      rotulo: 'Excluir',
      perigo: true,
      onClick: () => onConfirmar({ tipo: 'excluir-comentario', commentId: c.id, postId: c.postId }),
    });
  }
  if (!c.meu) itens.push({ rotulo: 'Denunciar', onClick: () => onDenunciar({ commentId: c.id }) });
  if (moderador) {
    if (c.oculto) {
      itens.push({
        rotulo: 'Restaurar comentário',
        onClick: () => moderar.mutate({ tipo: 'restaurar', commentId: c.id }),
      });
    } else if (!c.meu) {
      itens.push({
        rotulo: 'Remover (moderação)',
        perigo: true,
        onClick: () =>
          onConfirmar({ tipo: 'ocultar-comentario', commentId: c.id, postId: c.postId }),
      });
    }
    if (!c.meu && !c.autor.selos.includes('equipe')) {
      itens.push({
        rotulo: 'Suspender autor',
        perigo: true,
        onClick: () => onConfirmar({ tipo: 'suspender', userId: c.autor.id, nome: c.autor.nome }),
      });
    }
  }

  return (
    <li
      className={`rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03] ${c.oculto ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <CabecalhoAutor
          autor={c.autor}
          createdAt={c.createdAt}
          editadoEm={c.editadoEm}
          tamanhoAvatar={32}
        />
        <MenuAcoes itens={itens} rotulo="Ações do comentário" />
      </div>
      {c.oculto && (
        <p className="mt-2 text-xs font-medium text-error-600 dark:text-error-400">
          Removido pela moderação{c.ocultoMotivo ? `: ${c.ocultoMotivo}` : ''}
        </p>
      )}
      {editando ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={COMUNIDADE_LIMITES.comentarioMaxChars}
            rows={3}
            className={`${INPUT_CLASS} resize-none`}
          />
          {editar.error && (
            <p className="text-xs text-error-600 dark:text-error-400">{editar.error.message}</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setEditando(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className={BOTAO_PRIMARIO}
              disabled={editar.isPending || !texto.trim()}
              onClick={() =>
                editar.mutate(
                  { id: c.id, postId: c.postId, conteudo: texto },
                  { onSuccess: () => setEditando(false) },
                )
              }
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <TextoComLinks
          texto={c.conteudo}
          className="mt-2 pl-11 text-sm text-gray-700 dark:text-gray-300"
        />
      )}
    </li>
  );
}

export function Comentarios({ postId, moderador, suspenso, onDenunciar, onConfirmar }: Props) {
  const { data, isLoading, error } = usePostComunidade(postId);
  const comentar = useComentar();
  const [texto, setTexto] = useState('');

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    comentar.mutate({ postId, conteudo: texto }, { onSuccess: () => setTexto('') });
  };

  return (
    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
      {isLoading && <p className="text-sm text-gray-500">Carregando comentários…</p>}
      {error && <p className="text-sm text-error-600">{error.message}</p>}
      {data && data.comentarios.length > 0 && (
        <ul className="space-y-2">
          {data.comentarios.map((c) => (
            <ItemComentario
              key={c.id}
              c={c}
              moderador={moderador}
              suspenso={suspenso}
              onDenunciar={onDenunciar}
              onConfirmar={onConfirmar}
            />
          ))}
        </ul>
      )}
      {data && data.comentarios.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Seja o primeiro a comentar.</p>
      )}
      {!suspenso && (
        <form onSubmit={enviar} className="mt-3 flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={COMUNIDADE_LIMITES.comentarioMaxChars}
            rows={1}
            placeholder="Escreva um comentário…"
            aria-label="Escreva um comentário"
            className={`${INPUT_CLASS} min-h-[40px] resize-y`}
          />
          <button
            type="submit"
            className={BOTAO_PRIMARIO}
            disabled={comentar.isPending || !texto.trim()}
          >
            Comentar
          </button>
        </form>
      )}
      {comentar.error && (
        <p className="mt-2 text-xs text-error-600 dark:text-error-400">{comentar.error.message}</p>
      )}
    </div>
  );
}
