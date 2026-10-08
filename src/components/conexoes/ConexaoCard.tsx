'use client';

import { useState } from 'react';
import Image from 'next/image';
import Badge from '@/components/ui/badge/Badge';
import Button from '@/components/ui/button/Button';
import { formatBRL } from '@/utils/format';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import MobileStatusPill, { type MobileStatusTone } from '@/components/ui/mobile/MobileStatusPill';
import {
  MobileActionSheet,
  MobileMoreButton,
  type MobileAction,
} from '@/components/ui/sheet/MobileActionSheet';
import type {
  BankAccountDTO,
  BankConnectionDTO,
  ConsentimentoDTO,
} from '@/hooks/useConexoesBancarias';
import {
  STATUS_DESCONECTADA,
  TEXTO_DESCONECTADA,
  rotuloConta,
  statusConexao,
  tempoRelativo,
  textoAvisos,
} from './statusConexao';

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

/** Selo do celular (ponto + palavra, sem verde) a partir da cor do Badge de hoje. */
const TOM_MOBILE: Record<ReturnType<typeof statusConexao>['cor'], MobileStatusTone> = {
  success: 'ok',
  info: 'neutro',
  warning: 'atencao',
  error: 'problema',
  light: 'neutro',
};

/** Uma instituição conectada: status, contas e ações. */
export default function ConexaoCard(props: ConexaoCardProps) {
  // PWA fase 3: abaixo de lg, cartão próprio com ⋯ (mesmos itens e handlers); desktop igual.
  const isBelowLg = useIsBelowLg();
  return isBelowLg ? <ConexaoCardMobile {...props} /> : <ConexaoCardDesktop {...props} />;
}

function ConexaoCardDesktop({
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
            {conexao.status === STATUS_DESCONECTADA ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {TEXTO_DESCONECTADA}
              </p>
            ) : null}
            {textoAvisos(conexao.avisos) ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {textoAvisos(conexao.avisos)}
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

/**
 * Cartão do banco no celular (PWA fase 3): primário "Reconectar" quando a lógica de hoje o mostra,
 * senão "Atualizar agora" (mesmos disabled e "Sincronizando…"); ⋯ abre as ações de hoje; cada
 * conta em linha com "Ver extrato" de 44px.
 */
function ConexaoCardMobile({
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
  const [menuAberto, setMenuAberto] = useState(false);

  const acoes: MobileAction[] = [];
  if (autorizacao && onVerAutorizacao) {
    acoes.push({
      id: 'autorizacao',
      label: 'Ver o que autorizei',
      hint: `Autorizado em ${dataCurta(autorizacao.aceitoEm)}`,
      onSelect: () => onVerAutorizacao(autorizacao),
    });
  }
  if (st.precisaReconectar) {
    acoes.push({
      id: 'reconectar',
      label: 'Reconectar',
      disabled: ocupada,
      onSelect: () => onReconectar(conexao),
    });
  } else {
    acoes.push({
      id: 'atualizar',
      label: st.sincronizando ? 'Sincronizando…' : 'Atualizar agora',
      disabled: ocupada || st.sincronizando,
      onSelect: () => onAtualizar(conexao),
    });
  }
  acoes.push({
    id: 'desconectar',
    label: 'Desconectar',
    danger: true,
    disabled: ocupada,
    onSelect: () => onExcluir(conexao),
  });

  const primario = st.precisaReconectar ? (
    <button
      type="button"
      onClick={() => onReconectar(conexao)}
      disabled={ocupada}
      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-mf-seguranca px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-mf-patrimonio"
    >
      Reconectar
    </button>
  ) : (
    <button
      type="button"
      onClick={() => onAtualizar(conexao)}
      disabled={ocupada || st.sincronizando}
      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
    >
      {st.sincronizando ? 'Sincronizando…' : 'Atualizar agora'}
    </button>
  );

  return (
    <article
      data-mf-mobile=""
      data-conexao-card=""
      aria-labelledby={`conexao-${conexao.id}`}
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex items-start gap-3">
        {conexao.connectorImageUrl ? (
          <Image
            src={conexao.connectorImageUrl}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 shrink-0 rounded-lg object-contain"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h3
            id={`conexao-${conexao.id}`}
            className="text-base font-semibold text-gray-800 [overflow-wrap:anywhere] dark:text-white/90"
          >
            {conexao.connectorName}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <MobileStatusPill tone={TOM_MOBILE[st.cor]}>{st.rotulo}</MobileStatusPill>
            {conexao.isOpenFinance ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">Open Finance</span>
            ) : null}
            {conexao.isSandbox ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">sandbox</span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Última importação {tempoRelativo(conexao.lastSyncAt)}
        {conexao.consentExpiresAt
          ? ` · consentimento até ${dataCurta(conexao.consentExpiresAt)}`
          : ''}
        {autorizacao ? ` · autorizado em ${dataCurta(autorizacao.aceitoEm)}` : ''}
      </p>
      {conexao.lastSyncError ? (
        <p className="mt-1 text-xs text-[#D92D20] dark:text-[#F97066]">{conexao.lastSyncError}</p>
      ) : null}
      {conexao.errorMessage && st.precisaReconectar ? (
        <p className="mt-1 text-xs text-[#B45309] dark:text-[#FBBF24]">{conexao.errorMessage}</p>
      ) : null}
      {conexao.status === STATUS_DESCONECTADA ? (
        <p className="mt-1 text-xs text-[#B45309] dark:text-[#FBBF24]">{TEXTO_DESCONECTADA}</p>
      ) : null}
      {textoAvisos(conexao.avisos) ? (
        <p className="mt-1 text-xs text-[#B45309] dark:text-[#FBBF24]">
          {textoAvisos(conexao.avisos)}
        </p>
      ) : null}

      {conexao.accounts.length > 0 ? (
        <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          {conexao.accounts.map((a) => {
            const selecionada = a.id === contaSelecionada;
            return (
              <li key={a.id} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 [overflow-wrap:anywhere] dark:text-white/90">
                      {a.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {rotuloConta(a)}
                      {a.number ? ` · ${a.number}` : ''}
                      {!a.ativa ? ' · desativada (já existe em outra conexão)' : ''}
                      {a.type === 'CREDIT' && a.creditDueDate
                        ? ` · fatura vence ${dataCurta(a.creditDueDate)}`
                        : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold tabular-nums ${
                        a.balance < 0
                          ? 'text-[#D92D20] dark:text-[#F97066]'
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
                </div>
                <button
                  type="button"
                  onClick={() => onVerExtrato(a)}
                  aria-label={`Ver extrato de ${a.name}`}
                  aria-pressed={selecionada}
                  className="mt-1 -ml-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-mf-patrimonio dark:text-mf-tranquilidade"
                >
                  Ver extrato
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Nenhuma conta importada ainda. A primeira importação pode levar alguns minutos.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {primario}
        <MobileMoreButton
          onClick={() => setMenuAberto(true)}
          label={`Mais ações de ${conexao.connectorName}`}
        />
      </div>

      <MobileActionSheet
        isOpen={menuAberto}
        onClose={() => setMenuAberto(false)}
        title={conexao.connectorName}
        actions={acoes}
      />
    </article>
  );
}
