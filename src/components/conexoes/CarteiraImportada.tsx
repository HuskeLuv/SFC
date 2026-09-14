'use client';

import Badge from '@/components/ui/badge/Badge';
import Button from '@/components/ui/button/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { TABLE_HEADER_BG } from '@/constants/brandColors';
import { formatBRL } from '@/utils/format';
import {
  useCarteiraImportada,
  useIgnorarInvestimento,
  useImportarCarteira,
  type EmprestimoImportadoDTO,
  type InvestimentoImportadoDTO,
} from '@/hooks/useConexoesBancarias';

const STATUS: Record<
  string,
  { rotulo: string; cor: 'success' | 'info' | 'warning' | 'error' | 'light' }
> = {
  importado: { rotulo: 'Na Carteira', cor: 'success' },
  vinculado: { rotulo: 'Já estava na Carteira', cor: 'info' },
  pendente: { rotulo: 'Pendente', cor: 'warning' },
  'sem-suporte': { rotulo: 'Cadastrar à mão', cor: 'warning' },
  ignorado: { rotulo: 'Ignorado', cor: 'light' },
  erro: { rotulo: 'Erro', cor: 'error' },
};

const TIPO: Record<string, string> = {
  FIXED_INCOME: 'Renda fixa',
  MUTUAL_FUND: 'Fundo',
  EQUITY: 'Renda variável',
  ETF: 'ETF',
  SECURITY: 'Previdência',
  COE: 'COE',
};

function StatusChip({ status, erro }: { status: string; erro: string | null }) {
  const s = STATUS[status] ?? { rotulo: status, cor: 'light' as const };
  return (
    <span title={erro ?? undefined}>
      <Badge size="sm" color={s.cor}>
        {status === 'importado' && erro === null ? s.rotulo : s.rotulo}
      </Badge>
    </span>
  );
}

function rotuloEmprestimo(l: EmprestimoImportadoDTO): string {
  const st = STATUS[l.importStatus];
  return st ? (l.importStatus === 'importado' ? 'Em Dívidas' : st.rotulo) : l.importStatus;
}

const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-white';
const td = 'px-3 py-2 text-sm';

/**
 * Investimentos e empréstimos que o banco devolveu e como entraram no
 * MyFinance (Carteira / Dívidas). A importação é automática a cada sync;
 * aqui o usuário vê o resultado, reimporta pendências e ignora o que não quer.
 */
