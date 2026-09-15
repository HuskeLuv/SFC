'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/button/Button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { formatBRL } from '@/utils/format';
import {
  useAplicarTransacoes,
  useCaixaEntrada,
  useIgnorarTransacoes,
  useLinhasFluxo,
  type PendenteDTO,
} from '@/hooks/useConexoesBancarias';

const SEM_LINHA = '';

function rotuloSugestao(p: PendenteDTO): string {
  switch (p.sugestao.tipo) {
    case 'transferencia':
      return 'Transferência própria / fatura — sugerimos ignorar';
    case 'investimento':
      return 'Aporte ou resgate — já entra pela Carteira; sugerimos ignorar';
    case 'linha':
      return p.sugestao.rotulo ? `Sugestão: ${p.sugestao.rotulo}` : 'Sem sugestão';
    default:
      return 'Sem sugestão';
  }
}

/**
 * Caixa de entrada: transações importadas ainda não lançadas. Cada linha vem
 * com a linha do fluxo sugerida pela categoria do banco; o usuário confirma,
 * troca ou ignora. "Aplicar sugeridas" lança tudo que tem sugestão de linha.
 */
export default function CaixaEntrada({ onAviso }: { onAviso: (msg: string) => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, isFetching } = useCaixaEntrada(page);
  const { data: linhas } = useLinhasFluxo();
  const aplicar = useAplicarTransacoes();
  const ignorar = useIgnorarTransacoes();

  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  // Pré-preenche a escolha com a sugestão sempre que a página muda.
  useEffect(() => {
    if (!data) return;
    setEscolhas((prev) => {
      const next = { ...prev };
      for (const p of data.pendentes) {
        if (next[p.id] === undefined) next[p.id] = p.sugestao.itemId ?? SEM_LINHA;
      }
      return next;
    });
  }, [data]);

  const ocupado = aplicar.isPending || ignorar.isPending;
  const pendentes = useMemo(() => data?.pendentes ?? [], [data]);
  const comSugestao = useMemo(
    () => pendentes.filter((p) => p.sugestao.tipo === 'linha' && p.sugestao.itemId),
    [pendentes],
  );
  const ignoraveis = useMemo(
    () =>
      pendentes.filter(
        (p) => p.sugestao.tipo === 'transferencia' || p.sugestao.tipo === 'investimento',
      ),
    [pendentes],
  );

  const alternar = (id: string) =>
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function aplicarIds(ids: string[]) {
    const aplicacoes = ids
      .map((id) => ({ id, itemId: escolhas[id] ?? SEM_LINHA }))
      .filter((a) => a.itemId !== SEM_LINHA);
    if (aplicacoes.length === 0) {
      onAviso('Escolha uma linha do fluxo para cada transação marcada.');
      return;
    }
    try {
      const r = await aplicar.mutateAsync({ aplicacoes });
      setMarcadas(new Set());
      onAviso(
        `${r.aplicadas} ${r.aplicadas === 1 ? 'transação lançada' : 'transações lançadas'} no fluxo de caixa (${r.celulas.length} ${r.celulas.length === 1 ? 'célula atualizada' : 'células atualizadas'}).`,
      );
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'Não foi possível lançar');
    }
  }

  async function ignorarIds(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const r = await ignorar.mutateAsync({ ids });
      setMarcadas(new Set());
      onAviso(
        `${r.ignoradas} ${r.ignoradas === 1 ? 'transação ignorada' : 'transações ignoradas'}.`,
      );
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'Não foi possível ignorar');
    }
  }

  if (isLoading) return <LoadingSpinner size="md" text="Carregando a Caixa de entrada..." />;
  if (isError) return <p className="text-sm text-red-600 dark:text-red-400">{error?.message}</p>;
  if (!data || data.total === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Caixa de entrada · {data.total} {data.total === 1 ? 'transação' : 'transações'} para
            revisar
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Confirme a linha do fluxo de caixa de cada transação. A célula do mês passa a ser a soma
            do que você lançar aqui.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => aplicarIds(comSugestao.map((p) => p.id))}
            disabled={ocupado || comSugestao.length === 0}
          >
            Lançar sugeridas ({comSugestao.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => ignorarIds(ignoraveis.map((p) => p.id))}
            disabled={ocupado || ignoraveis.length === 0}
          >
            Ignorar transferências ({ignoraveis.length})
          </Button>
        </div>
      </div>

      {marcadas.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
          <span className="text-gray-600 dark:text-gray-300">{marcadas.size} marcada(s)</span>
          <Button size="sm" onClick={() => aplicarIds([...marcadas])} disabled={ocupado}>
            Lançar marcadas
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => ignorarIds([...marcadas])}
            disabled={ocupado}
          >
            Ignorar marcadas
          </Button>
        </div>
      ) : null}

      <div className={TABLE_STYLES.wrapper}>
        <Table className={TABLE_STYLES.table} aria-label="Caixa de entrada">
          <TableHeader>
            <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              {['', 'Data', 'Transação', 'Valor', 'Linha do fluxo de caixa', ''].map((h, i) => (
                <TableCell
                  key={i}
                  isHeader
                  className={`${TABLE_STYLES.th} ${h === 'Valor' ? 'text-right' : 'text-left'}`}
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendentes.map((p) => {
              const saida = p.amount < 0; // negativo = saída (conta e cartão)
              return (
                <TableRow key={p.id} className={TABLE_STYLES.row}>
                  <TableCell className={TABLE_STYLES.td}>
                    <input
                      id={`caixa-${p.id}`}
                      type="checkbox"
                      aria-label={`Marcar ${p.description}`}
                      checked={marcadas.has(p.id)}
                      onChange={() => alternar(p.id)}
                    />
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.td} whitespace-nowrap`}>
                    {new Date(p.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                  </TableCell>
                  <TableCell className={TABLE_STYLES.td}>
                    <div className="text-gray-800 dark:text-white/90">
                      {p.merchantName ?? p.description}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {p.contaNome}
                      {p.providerCategory ? ` · ${p.providerCategory}` : ''}
                    </div>
                  </TableCell>
                  <TableCell
                    className={`${TABLE_STYLES.td} whitespace-nowrap text-right font-medium tabular-nums ${saida ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                  >
                    {saida ? '−' : '+'}
                    {formatBRL(Math.abs(p.amount))}
                  </TableCell>
                  <TableCell className={TABLE_STYLES.td}>
                    <select
                      id={`linha-${p.id}`}
                      aria-label={`Linha para ${p.description}`}
                      className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                      value={escolhas[p.id] ?? SEM_LINHA}
                      onChange={(e) => setEscolhas((s) => ({ ...s, [p.id]: e.target.value }))}
                    >
                      <option value={SEM_LINHA}>— escolher linha —</option>
                      {(linhas ?? []).map((l) => (
                        <option key={l.itemId} value={l.itemId}>
                          {l.rotulo}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {rotuloSugestao(p)}
                    </div>
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.td} whitespace-nowrap`}>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => aplicarIds([p.id])} disabled={ocupado}>
                        Lançar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ignorarIds([p.id])}
                        disabled={ocupado}
                      >
                        Ignorar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          página {data.page} de {Math.max(1, data.totalPages)}
          {isFetching ? ' · atualizando…' : ''}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
