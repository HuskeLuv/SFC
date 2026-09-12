'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { useCashflowYear } from '@/context/CashflowYearContext';
import { queryKeys } from '@/lib/queryKeys';
import { MYFINANCE_BRAND } from '@/constants/brandColors';

/**
 * Assistente de IA — botão flutuante + painel de conversa (Fase 1, MVP).
 * Só aparece quando GET /api/assistente diz `habilitado`. A conversa vive na
 * sessão (decisão Fase 0: sem persistência no MVP). Propostas de lançamento
 * chegam como cartão e só gravam depois do clique em "Confirmar" — um mês, ou
 * o ano da planilha inteiro quando o gasto é recorrente (aluguel, escola…).
 * Uma mensagem com vários gastos ("plano de saúde 1.500, internet 300…") vira
 * UM cartão com a lista: o usuário tira o que não quer e confirma tudo de uma
 * vez. O ano aberto na planilha vai junto com a mensagem para o servidor usar
 * como padrão.
 */

interface CelulaProposta {
  mes: number;
  mesNome: string;
  valorAtual: number;
  valorNovo: number;
}

interface Proposta {
  token: string;
  tipo: 'despesa' | 'entrada';
  linha: string;
  grupo: string;
  /** Valor por mês. */
  valor: number;
  modo: 'somar' | 'definir';
  recorrente: boolean;
  /** "setembro/2026" ou "janeiro a dezembro/2026". */
  periodo: string;
  ano: number;
  descricao: string | null;
  celulas: CelulaProposta[];
  valorTotal: number;
  expiraEm: number;
}

interface Uso {
  usadas: number;
  limite: number;
  restantes: number;
  economico: boolean;
}

type EstadoItem = 'pendente' | 'removido' | 'registrado' | 'falhou';

interface ItemProposta extends Proposta {
  estado: EstadoItem;
  erro?: string;
}

interface Mensagem {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  /** Um item = cartão simples; vários = lista com confirmação em lote. */
  propostas?: ItemProposta[];
  propostaEstado?: 'pendente' | 'confirmada' | 'cancelada';
}

interface ItemConfirmado {
  ok: boolean;
  linha: string | null;
  resumo?: string;
  error?: string;
}