export default function CarteiraImportada({ onAviso }: { onAviso: (msg: string) => void }) {
  const { data, isLoading, isError, error } = useCarteiraImportada();
  const importar = useImportarCarteira();
  const ignorar = useIgnorarInvestimento();

  if (isLoading || isError) {
    return isError ? (
      <p className="text-sm text-red-600 dark:text-red-400">{error?.message}</p>
    ) : null;
  }
  if (!data || (data.investimentos.length === 0 && data.emprestimos.length === 0)) return null;

  const pendentes =
    data.investimentos.filter((i) => i.importStatus === 'pendente').length +
    data.emprestimos.filter((l) => l.importStatus === 'pendente').length;

  async function reimportar() {
    try {
      const r = await importar.mutateAsync();
      onAviso(
        `Importação: ${r.importados} na Carteira/Dívidas, ${r.vinculados} já existiam, ${r.semSuporte} para cadastrar à mão, ${r.ignorados} ignorados${r.erros ? `, ${r.erros} com erro` : ''}.`,
      );
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'Não foi possível importar');
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Investimentos e empréstimos do banco
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Entram sozinhos na Carteira e em Dívidas a cada sincronização. O que já existia é só
            vinculado; o que o sistema não reconhece fica para você cadastrar pelo wizard.
          </p>
        </div>
        {pendentes > 0 ? (
          <Button size="sm" onClick={reimportar} disabled={importar.isPending}>
            Importar pendentes ({pendentes})
          </Button>
        ) : null}
      </div>

      {data.investimentos.length > 0 ? (
        <div className="overflow-x-auto">
          <Table aria-label="Investimentos importados">
            <TableHeader>
              <TableRow>
                {['Investimento', 'Tipo', 'Saldo no banco', 'Situação', ''].map((h, i) => (
                  <TableCell
                    key={i}
                    isHeader
                    className={`${th} ${h === 'Saldo no banco' ? 'text-right' : ''}`}
                    style={{ backgroundColor: TABLE_HEADER_BG }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.investimentos.map((i: InvestimentoImportadoDTO) => (
                <TableRow
                  key={i.id}
                  className={`border-b border-gray-100 dark:border-gray-800 ${i.ativo ? '' : 'opacity-60'}`}
                >
                  <TableCell className={td}>
                    <div className="text-gray-800 dark:text-white/90">{i.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {i.banco}
                      {i.code ? ` · ${i.code}` : ''}
                      {i.rate && i.rateType ? ` · ${i.rate}% ${i.rateType}` : ''}
                      {i.dueDate
                        ? ` · vence ${new Date(i.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
                        : ''}
                      {!i.ativo ? ' · não consta mais no banco' : ''}
                    </div>
                  </TableCell>
                  <TableCell className={`${td} text-gray-600 dark:text-gray-300`}>
                    {TIPO[i.type] ?? i.type}
                    {i.subtype ? ` · ${i.subtype}` : ''}
                  </TableCell>
                  <TableCell
                    className={`${td} text-right tabular-nums text-gray-800 dark:text-white/90`}
                  >
                    {formatBRL(i.balance)}
                  </TableCell>
                  <TableCell className={td}>
                    <StatusChip status={i.importStatus} erro={i.importError} />
                    {i.importError && i.importStatus !== 'importado' ? (
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {i.importError}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className={`${td} whitespace-nowrap`}>
                    {['pendente', 'sem-suporte', 'erro'].includes(i.importStatus) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ignorar.isPending}
                        onClick={() => ignorar.mutate({ id: i.id })}
                      >
                        Ignorar
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {data.emprestimos.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <Table aria-label="Empréstimos importados">
            <TableHeader>
              <TableRow>
                {['Empréstimo', 'Contratado', 'Saldo devedor', 'Parcelas', 'Situação'].map(
                  (h, i) => (
                    <TableCell
                      key={i}
                      isHeader
                      className={`${th} ${i === 1 || i === 2 ? 'text-right' : ''}`}
                      style={{ backgroundColor: TABLE_HEADER_BG }}
                    >
                      {h}
                    </TableCell>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.emprestimos.map((l) => (
                <TableRow
                  key={l.id}
                  className={`border-b border-gray-100 dark:border-gray-800 ${l.ativo ? '' : 'opacity-60'}`}
                >
                  <TableCell className={td}>
                    <div className="text-gray-800 dark:text-white/90">{l.productName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {l.banco}
                      {l.amortization ? ` · ${l.amortization}` : ''}
                      {l.cet != null ? ` · CET ${(l.cet * 100).toFixed(1)}% a.a.` : ''}
                      {l.dueDate
                        ? ` · até ${new Date(l.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
                        : ''}
                    </div>
                  </TableCell>
                  <TableCell className={`${td} text-right tabular-nums`}>
                    {l.contractAmount != null ? formatBRL(l.contractAmount) : '—'}
                  </TableCell>
                  <TableCell
                    className={`${td} text-right tabular-nums text-red-600 dark:text-red-400`}
                  >
                    {l.outstanding != null ? formatBRL(l.outstanding) : '—'}
                  </TableCell>
                  <TableCell className={`${td} text-gray-600 dark:text-gray-300`}>
                    {l.paidInstallments != null && l.totalInstallments != null
                      ? `${l.paidInstallments}/${l.totalInstallments}`
                      : '—'}
                  </TableCell>
                  <TableCell className={td}>
                    <span title={l.importError ?? undefined}>
                      <Badge
                        size="sm"
                        color={
                          (STATUS[l.importStatus]?.cor ?? 'light') as
                            | 'success'
                            | 'info'
                            | 'warning'
                            | 'error'
                            | 'light'
                        }
                      >
                        {rotuloEmprestimo(l)}
                      </Badge>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
