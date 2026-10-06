'use client';

import React, { useEffect, useRef } from 'react';
import { useCategoriaEfetivaAtivo } from '@/hooks/useCategoriaEfetivaAtivo';
import type { CategoriaMovivel } from '@/lib/carteiraMover';
import type { WizardFormData } from '@/types/wizard';

/** Ticker do rótulo do assistente ("HGLG11 - CSHG Logística" → "HGLG11"). */
export const tickerDoRotulo = (ativo: string | null | undefined): string =>
  (ativo ?? '').split(' - ')[0].trim();

export const AJUDA_SUBGRUPO =
  'Se você já tem este ativo, ele continua no subgrupo atual. Para trocar, use Mover na Carteira.';

interface SecaoAtualNaCarteiraProps {
  formData: WizardFormData;
  /** Aba do campo de subgrupo deste passo (FII's, ETF's…). */
  categoria: CategoriaMovivel;
  /** Campo do formulário que guarda o subgrupo (tipoFii, regiaoEtf, estrategia…). */
  campo: keyof WizardFormData;
  handleInputChange: (field: keyof WizardFormData, value: string | number | boolean) => void;
}

/**
 * Ajuda do campo de subgrupo no assistente de compra (mover na Carteira, out/2026). Comprar mais
 * de um ativo que o usuário já tem NÃO regrava a seção (decisão 6): o campo vem preenchido com a
 * seção atual ("Infra · definida por você"). Se o ativo foi movido para outra aba, a frase diz
 * onde ele está.
 */
export function SecaoAtualNaCarteira({
  formData,
  categoria,
  campo,
  handleInputChange,
}: SecaoAtualNaCarteiraProps) {
  const ticker = tickerDoRotulo(formData.ativo);
  const { secaoAtual } = useCategoriaEfetivaAtivo(formData.assetId, ticker);
  const preenchidoRef = useRef<string | null>(null);
  const mesmaAba = !!secaoAtual && secaoAtual.categoria === categoria;
  const valorCampo = formData[campo];

  // Preenche uma vez por ativo, só com o campo vazio (não briga com a escolha do usuário).
  useEffect(() => {
    if (!mesmaAba || !secaoAtual) return;
    const chave = `${formData.assetId}|${secaoAtual.subgrupo}`;
    if (preenchidoRef.current === chave) return;
    preenchidoRef.current = chave;
    if (!valorCampo) handleInputChange(campo, secaoAtual.subgrupo);
  }, [campo, formData.assetId, handleInputChange, mesmaAba, secaoAtual, valorCampo]);

  // Ticket 06/10: o usuário escolheu outra seção para um ativo que já tem — a compra soma à
  // posição atual e a escolha não vale. Aviso visível (antes era só a ajuda cinza).
  if (mesmaAba && secaoAtual && valorCampo && valorCampo !== secaoAtual.subgrupo) {
    return (
      <p
        data-mf-secao-atual=""
        role="alert"
        className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-100"
      >
        {`${ticker} já está em ${secaoAtual.rotuloSecao} na sua Carteira. Esta compra será somada à posição em ${secaoAtual.rotuloSecao}; a seção escolhida aqui não será aplicada. Para trocar, use Mover na Carteira.`}
      </p>
    );
  }

  let texto = AJUDA_SUBGRUPO;
  if (secaoAtual && mesmaAba) {
    texto = `${secaoAtual.rotuloSecao} · definida por você. Comprar mais não muda a seção; para trocar, use Mover na Carteira.`;
  } else if (secaoAtual) {
    texto = `Na sua Carteira, ${ticker} está em ${secaoAtual.rotulo} (definida por você). Comprar mais não muda isso.`;
  }

  return (
    <p data-mf-secao-atual="" className="mt-1 text-xs text-gray-500 dark:text-gray-400">
      {texto}
    </p>
  );
}

export default SecaoAtualNaCarteira;