const SUGESTOES = [
  'Quanto gastei este mês?',
  'Como está minha carteira?',
  'Estou dentro do orçamento?',
  'Gastei 45,90 no mercado hoje',
  'Meu aluguel é 2.500 por mês',
];

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AssistentePanel() {
  const { csrfFetch } = useCsrf();
  const { year: anoPlanilha } = useCashflowYear();
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
          body: JSON.stringify({ mensagem, historico, anoPlanilha }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          resposta?: string;
          proposta?: Proposta;
          propostas?: Proposta[];
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
        const lista = data.propostas ?? (data.proposta ? [data.proposta] : []);
        adicionar({
          role: 'assistant',
          content: data.resposta ?? '',
          propostas:
            lista.length > 0
              ? lista.map((p) => ({ ...p, estado: 'pendente' as const }))
              : undefined,
          propostaEstado: lista.length > 0 ? 'pendente' : undefined,
        });
      } catch {
        adicionar({ role: 'assistant', content: 'Falha de conexão. Tente de novo.' });
      } finally {
        setCarregando(false);
      }
    },
    [adicionar, anoPlanilha, carregando, csrfFetch, mensagens],
  );

  const confirmar = useCallback(
    async (m: Mensagem) => {
      const itens = (m.propostas ?? []).filter((p) => p.estado === 'pendente');
      if (itens.length === 0 || confirmando !== null) return;
      setConfirmando(m.id);
      try {
        const body =
          itens.length === 1 ? { token: itens[0].token } : { tokens: itens.map((p) => p.token) };
        const res = await csrfFetch('/api/assistente/confirmar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          resumo?: string;
          itens?: ItemConfirmado[];
          error?: string;
        };
        if (!res.ok) {
          adicionar({ role: 'assistant', content: data.error ?? 'Não consegui registrar.' });
          return;
        }
        // Lote: o servidor devolve um resultado por token, na ordem enviada.
        const porToken = new Map<string, ItemConfirmado>();
        if (data.itens) itens.forEach((p, i) => porToken.set(p.token, data.itens![i]));
        setMensagens((prev) =>
          prev.map((x) =>
            x.id === m.id
              ? {
                  ...x,
                  propostaEstado: 'confirmada',
                  propostas: x.propostas?.map((p) => {
                    if (p.estado !== 'pendente') return p;
                    const r = porToken.get(p.token);
                    if (r && !r.ok) return { ...p, estado: 'falhou', erro: r.error };
                    return { ...p, estado: 'registrado' };
                  }),
                }
              : x,
          ),
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

  /** Tira um item da lista antes de confirmar; se não sobrar nenhum, é cancelamento. */
  const removerItem = useCallback(
    (m: Mensagem, token: string) => {
      const restantes = (m.propostas ?? []).filter(
        (p) => p.estado === 'pendente' && p.token !== token,
      );
      if (restantes.length === 0) {
        cancelar(m);
        return;
      }
      setMensagens((prev) =>
        prev.map((x) =>
          x.id === m.id
            ? {
                ...x,
                propostas: x.propostas?.map((p) =>
                  p.token === token ? { ...p, estado: 'removido' } : p,
                ),
              }
            : x,
        ),
      );
    },
    [cancelar],
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
                  registrar um gasto, escreva por exemplo &quot;gastei 45,90 no mercado&quot;; um
                  gasto fixo, como &quot;meu aluguel é 2.500 por mês&quot;, preenche o ano da
                  planilha.
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
                  {m.propostas && m.propostas.length === 1 && (
                    <CartaoUnico
                      item={m.propostas[0]}
                      estado={m.propostaEstado}
                      ocupado={confirmando !== null}
                      registrando={confirmando === m.id}
                      onConfirmar={() => confirmar(m)}
                      onCancelar={() => cancelar(m)}
                    />
                  )}
                  {m.propostas && m.propostas.length > 1 && (
                    <CartaoLote
                      itens={m.propostas}
                      estado={m.propostaEstado}
                      ocupado={confirmando !== null}
                      registrando={confirmando === m.id}
                      onConfirmar={() => confirmar(m)}
                      onCancelar={() => cancelar(m)}
                      onRemover={(token) => removerItem(m, token)}
                    />
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

interface CartaoProps {
  estado: Mensagem['propostaEstado'];
  ocupado: boolean;
  registrando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

function BotoesCartao({
  rotulo,
  ocupado,
  registrando,
  onConfirmar,
  onCancelar,
}: Omit<CartaoProps, 'estado'> & { rotulo: string }) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        disabled={ocupado}
        onClick={onConfirmar}
        className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: MYFINANCE_BRAND.outside }}
      >
        {registrando ? 'Registrando…' : rotulo}
      </button>
      <button
        type="button"
        disabled={ocupado}
        onClick={onCancelar}
        className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-200"
      >
        Cancelar
      </button>
    </div>
  );
}

/** Cartão do lançamento único (um mês ou o ano inteiro de uma linha). */
function CartaoUnico({ item, estado, ...botoes }: CartaoProps & { item: ItemProposta }) {
  return (
    <div className="mt-2 rounded-lg border border-gray-300 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-900">
      <p className="font-semibold text-gray-900 dark:text-gray-100">
        {item.tipo === 'despesa' ? 'Gasto' : 'Receita'}
        {item.recorrente ? ' mensal' : ''} · {brl(item.valor)}
        {item.recorrente ? ' por mês' : ''}
      </p>
      <p className="text-gray-700 dark:text-gray-300">
        Linha: {item.linha}
        <br />
        Grupo: {item.grupo}
        <br />
        {item.recorrente ? 'Período' : 'Mês'}: {item.periodo}
        {item.recorrente ? (
          <>
            {' '}
            ({item.celulas.length} meses, {brl(item.valorTotal)} no total)
            <br />
            Modo:{' '}
            {item.modo === 'definir'
              ? 'a célula de cada mês passa a valer este valor'
              : 'o valor entra em cima do que já está em cada mês'}
          </>
        ) : null}
        {item.descricao ? (
          <>
            <br />
            Descrição: {item.descricao}
          </>
        ) : null}
        {!item.recorrente && item.celulas[0] ? (
          <>
            <br />
            Célula: {brl(item.celulas[0].valorAtual)} → {brl(item.celulas[0].valorNovo)}
          </>
        ) : null}
      </p>
      {item.recorrente && (
        <ul className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-gray-600 dark:text-gray-400">
          {item.celulas.map((c) => (
            <li key={c.mes}>
              {c.mesNome.slice(0, 3)}: {brl(c.valorAtual)} → {brl(c.valorNovo)}
            </li>
          ))}
        </ul>
      )}
      {estado === 'pendente' && <BotoesCartao rotulo="Confirmar" {...botoes} />}
      {estado === 'confirmada' && <p className="mt-2 font-medium text-green-600">Registrado.</p>}
      {estado === 'cancelada' && <p className="mt-2 text-gray-500">Cancelado.</p>}
    </div>
  );
}

/**
 * Cartão com vários lançamentos de uma mensagem só: uma linha por item, "tirar"
 * antes de confirmar, e um botão que grava todos os que sobraram.
 */
function CartaoLote({
  itens,
  estado,
  onRemover,
  ...botoes
}: CartaoProps & { itens: ItemProposta[]; onRemover: (token: string) => void }) {
  const pendentes = itens.filter((p) => p.estado === 'pendente');
  const totalMes = pendentes.reduce((acc, p) => acc + (p.recorrente ? p.valor : 0), 0);
  const totalUnico = pendentes.reduce((acc, p) => acc + (p.recorrente ? 0 : p.valor), 0);
  const comValor = pendentes.some((p) => p.celulas.some((c) => c.valorAtual !== 0));
  return (
    <div className="mt-2 rounded-lg border border-gray-300 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-900">
      <p className="font-semibold text-gray-900 dark:text-gray-100">
        {itens.length} lançamentos
        {totalMes > 0 ? ` · ${brl(totalMes)} por mês` : ''}
        {totalUnico > 0 ? ` · ${brl(totalUnico)} no mês` : ''}
      </p>
      <ul className="mt-1 divide-y divide-gray-200 dark:divide-gray-700">
        {itens.map((p) => (
          <li
            key={p.token}
            className={`flex items-start justify-between gap-2 py-1 ${
              p.estado === 'removido' ? 'text-gray-400 line-through' : ''
            }`}
          >
            <span className="text-gray-700 dark:text-gray-300">
              <span className="font-medium text-gray-900 dark:text-gray-100">{p.linha}</span>{' '}
              <span className="text-gray-500">({p.grupo.split(' > ').pop()})</span>
              {p.descricao ? <span className="text-gray-500"> — {p.descricao}</span> : null}
              <br />
              {p.tipo === 'entrada' ? 'Receita ' : ''}
              {brl(p.valor)}
              {p.recorrente ? ` por mês · ${p.periodo}` : ` · ${p.periodo}`}
              {p.estado === 'registrado' && (
                <span className="ml-1 font-medium text-green-600">registrado</span>
              )}
              {p.estado === 'falhou' && (
                <span className="ml-1 font-medium text-red-600">{p.erro ?? 'não entrou'}</span>
              )}
            </span>
            {estado === 'pendente' && p.estado === 'pendente' && (
              <button
                type="button"
                disabled={botoes.ocupado}
                onClick={() => onRemover(p.token)}
                aria-label={`Tirar ${p.linha}`}
                title="Tirar da lista"
                className="shrink-0 rounded px-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {estado === 'pendente' && comValor && (
        <p className="mt-1 text-[11px] text-amber-600">
          Alguns meses já têm valor: nos lançamentos mensais o valor novo substitui; nos únicos ele
          entra em cima.
        </p>
      )}
      {estado === 'pendente' && (
        <BotoesCartao
          rotulo={`Confirmar ${pendentes.length === 1 ? '1 lançamento' : `${pendentes.length} lançamentos`}`}
          {...botoes}
        />
      )}
      {estado === 'confirmada' && <p className="mt-2 font-medium text-green-600">Registrado.</p>}
      {estado === 'cancelada' && <p className="mt-2 text-gray-500">Cancelado.</p>}
    </div>
  );
}
