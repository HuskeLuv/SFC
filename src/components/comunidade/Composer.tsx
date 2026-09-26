'use client';

import React, { useState } from 'react';
import {
  COMUNIDADE_LIMITES,
  TERMO_COMUNIDADE_ITENS,
  type CategoriaComunidade,
} from '@/constants/comunidade';
import { usePublicarPost } from '@/hooks/useComunidade';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
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
  // PWA fase 3 (C3): no celular o compositor é um botão compacto que abre um sheet alto.
  const isBelowLg = useIsBelowLg();
  const [sheetAberto, setSheetAberto] = useState(false);

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
          setSheetAberto(false);
        },
      },
    );
  };

  if (isBelowLg) {
    const podePublicar = !publicar.isPending && !!texto.trim();
    return (
      <>
        <button
          type="button"
          data-mf-composer=""
          aria-haspopup="dialog"
          onClick={() => setSheetAberto(true)}
          className={`${CARD_CLASS} flex min-h-[60px] w-full items-center gap-3 text-left text-sm text-gray-500 dark:text-gray-400`}
        >
          <AvatarAutor autor={me.usuario} tamanho={32} />
          <span className="min-w-0 flex-1 truncate">
            {texto || 'Compartilhe uma conquista, dúvida ou aprendizado…'}
          </span>
        </button>
        <BottomSheet
          isOpen={sheetAberto}
          onClose={() => setSheetAberto(false)}
          title="Nova publicação"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSheetAberto(false)}
                className="min-h-11 flex-1 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="mf-composer-sheet"
                disabled={!podePublicar}
                className="min-h-11 flex-1 rounded-xl bg-mf-seguranca px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-mf-patrimonio"
              >
                {publicar.isPending ? 'Publicando…' : 'Publicar'}
              </button>
            </div>
          }
        >
          <form id="mf-composer-sheet" onSubmit={enviar} className="space-y-4 pb-2">
            <label className="block text-sm text-gray-700 dark:text-gray-300">
              Categoria
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className={`${INPUT_CLASS} mt-1 min-h-11`}
              >
                {categorias.map((c) => (
                  <option key={c.chave} value={c.chave}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-gray-700 dark:text-gray-300">
              Texto
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={COMUNIDADE_LIMITES.postMaxChars}
                rows={6}
                placeholder="Compartilhe uma conquista, dúvida ou aprendizado…"
                className={`${INPUT_CLASS} mt-1 min-h-40 resize-none`}
              />
              <span
                aria-live="polite"
                className={`mt-1 block text-right text-xs ${
                  restante < 200 ? 'text-[#B45309] dark:text-[#FBBF24]' : 'text-gray-500'
                }`}
              >
                {texto.length.toLocaleString('pt-BR')} /{' '}
                {COMUNIDADE_LIMITES.postMaxChars.toLocaleString('pt-BR')}
              </span>
            </label>
            {/* Lembrete das regras: os itens do termo de hoje, sem texto novo. */}
            <ul className="space-y-1 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
              <li>{TERMO_COMUNIDADE_ITENS[1]}</li>
              <li>{TERMO_COMUNIDADE_ITENS[2]}</li>
            </ul>
            {publicar.error && (
              <p role="alert" className="text-sm text-[#D92D20] dark:text-[#F97066]">
                {publicar.error.message}
              </p>
            )}
          </form>
        </BottomSheet>
      </>
    );
  }

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
