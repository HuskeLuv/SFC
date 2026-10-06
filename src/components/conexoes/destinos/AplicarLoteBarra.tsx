'use client';

import React, { useId, useState } from 'react';
import type { DestinoComum } from '@/lib/pluggyDestinos';
import { opcoesDoLote, plural, type EscolhaItem } from './destinosEstado';

/** Sem destino em comum entre os marcados. */
export const TEXTO_SEM_DESTINO_COMUM =
  'Estes investimentos não têm um destino em comum — troque um por um.';

/**
 * Barra do lote (só no computador, protótipo D5): "N selecionados · Mover para [destinos aceitos
 * por TODOS os marcados] · Aplicar · Limpar seleção". Os destinos vêm de `destinosDoLote`
 * (interseção das opções do servidor); sem interseção, a barra explica e pede troca um a um.
 */
export default function AplicarLoteBarra({
  quantidade,
  comuns,
  disabled,
  onAplicar,
  onLimpar,
}: {
  quantidade: number;
  comuns: readonly DestinoComum[];
  disabled?: boolean;
  onAplicar: (escolha: EscolhaItem) => void;
  onLimpar: () => void;
}) {
  const selectId = useId();
  const [valor, setValor] = useState('');
  const opcoes = opcoesDoLote(comuns);
  const escolhida = opcoes.find((o) => o.valor === valor);

  if (quantidade === 0) return null;

  return (
    <div
      role="region"
      aria-label="Ações em lote"
      data-mf-destinos-lote=""
      className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-mf-seguranca px-3 py-2 text-sm text-white"
    >
      <b className="font-semibold">{plural(quantidade, 'selecionado', 'selecionados')}</b>
      {opcoes.length === 0 ? (
        <span className="min-w-0 flex-1 text-[13px]">{TEXTO_SEM_DESTINO_COMUM}</span>
      ) : (
        <>
          <label htmlFor={selectId} className="text-[13px]">
            Mover para
          </label>
          <select
            id={selectId}
            value={escolhida ? valor : ''}
            disabled={disabled}
            onChange={(e) => setValor(e.target.value)}
            className="min-h-11 min-w-[200px] rounded-lg border border-white/30 bg-white px-3 text-sm text-gray-800 outline-none focus-visible:ring-[3px] focus-visible:ring-mf-tranquilidade dark:bg-[#18181B] dark:text-white/90"
          >
            <option value="">Escolha…</option>
            {opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || !escolhida}
            onClick={() => {
              if (!escolhida) return;
              onAplicar(escolhida.escolha);
              setValor('');
            }}
            className="min-h-11 rounded-lg border border-white/40 bg-mf-patrimonio px-4 font-semibold text-white outline-none focus-visible:ring-[3px] focus-visible:ring-mf-tranquilidade disabled:opacity-60"
          >
            Aplicar
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onLimpar}
        disabled={disabled}
        className="ml-auto min-h-11 rounded-lg border border-white/40 px-3 font-medium text-white outline-none focus-visible:ring-[3px] focus-visible:ring-mf-tranquilidade disabled:opacity-60"
      >
        Limpar seleção
      </button>
    </div>
  );
}
