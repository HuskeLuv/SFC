'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthOptional } from '@/context/AuthContext';
import { useCsrf } from '@/hooks/useCsrf';
import { CSAT_COMENTARIO_MAX } from '@/lib/csat/regras';

/**
 * Pesquisa de satisfação no app (ClickUp 86e3vmyv7): cartão discreto, não bloqueante, no canto da
 * tela. Quem decide se aparece é o servidor (GET /api/csat, regras em src/lib/csat/regras.ts); aqui
 * só esperamos o usuário já estar usando o app (ESPERA_MS depois de carregar, nunca na abertura da
 * tela principal) e não perguntamos com consultor agindo por cliente nem nas telas de admin.
 */

const ESPERA_MS = 25_000;
const AGRADECIMENTO_MS = 4_000;
/** Já checado nesta aba: não pergunta de novo ao servidor a cada recarga. */
const CHAVE_SESSAO = 'mf_csat_checado';
const NOTAS = [1, 2, 3, 4, 5] as const;

type Fase = 'oculto' | 'pergunta' | 'enviando' | 'obrigado';

function jaChecadoNestaAba(): boolean {
  try {
    return window.sessionStorage.getItem(CHAVE_SESSAO) === '1';
  } catch {
    return false;
  }
}

function marcarChecado() {
  try {
    window.sessionStorage.setItem(CHAVE_SESSAO, '1');
  } catch {
    // sem storage: só checa de novo na próxima recarga
  }
}

export default function PesquisaSatisfacaoCard() {
  const auth = useAuthOptional();
  const pathname = usePathname();
  const { csrfFetch } = useCsrf();
  const [fase, setFase] = useState<Fase>('oculto');
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const checouRef = useRef(false);

  const autenticado = Boolean(auth?.isAuthenticated && auth.user);
  const personificando = Boolean(auth?.actingClient);
  const telaAdmin = pathname?.startsWith('/admin') ?? false;
  const podeChecar = autenticado && !auth?.isLoading && !personificando && !telaAdmin;

  useEffect(() => {
    if (!podeChecar || checouRef.current || jaChecadoNestaAba()) return;
    const timer = window.setTimeout(async () => {
      if (checouRef.current) return;
      checouRef.current = true;
      marcarChecado();
      try {
        const res = await fetch('/api/csat', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { mostrar?: boolean };
        if (data.mostrar) setFase('pergunta');
      } catch {
        // pesquisa é opcional: falha silenciosa
      }
    }, ESPERA_MS);
    return () => window.clearTimeout(timer);
  }, [podeChecar]);

  useEffect(() => {
    if (fase !== 'obrigado') return;
    const t = window.setTimeout(() => setFase('oculto'), AGRADECIMENTO_MS);
    return () => window.clearTimeout(t);
  }, [fase]);

  // Começou a agir por um cliente (ou foi para o admin) com o cartão aberto: some sem gravar nada.
  if (fase === 'oculto' || personificando || telaAdmin) return null;

  const enviar = async (corpo: Record<string, unknown>, depois: Fase) => {
    setErro(null);
    setFase('enviando');
    try {
      const res = await csrfFetch('/api/csat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      if (!res.ok && res.status !== 409) throw new Error(String(res.status));
      setFase(depois);
    } catch {
      setErro('Não foi possível enviar agora. Tente de novo em instantes.');
      setFase('pergunta');
    }
  };

  const agoraNao = () => enviar({ acao: 'adiar' }, 'oculto');
  const responder = () => {
    if (nota === null) return;
    const texto = comentario.trim();
    void enviar({ acao: 'responder', nota, ...(texto ? { comentario: texto } : {}) }, 'obrigado');
  };

  const enviando = fase === 'enviando';

  return (
    <section
      aria-label="Pesquisa de satisfação"
      className="fixed right-4 bottom-20 z-[9990] w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-gray-200 bg-white p-4 shadow-xl max-lg:bottom-[calc(var(--mf-bottom-nav-h,0px)+5rem)] print:hidden dark:border-gray-800 dark:bg-gray-900"
    >
      {fase === 'obrigado' ? (
        <p
          className="text-sm font-medium text-mf-seguranca dark:text-mf-tranquilidade"
          role="status"
        >
          Obrigado pela sua avaliação! Ela nos ajuda a melhorar o My Finance.
        </p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-mf-potencia dark:text-gray-100">
              De 1 a 5, o quanto você está satisfeito com sua experiência com o My Finance?
            </p>
            <button
              type="button"
              onClick={agoraNao}
              disabled={enviando}
              aria-label="Fechar (perguntar depois)"
              className="-mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-mf-escolha hover:text-mf-potencia disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-gray-100"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div role="radiogroup" aria-label="Nota de 1 a 5" className="mt-3 grid grid-cols-5 gap-2">
            {NOTAS.map((n) => {
              const marcada = nota === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={marcada}
                  disabled={enviando}
                  onClick={() => setNota(n)}
                  className={`h-11 rounded-xl border text-base font-semibold transition disabled:opacity-60 ${
                    marcada
                      ? 'border-mf-patrimonio bg-mf-patrimonio text-white dark:border-mf-tranquilidade dark:bg-mf-tranquilidade dark:text-mf-potencia'
                      : 'border-gray-200 text-mf-seguranca hover:border-mf-tranquilidade hover:bg-mf-patrimonio/5 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span>Nada satisfeito</span>
            <span>Muito satisfeito</span>
          </div>

          {nota !== null ? (
            <label className="mt-3 block">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Quer contar o porquê? (opcional)
              </span>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value.slice(0, CSAT_COMENTARIO_MAX))}
                maxLength={CSAT_COMENTARIO_MAX}
                rows={2}
                disabled={enviando}
                className="mt-1 block w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-mf-potencia focus:border-mf-patrimonio focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-mf-tranquilidade"
              />
            </label>
          ) : null}

          {erro ? (
            <p className="mt-2 text-xs text-mf-patrimonio dark:text-mf-tranquilidade" role="alert">
              {erro}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={agoraNao}
              disabled={enviando}
              className="min-h-10 rounded-xl px-3 text-sm font-medium text-gray-500 hover:text-mf-potencia disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={responder}
              disabled={nota === null || enviando}
              className="min-h-10 rounded-xl bg-mf-patrimonio px-4 text-sm font-medium text-white hover:bg-mf-seguranca disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
