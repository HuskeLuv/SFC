'use client';

import React, { useEffect, useRef, useState } from 'react';
import { COMUNIDADE_LIMITES } from '@/constants/comunidade';
import {
  useComentar,
  useEditarComentario,
  useModerar,
  usePostComunidade,
} from '@/hooks/useComunidade';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
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
      className={`rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03] max-lg:rounded-2xl max-lg:rounded-tl-md ${c.oculto ? 'opacity-60' : ''}`}
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
          className="mt-2 pl-11 text-sm text-gray-700 dark:text-gray-300 max-lg:pl-0"
        />
      )}
    </li>
  );
}

export function Comentarios({ postId, moderador, suspenso, onDenunciar, onConfirmar }: Props) {
  const { data, isLoading, error } = usePostComunidade(postId);
  const comentar = useComentar();
  const [texto, setTexto] = useState('');
  // PWA fase 3 (C2): no celular o campo fica numa barra fixa acima da barra de abas; com foco, a
  // barra de abas some (data-mf-overlay) e o campo sobe com o teclado (useKeyboardInset).
  const isBelowLg = useIsBelowLg();
  const [focado, setFocado] = useState(false);
  const teclado = useKeyboardInset(isBelowLg && focado);
  const barraRef = useRef<HTMLFormElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const [alturaBarra, setAlturaBarra] = useState(0);

  useEffect(() => {
    const barra = barraRef.current;
    if (!isBelowLg || !barra || typeof ResizeObserver === 'undefined') {
      setAlturaBarra(barra?.offsetHeight ?? 0);
      return;
    }
    const obs = new ResizeObserver(() => setAlturaBarra(barra.offsetHeight));
    obs.observe(barra);
    return () => obs.disconnect();
  }, [isBelowLg, suspenso]);

  // Campo de 44 a 120px, crescendo com o texto.
  useEffect(() => {
    const campo = campoRef.current;
    if (!isBelowLg || !campo) return;
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(Math.max(campo.scrollHeight, 44), 120)}px`;
  }, [texto, isBelowLg]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    comentar.mutate({ postId, conteudo: texto }, { onSuccess: () => setTexto('') });
  };

  const barraMobile = isBelowLg && !suspenso;

  return (
    <div
      className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"
      style={barraMobile ? { paddingBottom: alturaBarra } : undefined}
    >
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
      {barraMobile && (
        <form
          ref={barraRef}
          onSubmit={enviar}
          data-mf-comment-bar=""
          // Sem foco, pb-6 deixa o botão ＋ Lançar (que sobressai da barra de abas) fora do campo.
          className={`fixed inset-x-0 z-30 border-t border-gray-200 bg-white px-4 pt-2 dark:border-gray-800 dark:bg-gray-900 ${
            focado ? 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]' : 'pb-6'
          }`}
          style={{
            bottom: teclado.inset > 0 ? teclado.inset : 'var(--mf-bottom-nav-h, 0px)',
          }}
        >
          {/* O botão flutuante do assistente cobriria o Enviar; some enquanto a barra existe. */}
          <style>{`@media (width < 64rem) { :root:has([data-mf-comment-bar]) [data-mf-fab] { display: none; } }`}</style>
          {focado && <span data-mf-overlay="" hidden />}
          {comentar.error && (
            <p role="alert" className="mb-1 text-xs text-[#D92D20] dark:text-[#F97066]">
              {comentar.error.message}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={campoRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onFocus={() => setFocado(true)}
              onBlur={() => setFocado(false)}
              maxLength={COMUNIDADE_LIMITES.comentarioMaxChars}
              rows={1}
              placeholder="Escreva um comentário…"
              aria-label="Escreva um comentário"
              className={`${INPUT_CLASS} max-h-[120px] min-h-11 resize-none rounded-2xl`}
            />
            <button
              type="submit"
              // Não tira o foco do campo (o teclado não fecha antes do envio).
              onMouseDown={(e) => e.preventDefault()}
              className="min-h-11 shrink-0 rounded-xl bg-mf-seguranca px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-mf-patrimonio"
              disabled={comentar.isPending || !texto.trim()}
            >
              Enviar
            </button>
          </div>
        </form>
      )}
      {!suspenso && !isBelowLg && (
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
      {comentar.error && !barraMobile && (
        <p className="mt-2 text-xs text-error-600 dark:text-error-400">{comentar.error.message}</p>
      )}
    </div>
  );
}
