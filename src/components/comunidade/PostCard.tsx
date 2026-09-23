'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { COMUNIDADE_LIMITES } from '@/constants/comunidade';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { useCurtirPost, useEditarPost, useModerar } from '@/hooks/useComunidade';
import type { PostComunidade } from '@/types/comunidade';
import { Comentarios } from './Comentarios';
import {
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CARD_CLASS,
  CabecalhoAutor,
  INPUT_CLASS,
  MenuAcoes,
  TextoComLinks,
  type ItemMenu,
} from './shared';
import type { Confirmacao } from './useConfirmacoes';

const LIMITE_RESUMO = 700;

interface Props {
  post: PostComunidade;
  moderador: boolean;
  suspenso: boolean;
  comentariosAbertos?: boolean;
  onDenunciar: (alvo: { postId?: string; commentId?: string }) => void;
  onConfirmar: (c: Confirmacao) => void;
}

const CoracaoIcon = ({ cheio }: { cheio: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill={cheio ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
  >
    <path d="M12 20.3s-7.5-4.6-9.2-9.3C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.5-1.7 4.7-9.2 9.3-9.2 9.3z" />
  </svg>
);

const BalaoIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    aria-hidden="true"
  >
    <path d="M4 5.5h16v10.5H9l-5 4z" strokeLinejoin="round" />
  </svg>
);

export function PostCard({
  post,
  moderador,
  suspenso,
  comentariosAbertos = false,
  onDenunciar,
  onConfirmar,
}: Props) {
  const [mostrarComentarios, setMostrarComentarios] = useState(comentariosAbertos);
  const [expandido, setExpandido] = useState(false);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(post.conteudo);
  const curtir = useCurtirPost();
  const editar = useEditarPost();
  const moderar = useModerar();

  const longo = post.conteudo.length > LIMITE_RESUMO;
  const conteudo =
    longo && !expandido ? `${post.conteudo.slice(0, LIMITE_RESUMO).trimEnd()}…` : post.conteudo;

  const itens: ItemMenu[] = [];
  if (post.meu && !post.oculto) {
    if (!suspenso) {
      itens.push({
        rotulo: 'Editar',
        onClick: () => {
          setTexto(post.conteudo);
          setEditando(true);
        },
      });
    }
    itens.push({
      rotulo: 'Excluir',
      perigo: true,
      onClick: () => onConfirmar({ tipo: 'excluir-post', postId: post.id }),
    });
  }
  if (!post.meu)
    itens.push({ rotulo: 'Denunciar', onClick: () => onDenunciar({ postId: post.id }) });
  if (moderador) {
    if (post.oculto) {
      itens.push({
        rotulo: 'Restaurar publicação',
        onClick: () => moderar.mutate({ tipo: 'restaurar', postId: post.id }),
      });
    } else {
      itens.push({
        rotulo: post.fixado ? 'Desafixar do topo' : 'Fixar no topo',
        onClick: () =>
          moderar.mutate({ tipo: post.fixado ? 'desafixar' : 'fixar', postId: post.id }),
      });
      if (!post.meu) {
        itens.push({
          rotulo: 'Remover (moderação)',
          perigo: true,
          onClick: () => onConfirmar({ tipo: 'ocultar-post', postId: post.id }),
        });
      }
    }
    if (!post.meu && !post.autor.selos.includes('equipe')) {
      itens.push({
        rotulo: 'Suspender autor',
        perigo: true,
        onClick: () =>
          onConfirmar({ tipo: 'suspender', userId: post.autor.id, nome: post.autor.nome }),
      });
    }
  }

  return (
    <article
      className={`${CARD_CLASS} ${post.oculto ? 'opacity-60' : ''}`}
      style={post.fixado ? { borderColor: MYFINANCE_BRAND.tranquilidade } : undefined}
    >
      {post.fixado && (
        <div
          className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
          style={{ color: MYFINANCE_BRAND.patrimonio }}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <path d="M10.2 1.5 14.5 5.8l-1.4.6-2.6 2.6.3 3.3-1.2 1.2-2.7-2.7L3 14.7 1.3 13l3.9-3.9-2.7-2.7 1.2-1.2 3.3.3L9.6 2.9z" />
          </svg>
          Fixado pela equipe
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <CabecalhoAutor
          autor={post.autor}
          createdAt={post.createdAt}
          editadoEm={post.editadoEm}
          categoria={post.categoria}
        />
        <MenuAcoes itens={itens} rotulo="Ações da publicação" />
      </div>

      {post.oculto && (
        <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-xs font-medium text-error-600 dark:bg-error-500/10 dark:text-error-400">
          Removido pela moderação — só a equipe vê
          {post.ocultoMotivo ? `: ${post.ocultoMotivo}` : ''}
        </p>
      )}

      {editando ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={COMUNIDADE_LIMITES.postMaxChars}
            rows={6}
            className={`${INPUT_CLASS} resize-y`}
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
                  { id: post.id, conteudo: texto },
                  { onSuccess: () => setEditando(false) },
                )
              }
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <TextoComLinks
            texto={conteudo}
            className="text-[15px] leading-relaxed text-gray-800 dark:text-white/85"
          />
          {longo && (
            <button
              type="button"
              onClick={() => setExpandido((v) => !v)}
              className="mt-1 text-sm font-medium text-brand-500 hover:text-brand-600"
            >
              {expandido ? 'ver menos' : 'ver mais'}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-1 border-t border-gray-100 pt-2 dark:border-gray-800">
        <button
          type="button"
          disabled={suspenso || post.oculto}
          aria-pressed={post.curtiu}
          onClick={() => curtir.mutate({ id: post.id, curtir: !post.curtiu })}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/5"
          style={{ color: post.curtiu ? MYFINANCE_BRAND.outside : undefined }}
        >
          <span className={post.curtiu ? '' : 'text-gray-500 dark:text-gray-400'}>
            <CoracaoIcon cheio={post.curtiu} />
          </span>
          <span className={post.curtiu ? 'font-semibold' : 'text-gray-600 dark:text-gray-400'}>
            {post.curtidas > 0 ? post.curtidas : ''} Curtir
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMostrarComentarios((v) => !v)}
          aria-expanded={mostrarComentarios}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
        >
          <BalaoIcon />
          {post.comentarios > 0 ? post.comentarios : ''}{' '}
          {post.comentarios === 1 ? 'Comentário' : 'Comentários'}
        </button>
        {!comentariosAbertos && (
          <Link
            href={`/comunidade/${post.id}`}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
          >
            Abrir
          </Link>
        )}
      </div>

      {mostrarComentarios && (
        <Comentarios
          postId={post.id}
          moderador={moderador}
          suspenso={suspenso}
          onDenunciar={onDenunciar}
          onConfirmar={onConfirmar}
        />
      )}
    </article>
  );
}
