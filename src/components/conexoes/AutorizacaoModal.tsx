'use client';

import { Modal } from '@/components/ui/modal';
import {
  ROTULO_PRODUTO,
  VERSOES_CONSENTIMENTO,
  type ProdutoOpenFinance,
} from '@/lib/openFinanceConsentimento';
import type { ConsentimentoDTO } from '@/hooks/useConexoesBancarias';
import TextoConsentimento from './TextoConsentimento';

export function dataHora(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

export const ROTULO_STATUS: Record<string, string> = {
  ativo: 'Ativa',
  revogado: 'Revogada',
  substituido: 'Substituída por uma nova autorização',
};

export const ROTULO_MOTIVO: Record<string, string> = {
  usuario: 'você desconectou',
  instituicao: 'encerrada pela instituição',
  substituido: 'substituída ao reconectar',
};

/** "O que eu autorizei": quando, o quê e o texto exato da versão aceita. */
export default function AutorizacaoModal({
  consentimento,
  onFechar,
}: {
  consentimento: ConsentimentoDTO;
  onFechar: () => void;
}) {
  const texto = VERSOES_CONSENTIMENTO[consentimento.versaoTexto];
  return (
    <Modal isOpen onClose={onFechar} className="m-4 max-w-2xl">
      <div className="max-h-[85vh] overflow-y-auto p-6 sm:p-8">
        <h3 className="mb-3 pr-10 text-lg font-semibold text-gray-800 dark:text-white/90">
          Autorização Open Finance
          {consentimento.connectorName ? ` · ${consentimento.connectorName}` : ''}
        </h3>
        <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500 dark:text-gray-400">Situação</dt>
          <dd className="text-gray-800 dark:text-white/90">
            {ROTULO_STATUS[consentimento.status] ?? consentimento.status}
            {consentimento.motivoRevogacao
              ? ` (${ROTULO_MOTIVO[consentimento.motivoRevogacao] ?? consentimento.motivoRevogacao})`
              : ''}
          </dd>
          <dt className="text-gray-500 dark:text-gray-400">Autorizado em</dt>
          <dd className="text-gray-800 dark:text-white/90">
            {dataHora(consentimento.aceitoEm)}
            {consentimento.reconexao ? ' (renovação)' : ''}
          </dd>
          {consentimento.revogadoEm ? (
            <>
              <dt className="text-gray-500 dark:text-gray-400">Encerrado em</dt>
              <dd className="text-gray-800 dark:text-white/90">
                {dataHora(consentimento.revogadoEm)}
              </dd>
            </>
          ) : null}
          <dt className="text-gray-500 dark:text-gray-400">Dados autorizados</dt>
          <dd className="text-gray-800 dark:text-white/90">
            <ul className="list-disc pl-5">
              {consentimento.produtos.map((p) => (
                <li key={p}>{ROTULO_PRODUTO[p as ProdutoOpenFinance] ?? p}</li>
              ))}
            </ul>
          </dd>
        </dl>
        <h4 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">
          Texto que você aceitou
        </h4>
        {texto ? (
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <TextoConsentimento texto={texto} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">Versão {consentimento.versaoTexto}.</p>
        )}
      </div>
    </Modal>
  );
}
