'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { MYFINANCE_BRAND } from '@/constants/brandColors';

/**
 * Assistente de IA — botão flutuante + painel de conversa (Fase 1, MVP).
 * Só aparece quando GET /api/assistente diz `habilitado`. A conversa vive na
 * sessão (decisão Fase 0: sem persistência no MVP). Propostas de lançamento
 * chegam como cartão e só gravam depois do clique em "Confirmar".
 */

interface Proposta {
  token: string;
  tipo: 'despesa' | 'entrada';
  linha: string;
  grupo: string;
  valor: number;
  mesNome: string;
  ano: number;
  descricao: string | null;
  valorAtual: number;
  valorNovo: number;
  expiraEm: number;
}

interface Uso {
  usadas: number;
  limite: number;
  restantes: number;
  economico: boolean;
}

interface Mensagem {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  proposta?: Proposta;
  propostaEstado?: 'pendente' | 'confirmada' | 'cancelada';
}

const SUGESTOES = [
  'Quanto gastei este mês?',
  'Como está minha carteira?',
  'Estou dentro do orçamento?',
  'Gastei 45,90 no mercado hoje',
];

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AssistentePanel() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const [habilitado, setHabilitado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [uso, setUso] = useState<Uso | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    let ativo = true;
    fetch('/api/assistente', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { habilitado?: boolean; uso?: Uso | null } | null) => {
        if (!ativo || !d) return;
        setHabilitado(Boolean(d.habilitado));
        setUso(d.uso ?? null);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    if (aberto) {
      listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
      inputRef.current?.focus();
    }
  }, [aberto, mensagens, carregando]);

  const adicionar = useCallback((m: Omit<Mensagem, 'id'>) => {
    idRef.current += 1;
    const nova = { ...m, id: idRef.current };
    setMensagens((prev) => [...prev, nova]);
    return nova.id;
  }, []);

  const enviar = useCallback(
    async (conteudo: string) => {
      const mensagem = conteudo.trim();
      if (!mensagem || carregando) return;
      setTexto('');
      adicionar({ role: 'user', content: mensagem });
      setCarregando(true);
      try {
        const historico = mensagens
          .filter((m) => m.content)
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content }));
        const res = await csrfFetch('/api/assistente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mensagem, historico }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          resposta?: string;
          proposta?: Proposta;
          uso?: Uso;
          error?: string;
        };
        if (data.uso) setUso(data.uso);
        if (!res.ok) {
          adicionar({
            role: 'assistant',
            content: data.error ?? 'Não consegui responder agora. Tente de novo em instantes.',
          });
          return;
        }
        adicionar({
          role: 'assistant',
          content: data.resposta ?? '',
          proposta: data.proposta,
          propostaEstado: data.proposta ? 'pendente' : undefined,
        });
      } catch {
        adicionar({ role: 'assistant', content: 'Falha de conexão. Tente de novo.' });
      } finally {
        setCarregando(false);
      }
    },
    [adicionar, carregando, csrfFetch, mensagens],
  );

  const confirmar = useCallback(
    async (m: Mensagem) => {
      if (!m.proposta || confirmando !== null) return;
      setConfirmando(m.id);
      try {
        const res = await csrfFetch('/api/assistente/confirmar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: m.proposta.token }),
        });
        const data = (await res.json().catch(() => ({}))) as { resumo?: string; error?: string };
        if (!res.ok) {
          adicionar({ role: 'assistant', content: data.error ?? 'Não consegui registrar.' });
          return;
        }
        setMensagens((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, propostaEstado: 'confirmada' } : x)),
        );
        adicionar({ role: 'assistant', content: data.resumo ?? 'Registrado.' });
        void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
      } catch {
        adicionar({ role: 'assistant', content: 'Falha de conexão ao registrar. Tente de novo.' });
      } finally {
        setConfirmando(null);
      }
    },
    [adicionar, confirmando, csrfFetch, queryClient],
  );

  const cancelar = useCallback(
    (m: Mensagem) => {
      setMensagens((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, propostaEstado: 'cancelada' } : x)),
      );
      adicionar({ role: 'assistant', content: 'Certo, não registrei nada.' });
    },
    [adicionar],
  );

  if (!habilitado) return null;

  const esgotado = uso ? uso.restantes <= 0 : false;

  return (
    <>
      <button
        type="button"
        aria-label={aberto ? 'Fechar assistente' : 'Abrir assistente'}
        onClick={() => setAberto((v) => !v)}
        className="fixed right-4 bottom-4 z-[9997] flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition hover:opacity-90 print:hidden"
        style={{ backgroundColor: MYFINANCE_BRAND.outside }}
      >
        {aberto ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 5h16v11H8l-4 4V5z" />
            <path d="M8 9h8M8 12h5" />
          </svg>
        )}
      </button>

      {aberto && (
        <section
          role="dialog"
          aria-label="Assistente My Finance"
          className="fixed right-4 bottom-20 z-[9997] flex w-[calc(100%-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl print:hidden dark:border-gray-800 dark:bg-gray-900"
          style={{ height: 'min(560px, calc(100vh - 7rem))' }}
        >
          <header
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{ backgroundColor: MYFINANCE_BRAND.seguranca }}
          >
            <div>
              <p className="text-sm font-semibold">Assistente My Finance</p>
              <p className="text-xs opacity-80">
                {uso
                  ? `${uso.restantes} de ${uso.limite} mensagens restantes este mês`
                  : 'Versão de testes'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMensagens([])}
              className="rounded-md px-2 py-1 text-xs opacity-80 hover:opacity-100"
              title="Limpar conversa"
            >
              Limpar
            </button>
          </header>

          <div ref={listaRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {mensagens.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Pergunte sobre a sua carteira, o fluxo de caixa, o orçamento ou as dívidas. Para
                  registrar um gasto, escreva por exemplo &quot;gastei 45,90 no mercado&quot;.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviar(s)}
                      className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">
                  Suas perguntas e um resumo dos seus dados são enviados à Anthropic (EUA) para
                  gerar a resposta. O assistente não recomenda investimentos.
                </p>
              </div>
            )}

            {mensagens.map((m) => (
              <div
                key={m.id}
                className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm text-white'
                      : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm whitespace-pre-wrap text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                  }
                  style={
                    m.role === 'user' ? { backgroundColor: MYFINANCE_BRAND.patrimonio } : undefined
                  }
                >
                  {m.content}
                  {m.proposta && (
                    <div className="mt-2 rounded-lg border border-gray-300 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-900">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {m.proposta.tipo === 'despesa' ? 'Gasto' : 'Receita'} ·{' '}
                        {brl(m.proposta.valor)}
                      </p>
                      <p className="text-gray-700 dark:text-gray-300">
                        Linha: {m.proposta.linha}
                        <br />
                        Grupo: {m.proposta.grupo}
                        <br />
                        Mês: {m.proposta.mesNome}/{m.proposta.ano}
                        {m.proposta.descricao ? (
                          <>
                            <br />
                            Descrição: {m.proposta.descricao}
                          </>
                        ) : null}
                        <br />
                        Célula: {brl(m.proposta.valorAtual)} → {brl(m.proposta.valorNovo)}
                      </p>
                      {m.propostaEstado === 'pendente' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={confirmando !== null}
                            onClick={() => confirmar(m)}
                            className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                            style={{ backgroundColor: MYFINANCE_BRAND.outside }}
                          >
                            {confirmando === m.id ? 'Registrando…' : 'Confirmar'}
                          </button>
                          <button
                            type="button"
                            disabled={confirmando !== null}
                            onClick={() => cancelar(m)}
                            className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-200"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                      {m.propostaEstado === 'confirmada' && (
                        <p className="mt-2 font-medium text-green-600">Registrado.</p>
                      )}
                      {m.propostaEstado === 'cancelada' && (
                        <p className="mt-2 text-gray-500">Cancelado.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {carregando && <p className="text-xs text-gray-400">Pensando…</p>}
          </div>

          <form
            className="border-t border-gray-200 p-3 dark:border-gray-800"
            onSubmit={(e) => {
              e.preventDefault();
              void enviar(texto);
            }}
          >
            {uso?.economico && !esgotado && (
              <p className="mb-2 text-[11px] text-amber-600">
                Você está perto do limite do mês ({uso.restantes} restantes).
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void enviar(texto);
                  }
                }}
                rows={1}
                maxLength={1000}
                disabled={carregando || esgotado}
                placeholder={esgotado ? 'Limite do mês atingido' : 'Escreva sua pergunta…'}
                className="max-h-24 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <button
                type="submit"
                disabled={carregando || esgotado || !texto.trim()}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: MYFINANCE_BRAND.outside }}
              >
                Enviar
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
