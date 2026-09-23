'use client';

import React, { useState } from 'react';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { COMUNIDADE_LIMITES, TERMO_COMUNIDADE_ITENS } from '@/constants/comunidade';
import { useEntrarComunidade } from '@/hooks/useComunidade';
import type { MeComunidadeResponse } from '@/types/comunidade';
import { AvatarAutor, BOTAO_PRIMARIO, CARD_CLASS, INPUT_CLASS } from './shared';

/** Primeira visita (ou termo em versão nova): apresentação + aceite do termo. */
export function EntradaComunidade({ me }: { me: MeComunidadeResponse }) {
  const entrar = useEntrarComunidade();
  const [aceite, setAceite] = useState(false);
  const [bio, setBio] = useState(me.perfil?.bio ?? '');
  const termoNovo = me.perfil != null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section
        className="rounded-2xl px-6 py-7 text-white sm:px-8"
        style={{
          background: `linear-gradient(118deg, #1c2a44 0%, ${MYFINANCE_BRAND.seguranca} 52%, ${MYFINANCE_BRAND.patrimonio} 100%)`,
        }}
      >
        <div
          className="text-xs font-semibold uppercase tracking-[.22em]"
          style={{ color: '#8fc0f7' }}
        >
          Comunidade My Finance
        </div>
        <h2 className="mt-2 text-2xl font-bold">
          {termoNovo ? 'O termo da comunidade mudou' : 'Bem-vindo à comunidade'}
        </h2>
        <p className="mt-1.5 text-sm text-white/80">
          {termoNovo
            ? 'Leia a nova versão e aceite para continuar participando.'
            : 'Troque experiências, celebre conquistas e faça network com quem segue a mesma metodologia.'}
        </p>
      </section>

      <section className={CARD_CLASS}>
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Como você aparece
        </h3>
        <div className="mt-3 flex items-center gap-3">
          <AvatarAutor autor={me.usuario} tamanho={48} />
          <div>
            <p className="font-medium text-gray-800 dark:text-white/90">{me.usuario.nome}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Nome e foto da sua conta — altere em Perfil quando quiser.
            </p>
          </div>
        </div>
        <label className="mt-4 block text-sm text-gray-700 dark:text-gray-300">
          Sobre você (opcional)
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={COMUNIDADE_LIMITES.bioMaxChars}
            rows={2}
            placeholder="Ex.: Saindo das dívidas em 2026, apaixonada por planilhas."
            className={`${INPUT_CLASS} mt-1 resize-none`}
          />
        </label>
      </section>

      <section className={CARD_CLASS}>
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Termo de uso da comunidade
          <span className="ml-2 text-xs font-normal text-gray-400">versão {me.termoVersao}</span>
        </h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600 dark:text-gray-400">
          {TERMO_COMUNIDADE_ITENS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <label className="mt-5 flex cursor-pointer items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-0.5 accent-brand-500"
          />
          Li e aceito o termo de uso da comunidade.
        </label>
        {entrar.error && (
          <p className="mt-3 text-sm text-error-600 dark:text-error-400">{entrar.error.message}</p>
        )}
        <button
          type="button"
          disabled={!aceite || entrar.isPending}
          onClick={() => entrar.mutate({ aceitarTermo: true, bio: bio.trim() || null })}
          className={`${BOTAO_PRIMARIO} mt-5 w-full sm:w-auto`}
        >
          {entrar.isPending ? 'Entrando…' : 'Entrar na comunidade'}
        </button>
      </section>
    </div>
  );
}
