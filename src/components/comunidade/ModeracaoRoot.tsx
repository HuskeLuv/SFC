'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  useDefinirCargo,
  useDenunciasAbertas,
  useEquipeComunidade,
  useModerar,
} from '@/hooks/useComunidade';
import type { DenunciaComunidade, MeComunidadeResponse } from '@/types/comunidade';
import { tempoRelativo } from '@/utils/comunidadeTexto';
import { ComunidadeGate } from './ComunidadeGate';
import {
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  CARD_CLASS,
  CabecalhoAutor,
  INPUT_CLASS,
  TextoComLinks,
} from './shared';
import { useConfirmacoes } from './useConfirmacoes';

function CartaoDenuncia({
  d,
  onConfirmar,
}: {
  d: DenunciaComunidade;
  onConfirmar: ReturnType<typeof useConfirmacoes>['pedir'];
}) {
  const moderar = useModerar();
  const alvo = d.alvo.tipo === 'post' ? d.alvo.post : d.alvo.comentario;
  const postId = d.alvo.tipo === 'post' ? d.alvo.post.id : d.alvo.comentario.postId;
  const equipe = alvo.autor.selos.includes('equipe');

  return (
    <li className={CARD_CLASS}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-error-50 px-2 py-0.5 font-semibold text-error-600 dark:bg-error-500/10 dark:text-error-400">
          {d.motivo}
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          {d.alvo.tipo === 'post' ? 'Publicação' : 'Comentário'} · denunciado por{' '}
          {d.denunciante.nome} {tempoRelativo(d.createdAt)}
          {d.totalNoAlvo > 1 && ` · ${d.totalNoAlvo} denúncias`}
        </span>
      </div>
      {d.detalhe && (
        <p className="mt-2 text-sm italic text-gray-600 dark:text-gray-400">“{d.detalhe}”</p>
      )}
      <div className="mt-3 rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
        <CabecalhoAutor
          autor={alvo.autor}
          createdAt={alvo.createdAt}
          editadoEm={alvo.editadoEm}
          categoria={d.alvo.tipo === 'post' ? d.alvo.post.categoria : undefined}
          tamanhoAvatar={32}
        />
        <TextoComLinks
          texto={alvo.conteudo}
          className="mt-2 text-sm text-gray-700 dark:text-gray-300"
        />
        {alvo.oculto && (
          <p className="mt-2 text-xs font-medium text-error-600">Já removido da comunidade</p>
        )}
      </div>
      {moderar.error && <p className="mt-2 text-sm text-error-600">{moderar.error.message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!alvo.oculto && (
          <button
            type="button"
            className="inline-flex items-center rounded-lg bg-error-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-error-600"
            onClick={() =>
              onConfirmar(
                d.alvo.tipo === 'post'
                  ? { tipo: 'ocultar-post', postId }
                  : { tipo: 'ocultar-comentario', commentId: alvo.id, postId },
              )
            }
          >
            Remover conteúdo
          </button>
        )}
        <button
          type="button"
          className={BOTAO_SECUNDARIO}
          disabled={moderar.isPending}
          onClick={() => moderar.mutate({ tipo: 'descartar-denuncia', denunciaId: d.id })}
        >
          Manter (descartar denúncia)
        </button>
        {!equipe && (
          <button
            type="button"
            className={BOTAO_SECUNDARIO}
            onClick={() =>
              onConfirmar({ tipo: 'suspender', userId: alvo.autor.id, nome: alvo.autor.nome })
            }
          >
            Suspender autor
          </button>
        )}
        <Link href={`/comunidade/${postId}`} className={BOTAO_SECUNDARIO}>
          Ver publicação
        </Link>
      </div>
    </li>
  );
}

function Equipe() {
  const { data, isLoading, error } = useEquipeComunidade(true);
  const definir = useDefinirCargo();
  const [email, setEmail] = useState('');

  return (
    <section className={CARD_CLASS}>
      <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Equipe My Finance
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Quem está na equipe ganha o selo “Equipe My Finance”, modera denúncias e fixa publicações. A
        pessoa precisa ter entrado na comunidade antes.
      </p>
      {isLoading && <p className="mt-3 text-sm text-gray-500">Carregando…</p>}
      {error && <p className="mt-3 text-sm text-error-600">{error.message}</p>}
      {data && (
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {data.equipe.length === 0 && (
            <li className="py-2 text-sm text-gray-500">Ninguém na equipe ainda.</li>
          )}
          {data.equipe.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                {m.nome} <span className="text-gray-400">· {m.email}</span>
              </span>
              <button
                type="button"
                className="text-sm text-error-600 hover:underline disabled:opacity-50"
                disabled={definir.isPending}
                onClick={() => definir.mutate({ email: m.email, cargo: 'membro' })}
              >
                Remover da equipe
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          definir.mutate({ email, cargo: 'equipe' }, { onSuccess: () => setEmail('') });
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@exemplo.com"
          aria-label="E-mail do novo membro da equipe"
          className={`${INPUT_CLASS} flex-1`}
        />
        <button type="submit" className={BOTAO_PRIMARIO} disabled={definir.isPending}>
          Adicionar à equipe
        </button>
      </form>
      {definir.error && <p className="mt-2 text-sm text-error-600">{definir.error.message}</p>}
    </section>
  );
}

function Moderacao({ me }: { me: MeComunidadeResponse }) {
  const { data, isLoading, error } = useDenunciasAbertas(me.moderador);
  const { pedir, modal } = useConfirmacoes();

  if (!me.moderador) {
    return <div className={`${CARD_CLASS} text-sm text-gray-500`}>Acesso restrito à equipe.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/comunidade"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
      >
        ← Voltar para a comunidade
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">Moderação</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Publicações entram no ar na hora; aqui a equipe revisa o que foi denunciado.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
          Denúncias abertas {data ? `(${data.denuncias.length})` : ''}
        </h2>
        {isLoading && <p className="text-sm text-gray-500">Carregando…</p>}
        {error && <p className="text-sm text-error-600">{error.message}</p>}
        {data && data.denuncias.length === 0 && (
          <div className={`${CARD_CLASS} text-sm text-gray-500 dark:text-gray-400`}>
            Nenhuma denúncia pendente. 🎉
          </div>
        )}
        <ul className="space-y-3">
          {data?.denuncias.map((d) => (
            <CartaoDenuncia key={d.id} d={d} onConfirmar={pedir} />
          ))}
        </ul>
      </section>

      {me.admin && <Equipe />}
      {modal}
    </div>
  );
}

export default function ModeracaoRoot() {
  return <ComunidadeGate>{(me) => <Moderacao me={me} />}</ComunidadeGate>;
}
