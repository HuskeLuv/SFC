'use client';

import React from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { PrimaryButton, SecondaryButton } from '@/components/cashflow/mobile/edit/sheetUi';
import { DestinoAbaList, rotuloAtual } from './DestinoAbaList';
import type { FluxoMover } from './MoverInvestimento';
import { SPINNER } from './MoverInvestimentoDialog';
import { EfeitosMoverList } from './EfeitosMoverList';

/**
 * Painel "Mover <ativo>" do celular (M2-M6), no padrão do MovePanel do Fluxo: opções de 56px,
 * botões de 44px+, até 88% da altura. A linha do objetivo fica no rodapé, acima dos botões. Erro:
 * o painel fica aberto com a escolha preservada; sucesso fecha e o aviso (MobileSaveToast) traz
 * o Desfazer.
 */
export default function MoverInvestimentoSheet({
  open,
  fluxo,
}: {
  open: boolean;
  fluxo: FluxoMover;
}) {
  const { opcoes } = fluxo;
  const podeMover = !!opcoes?.movivel && !fluxo.carregando;

  let corpo: React.ReactNode;
  if (fluxo.carregando) {
    corpo = (
      <p className="flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400">
        {SPINNER} Carregando opções…
      </p>
    );
  } else if (fluxo.erroCarregar || !opcoes) {
    corpo = (
      <div className="flex flex-col items-start gap-1 py-4 text-sm text-gray-600 dark:text-gray-300">
        <p role="alert">Não foi possível carregar as opções.</p>
        <button
          type="button"
          onClick={fluxo.recarregar}
          className="min-h-11 font-semibold text-mf-patrimonio underline underline-offset-[3px] dark:text-mf-tranquilidade"
        >
          Tentar de novo
        </button>
      </div>
    );
  } else if (!opcoes.movivel) {
    corpo = (
      <p className="py-4 text-sm text-gray-600 dark:text-gray-300">
        {opcoes.motivo ?? 'Este ativo ainda não pode ser movido para outra aba'}.
      </p>
    );
  } else {
    corpo = (
      <div className="flex flex-col gap-3 pb-3">
        <DestinoAbaList
          variante="sheet"
          opcoes={opcoes}
          escolha={fluxo.escolha}
          onEscolher={fluxo.escolher}
          disabled={fluxo.salvando}
        />
        {fluxo.caixaRf ? (
          // Fase 2: os efeitos ficam no fim da área rolável (o "=" diz o que não muda).
          <EfeitosMoverList
            efeitos={fluxo.efeitos}
            className="rounded-[10px] bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]"
          />
        ) : (
          <p className="px-1 text-xs text-gray-500 dark:text-gray-400">
            Valores e rentabilidade não mudam. O IR segue o tipo do ativo. Dá para desfazer.
          </p>
        )}
      </div>
    );
  }

  return (
    <BottomSheet
      isOpen={open}
      onClose={fluxo.fechar}
      title={`Mover ${fluxo.rotulo}`}
      className="font-outfit"
      footer={
        <div className="flex flex-col gap-2">
          {fluxo.avisos.length > 0 && (
            <div
              aria-live="polite"
              className="rounded-[10px] bg-gray-50 px-3 py-2 text-[13px] text-gray-800 dark:bg-white/[0.04] dark:text-white/90"
            >
              {fluxo.avisos.map((aviso) => (
                <p key={aviso}>{aviso}</p>
              ))}
            </div>
          )}
          {fluxo.erro && (
            <p role="alert" className="text-sm text-[#D92D20] dark:text-[#F97066]">
              {fluxo.erro}
            </p>
          )}
          <div className="flex gap-2">
            <SecondaryButton onClick={fluxo.fechar} disabled={fluxo.salvando}>
              Voltar
            </SecondaryButton>
            {podeMover && (
              <PrimaryButton
                onClick={fluxo.confirmar}
                busy={fluxo.salvando}
                busyLabel="Movendo…"
                disabled={!fluxo.mudou}
              >
                {fluxo.rotuloPrimario}
              </PrimaryButton>
            )}
          </div>
        </div>
      }
    >
      {opcoes && (
        <p className="-mt-1 mb-3 px-1 text-[13px] text-gray-500 dark:text-gray-400">
          Hoje em {rotuloAtual(opcoes)}
        </p>
      )}
      {corpo}
    </BottomSheet>
  );
}
