'use client';

import Link from 'next/link';
import Badge from '@/components/ui/badge/Badge';
import Button from '@/components/ui/button/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { formatBRL } from '@/utils/format';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { ResponsiveCardList, type ResponsiveColumn } from '@/components/ui/table/ResponsiveTable';
import MobileStatusPill, { type MobileStatusTone } from '@/components/ui/mobile/MobileStatusPill';
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

/** Selo do celular (ponto + palavra, sem verde): mesma situação do Badge do desktop. */
const TOM_MOBILE: Record<string, MobileStatusTone> = {
  success: 'ok',
  info: 'neutro',
  warning: 'atencao',
  error: 'problema',
  light: 'neutro',
};

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

function detalheInvestimento(i: InvestimentoImportadoDTO): string {
  return [
    i.banco,
    i.code,
    i.rate && i.rateType ? `${i.rate}% ${i.rateType}` : null,
    i.dueDate ? `vence ${dataCurta(i.dueDate)}` : null,
    !i.ativo ? 'não consta mais no banco' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function detalheEmprestimo(l: EmprestimoImportadoDTO): string {
  return [
    l.banco,
    l.amortization,
    l.cet != null ? `CET ${(l.cet * 100).toFixed(1)}% a.a.` : null,
    l.dueDate ? `até ${dataCurta(l.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Selo dos investimentos ainda não conferidos (sólido em seguranca; nunca só cor). */
function SeloConferir() {
  return (
    <span
      data-destino-novo=""
      className="inline-flex items-center whitespace-nowrap rounded-full bg-mf-seguranca px-2.5 py-0.5 text-xs font-medium text-white dark:ring-1 dark:ring-mf-tranquilidade"
    >
      Novo · conferir
    </span>
  );
}

/** "Na Carteira em": o lugar atual + link "Ver" para a aba (alvo de 44px). */
function NaCarteiraEm({ i }: { i: InvestimentoImportadoDTO }) {
  if (!i.destino) return <span className="text-gray-400 dark:text-gray-500">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span className="text-gray-800 dark:text-white/90">{i.destino.rotulo}</span>
      <Link
        href={`/carteira?aba=${encodeURIComponent(i.destino.abaId)}`}
        aria-label={`Ver ${i.destino.rotulo} na Carteira`}
        className="-my-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-semibold text-mf-patrimonio underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mf-outside dark:text-mf-tranquilidade"
      >
        Ver
      </Link>
    </span>
  );
}

const th = TABLE_STYLES.th;
const td = TABLE_STYLES.td;

/**
 * Investimentos e empréstimos que o banco devolveu e como entraram no
 * MyFinance (Carteira / Dívidas). A importação é automática a cada sync;
 * aqui o usuário vê o resultado, reimporta pendências e ignora o que não quer.
 */
export default function CarteiraImportada({
  onAviso,
  onConferirDestinos,
}: {
  onAviso: (msg: string) => void;
  /** Abre a revisão só com os investimentos para conferir (escolher o destino na importação). */
  onConferirDestinos?: () => void;
}) {
  const { data, isLoading, isError, error } = useCarteiraImportada();
  const importar = useImportarCarteira();
  const ignorar = useIgnorarInvestimento();
  // PWA fase 3: abaixo de lg, as mesmas colunas em cartões; o desktop mantém as tabelas.
  const isBelowLg = useIsBelowLg();

  if (isLoading || isError) {
    return isError ? (
      <p className="text-sm text-red-600 dark:text-red-400">{error?.message}</p>
    ) : null;
  }
  if (!data || (data.investimentos.length === 0 && data.emprestimos.length === 0)) return null;

  const pendentes =
    data.investimentos.filter((i) => i.importStatus === 'pendente').length +
    data.emprestimos.filter((l) => l.importStatus === 'pendente').length;

  // Escolher o destino na importação: os campos só vêm com a chave PLUGGY_DESTINOS_HABILITADO
  // ligada. Sem eles, a tela é a de hoje (sem coluna, aviso nem selo).
  const comDestinos = typeof data.paraRevisar === 'number';
  const paraRevisar = data.paraRevisar ?? 0;
  const paraConferir = (i: InvestimentoImportadoDTO) => i.situacaoDestino === 'para-revisar';

  const podeIgnorar = (i: InvestimentoImportadoDTO) =>
    ['pendente', 'sem-suporte', 'erro'].includes(i.importStatus);

  const colunasInvestimentos: ResponsiveColumn<InvestimentoImportadoDTO>[] = [
    {
      id: 'investimento',
      header: 'Investimento',
      mobile: 'primary',
      cell: (i) => <span className="[overflow-wrap:anywhere]">{i.name}</span>,
    },
    { id: 'detalhe', header: '', mobile: 'subtitle', cell: detalheInvestimento },
    { id: 'saldo', header: 'Saldo no banco', mobile: 'value', cell: (i) => formatBRL(i.balance) },
    ...(comDestinos
      ? [
          {
            id: 'naCarteira',
            header: 'Na Carteira em',
            mobile: 'subtitle' as const,
            cell: (i: InvestimentoImportadoDTO) =>
              i.destino ? (
                <span className="inline-flex flex-wrap items-center gap-x-1">
                  <span>Na Carteira em</span>
                  <NaCarteiraEm i={i} />
                </span>
              ) : null,
          },
        ]
      : []),
    {
      id: 'tipo',
      header: 'Tipo',
      cell: (i) => `${TIPO[i.type] ?? i.type}${i.subtype ? ` · ${i.subtype}` : ''}`,
    },
    {
      id: 'situacao',
      header: 'Situação',
      cell: (i) => {
        const st = STATUS[i.importStatus] ?? { rotulo: i.importStatus, cor: 'light' as const };
        return (
          <>
            {paraConferir(i) ? (
              <SeloConferir />
            ) : (
              <MobileStatusPill tone={TOM_MOBILE[st.cor]}>{st.rotulo}</MobileStatusPill>
            )}
            {i.importError && i.importStatus !== 'importado' ? (
              <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">
                {i.importError}
              </span>
            ) : null}
            {podeIgnorar(i) ? (
              <button
                type="button"
                disabled={ignorar.isPending}
                onClick={() => ignorar.mutate({ id: i.id })}
                aria-label={`Ignorar ${i.name}`}
                className="mt-1 inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
              >
                Ignorar
              </button>
            ) : null}
          </>
        );
      },
    },
  ];

  const colunasEmprestimos: ResponsiveColumn<EmprestimoImportadoDTO>[] = [
    {
      id: 'emprestimo',
      header: 'Empréstimo',
      mobile: 'primary',
      cell: (l) => <span className="[overflow-wrap:anywhere]">{l.productName}</span>,
    },
    { id: 'detalhe', header: '', mobile: 'subtitle', cell: detalheEmprestimo },
    {
      id: 'saldo',
      header: 'Saldo devedor',
      mobile: 'value',
      cell: (l) => (
        <span className="text-[#D92D20] dark:text-[#F97066]">
          {l.outstanding != null ? formatBRL(l.outstanding) : '—'}
        </span>
      ),
    },
    {
      id: 'contratado',
      header: 'Contratado',
      cell: (l) => (l.contractAmount != null ? formatBRL(l.contractAmount) : '—'),
    },
    {
      id: 'parcelas',
      header: 'Parcelas',
      cell: (l) =>
        l.paidInstallments != null && l.totalInstallments != null
          ? `${l.paidInstallments}/${l.totalInstallments}`
          : '—',
    },
    {
      id: 'situacao',
      header: 'Situação',
      cell: (l) => (
        <MobileStatusPill tone={TOM_MOBILE[STATUS[l.importStatus]?.cor ?? 'light']}>
          {rotuloEmprestimo(l)}
        </MobileStatusPill>
      ),
    },
  ];

  async function reimportar() {
    try {
      const r = await importar.mutateAsync();
      onAviso(
        `Importação: ${r.importados} na Carteira/Dívidas, ${r.vinculados} já existiam, ${r.semSuporte} para cadastrar à mão, ${r.ignorados} ignorados${r.erros ? `, ${r.erros} com erro` : ''}.${r.paraRevisar ? ` ${r.paraRevisar} para conferir onde ${r.paraRevisar === 1 ? 'fica' : 'ficam'}.` : ''}`,
      );
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'Não foi possível importar');
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] max-lg:rounded-2xl max-lg:p-4">
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
          <Button
            size="sm"
            onClick={reimportar}
            disabled={importar.isPending}
            className="max-lg:w-full"
          >
            Importar pendentes ({pendentes})
          </Button>
        ) : null}
      </div>

      {comDestinos && paraRevisar > 0 && onConferirDestinos ? (
        <div
          data-destinos-aviso=""
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mf-tranquilidade/[0.18] px-4 py-3 text-mf-seguranca dark:bg-mf-tranquilidade/[0.14] dark:text-mf-escolha max-lg:flex-col max-lg:items-stretch max-lg:rounded-2xl"
        >
          <p className="max-w-[70ch] text-sm">
            <span className="font-semibold">
              {paraRevisar === 1
                ? '1 investimento novo chegou'
                : `${paraRevisar} investimentos novos chegaram`}
            </span>{' '}
            na sincronização e já {paraRevisar === 1 ? 'está' : 'estão'} na Carteira, no lugar que
            sugerimos. Confira onde {paraRevisar === 1 ? 'entrou' : 'entraram'}.
          </p>
          <Button size="sm" onClick={onConferirDestinos} className="min-h-11 max-lg:w-full">
            Conferir destinos ({paraRevisar})
          </Button>
        </div>
      ) : null}

      {isBelowLg && data.investimentos.length > 0 ? (
        <ResponsiveCardList
          columns={colunasInvestimentos}
          rows={data.investimentos}
          getRowKey={(i) => i.id}
          ariaLabel="Investimentos importados"
          cardClassName={(i) => (i.ativo ? undefined : 'opacity-60')}
        />
      ) : null}
      {isBelowLg && data.emprestimos.length > 0 ? (
        <ResponsiveCardList
          columns={colunasEmprestimos}
          rows={data.emprestimos}
          getRowKey={(l) => l.id}
          ariaLabel="Empréstimos importados"
          cardClassName={(l) => (l.ativo ? undefined : 'opacity-60')}
          className="mt-4"
        />
      ) : null}

      {!isBelowLg && data.investimentos.length > 0 ? (
        <div className={TABLE_STYLES.wrapper}>
          <Table className={TABLE_STYLES.table} aria-label="Investimentos importados">
            <TableHeader>
              <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                {[
                  'Investimento',
                  'Tipo',
                  'Saldo no banco',
                  ...(comDestinos ? ['Na Carteira em'] : []),
                  'Situação',
                  '',
                ].map((h, i) => (
                  <TableCell
                    key={i}
                    isHeader
                    className={`${th} ${h === 'Saldo no banco' ? 'text-right' : 'text-left'}`}
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
                  className={`${TABLE_STYLES.row} ${i.ativo ? '' : 'opacity-60'}`}
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
                  {comDestinos ? (
                    <TableCell className={td}>
                      <NaCarteiraEm i={i} />
                    </TableCell>
                  ) : null}
                  <TableCell className={td}>
                    {paraConferir(i) ? (
                      <SeloConferir />
                    ) : (
                      <StatusChip status={i.importStatus} erro={i.importError} />
                    )}
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

      {!isBelowLg && data.emprestimos.length > 0 ? (
        <div className={`mt-4 ${TABLE_STYLES.wrapper}`}>
          <Table className={TABLE_STYLES.table} aria-label="Empréstimos importados">
            <TableHeader>
              <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                {['Empréstimo', 'Contratado', 'Saldo devedor', 'Parcelas', 'Situação'].map(
                  (h, i) => (
                    <TableCell
                      key={i}
                      isHeader
                      className={`${th} ${i === 1 || i === 2 ? 'text-right' : 'text-left'}`}
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
                  className={`${TABLE_STYLES.row} ${l.ativo ? '' : 'opacity-60'}`}
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
