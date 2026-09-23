'use client';

import React, { useState } from 'react';
import { COMUNIDADE_LIMITES, type CategoriaComunidade } from '@/constants/comunidade';
import { usePublicarPost } from '@/hooks/useComunidade';
import type { MeComunidadeResponse } from '@/types/comunidade';
import { AvatarAutor, BOTAO_PRIMARIO, CARD_CLASS, INPUT_CLASS } from './shared';

export function Composer({
  me,
  categorias,
  categoriaInicial,
}: {
  me: MeComunidadeResponse;
  categorias: CategoriaComunidade[];
  categoriaInicial: string | null;
}) {
  const publicar = usePublicarPost();
  const [texto, setTexto] = useState('');
  const inicial = categorias.some((c) => c.chave === categoriaInicial)
    ? categoriaInicial!
    : (categorias[0]?.chave ?? 'geral');
  const [categoria, setCategoria] = useState(inicial);
  const [focado, setFocado] = useState(false);

  // Acompanha o filtro ativo enquanto não há rascunho.
  React.useEffect(() => {
    if (!texto) setCategoria(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao trocar de filtro
  }, [inicial]);

  const restante = COMUNIDADE_LIMITES.postMaxChars - texto.length;
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    publicar.mutate(
      { categoria, conteudo: texto },
      {
        onSuccess: () => {
          setTexto('');
          setFocado(false);
        },
      },
    );
  };

  return (
    <form onSubmit={enviar} className={CARD_CLASS}>
      <div className="flex gap-3">
        <AvatarAutor autor={me.usuario} />
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setFocado(true)}
          maxLength={COMUNIDADE_LIMITES.postMaxChars}
          rows={focado || texto ? 4 : 2}
          placeholder="Compartilhe uma conquista, dúvida ou aprendizado…"
          aria-label="Nova publicação"
          className={`${INPUT_CLASS} resize-y`}
        />
      </div>
      {(focado || texto) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 sm:pl-[52px]">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            Categoria
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className={`${INPUT_CLASS} w-auto py-1.5`}
            >
              {categorias.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <span
            className={`text-xs ${restante < 200 ? 'text-warning-600' : 'text-gray-400'}`}
            aria-live="polite"
          >
            {restante < 500 ? `${restante} caracteres restantes` : ''}
          </span>
          <button
            type="submit"
            className={`${BOTAO_PRIMARIO} ml-auto`}
            disabled={publicar.isPending || !texto.trim()}
          >
            {publicar.isPending ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      )}
      {publicar.error && (
        <p className="mt-2 text-sm text-error-600 dark:text-error-400">{publicar.error.message}</p>
      )}
    </form>
  );
}
