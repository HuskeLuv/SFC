'use client';

/**
 * Moldura do formulário "Reportar dado incorreto" no CELULAR (bloco C, fatia D): BottomSheet de
 * tela cheia com o rodapé fixo ("Enviar relato" de 48px) e o "voltar" do sistema fechando o sheet
 * (useMobileHistoryLayer). `children` e `rodape` recebem `fecharEntao`, para links que navegam
 * ("Ver meus relatos", "Ver o relato") saírem da camada do histórico ANTES do router.push.
 */
import type { ReactNode } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';

export type FecharEntao = (acao: () => void) => void;

export interface SheetReportarDadoProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  children: (fecharEntao: FecharEntao) => ReactNode;
  rodape: (fecharEntao: FecharEntao) => ReactNode;
}

export default function SheetReportarDado({
  aberto,
  onFechar,
  titulo,
  children,
  rodape,
}: SheetReportarDadoProps) {
  const { fecharEntao } = useMobileHistoryLayer(aberto, onFechar, true);
  return (
    <BottomSheet
      isOpen={aberto}
      onClose={onFechar}
      title={titulo}
      className="h-[calc(100dvh-env(safe-area-inset-top)-12px)]"
      footer={<div className="flex gap-2 [&>*]:flex-1">{rodape(fecharEntao)}</div>}
    >
      <div data-relato-sheet="" className="flex flex-col gap-4 pt-1 pb-4">
        {children(fecharEntao)}
      </div>
    </BottomSheet>
  );
}
