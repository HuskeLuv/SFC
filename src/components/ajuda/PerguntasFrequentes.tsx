'use client';

import React, { useEffect, useId, useState } from 'react';
import {
  CATEGORIAS_FAQ,
  EMAIL_SUPORTE,
  FAQ,
  type BlocoResposta,
  type PerguntaFaq,
} from '@/content/faq';

/**
 * Perguntas Frequentes da página Ajuda: acordeão por categoria (várias abertas ao mesmo tempo).
 * Um link `/ajuda#<id>` já abre a pergunta correspondente.
 */

function Bloco({ bloco }: { bloco: BlocoResposta }) {
  if (bloco.tipo === 'passos') {
    return (
      <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-mf-patrimonio dark:marker:text-mf-tranquilidade">
        {bloco.itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }
  if (bloco.tipo === 'aviso') {
    return (
      <p className="rounded-lg border border-[#DCE6F2] bg-[#EDF2F8] px-3 py-2 text-mf-seguranca dark:border-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
        {bloco.texto}
      </p>
    );
  }
  return <p>{bloco.texto}</p>;
}

function ItemFaq({
  item,
  aberto,
  onAlternar,
}: {
  item: PerguntaFaq;
  aberto: boolean;
  onAlternar: () => void;
}) {
  const base = useId();
  const botaoId = `${base}-pergunta`;
  const painelId = `${base}-resposta`;
  return (
    <li id={item.id} className="scroll-mt-24">
      <h3>
        <button
          type="button"
          id={botaoId}
          aria-expanded={aberto}
          aria-controls={painelId}
          onClick={onAlternar}
          className="flex min-h-11 w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mf-outside dark:text-white/90 dark:hover:bg-white/[0.03] sm:px-5"
        >
          <span className="min-w-0 break-words">{item.pergunta}</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className={`mt-0.5 shrink-0 text-gray-500 transition-transform motion-reduce:transition-none dark:text-gray-400 ${
              aberto ? 'rotate-180' : ''
            }`}
          >
            <path
              d="M5 7.5l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </h3>
      <div
        id={painelId}
        role="region"
        aria-labelledby={botaoId}
        hidden={!aberto}
        className="space-y-3 px-4 pb-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:px-5"
      >
        {item.resposta.map((bloco, i) => (
          <Bloco key={i} bloco={bloco} />
        ))}
      </div>
    </li>
  );
}

export default function PerguntasFrequentes({ itens = FAQ }: { itens?: PerguntaFaq[] }) {
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());

  // Âncora (/ajuda#id): abre a pergunta e rola até ela.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !itens.some((i) => i.id === id)) return;
    setAbertas((s) => new Set(s).add(id));
    document.getElementById(id)?.scrollIntoView();
  }, [itens]);

  const alternar = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03] sm:p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Perguntas frequentes
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Respostas rápidas sobre o uso do My Finance. Toque em uma pergunta para ver a resposta.
        </p>
      </section>

      {CATEGORIAS_FAQ.map((categoria) => {
        const daCategoria = itens.filter((i) => i.categoria === categoria);
        if (daCategoria.length === 0) return null;
        return (
          <section key={categoria} aria-label={categoria}>
            <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-mf-patrimonio uppercase dark:text-mf-tranquilidade">
              {categoria}
            </h2>
            <ul className="divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-white/[0.05] dark:bg-white/[0.03]">
              {daCategoria.map((item) => (
                <ItemFaq
                  key={item.id}
                  item={item}
                  aberto={abertas.has(item.id)}
                  onAlternar={() => alternar(item.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03] sm:p-6">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
          Não encontrou sua resposta?
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Escreva para o suporte:{' '}
          <a
            href={`mailto:${EMAIL_SUPORTE}`}
            className="font-medium break-all text-mf-patrimonio hover:underline dark:text-mf-tranquilidade"
          >
            {EMAIL_SUPORTE}
          </a>
        </p>
      </section>
    </div>
  );
}
