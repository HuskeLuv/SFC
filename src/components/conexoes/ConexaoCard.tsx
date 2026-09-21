'use client';

import Image from 'next/image';
import Badge from '@/components/ui/badge/Badge';
import Button from '@/components/ui/button/Button';
import { formatBRL } from '@/utils/format';
import type {
  BankAccountDTO,
  BankConnectionDTO,
  ConsentimentoDTO,
} from '@/hooks/useConexoesBancarias';
import { rotuloConta, statusConexao, tempoRelativo } from './statusConexao';

interface ConexaoCardProps {
  conexao: BankConnectionDTO;
  contaSelecionada: string | null;
  ocupada: boolean;
  onVerExtrato: (conta: BankAccountDTO) => void;
  onAtualizar: (conexao: BankConnectionDTO) => void;
  onReconectar: (conexao: BankConnectionDTO) => void;
  onExcluir: (conexao: BankConnectionDTO) => void;
  /** Autorização Open Finance ativa desta conexão (registro do consentimento). */
  autorizacao?: ConsentimentoDTO | null;
  onVerAutorizacao?: (c: ConsentimentoDTO) => void;
}

function dataCurta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
}

/** Uma instituição conectada: status, contas e ações. */
export default function ConexaoCard({
  conexao,
  contaSelecionada,
  ocupada,
  onVerExtrato,
  onAtualizar,
  onReconectar,
  onExcluir,
  autorizacao,
  onVerAutorizacao,
}: ConexaoCardProps) {
  const st = statusConexao(conexao);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {conexao.connectorImageUrl ? (
            <Image
              src={conexao.connectorImageUrl}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-lg object-contain"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800" aria-hidden />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                {conexao.connectorName}
              </h3>
              <Badge size="sm" color={st.cor}>
                {st.rotulo}
              </Badge>
              {conexao.isSandbox ? (
                <Badge size="sm" color="light">
                  sandbox
                </Badge>
              ) : null}
              {conexao.isOpenFinance ? (
                <Badge size="sm" color="light">
                  Open Finance
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Última importação {tempoRelativo(conexao.lastSyncAt)}
              {conexao.consentExpiresAt
                ? ` · consentimento até ${dataCurta(conexao.consentExpiresAt)}`
                : ''}
            </p>
            {autorizacao ? (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Autorizado em {dataCurta(autorizacao.aceitoEm)}
                {onVerAutorizacao ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="text-brand-500 underline"
                      onClick={() => onVerAutorizacao(autorizacao)}
                    >
                      Ver o que autorizei
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
            {conexao.lastSyncError ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{conexao.lastSyncError}</p>
            ) : null}
            {conexao.errorMessage && st.precisaReconectar ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {conexao.errorMessage}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {st.precisaReconectar ? (
            <Button size="sm" onClick={() => onReconectar(conexao)} disabled={ocupada}>
              Reconectar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAtualizar(conexao)}
              disabled={ocupada || st.sincronizando}
            >
              {st.sincronizando ? 'Sincronizando…' : 'Atualizar agora'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onExcluir(conexao)}
            disabled={ocupada}
            className="text-red-600 hover:text-red-700 dark:text-red-400"
          >
            Desconectar
          </Button>
        </div>
      </div>

      {conexao.accounts.length > 0 ? (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
          {conexao.accounts.map((a) => {
            const selecionada = a.id === contaSelecionada;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">{a.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {rotuloConta(a)}
                    {a.number ? ` · ${a.number}` : ''}
                    {!a.ativa ? ' · desativada (já existe em outra conexão)' : ''}
                    {a.type === 'CREDIT' && a.creditDueDate
                      ? ` · fatura vence ${dataCurta(a.creditDueDate)}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        a.balance < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-800 dark:text-white/90'
                      }`}
                    >
                      {formatBRL(a.balance)}
                    </p>
                    {a.type === 'CREDIT' && a.creditLimit != null ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        limite {formatBRL(a.creditLimit)}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant={selecionada ? 'primary' : 'outline'}
                    onClick={() => onVerExtrato(a)}
                  >
                    {selecionada ? 'Extrato aberto' : 'Ver extrato'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Nenhuma conta importada ainda. A primeira importação pode levar alguns minutos.
        </p>
      )}
    </div>
  );
}
