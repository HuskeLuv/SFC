'use client';

import { useId, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import type { AnoMes, CopiarMesResponse } from '@/types/orcamentoV2';
import { mesCurto, mesLongo, plural } from './apresentacao';

interface CopiarMesProps {
  /** Mês de origem do payload (`copiarDe`). */
  de: AnoMes & { temOrcado: boolean };
  /** Mês aberto (destino). */
  para: AnoMes;
  /** O mês aberto já tem algum orçado preenchido: pede a decisão (Q8). */
  destinoTemOrcado: boolean;
  onCopiar: (sobrescrever: boolean) => Promise<CopiarMesResponse>;
  /** Mensagem de resultado (sucesso ou erro) para o aviso da seção. */
  onResultado: (r: { tipo: 'ok' | 'erro'; texto: string }) => void;
}

const BTN =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/5';
const BTN_PRIMARIO =
  'rounded-lg bg-mf-patrimonio px-4 py-2 text-sm font-semibold text-white hover:bg-mf-seguranca disabled:opacity-50';
const BTN_SECUNDARIO =
  'rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/5';

/**
 * "Copiar de <mês anterior>" (R-13, Q8). Mês aberto vazio → copia direto. Com orçado → diálogo de
 * três saídas: "Substituir tudo" (`sobrescrever: true`), "Só preencher vazios" (`false`) e
 * "Cancelar". Origem sem orçado → botão desabilitado. Some no acumulado (Q7, quem chama decide).
 */
export default function CopiarMes({
  de,
  para,
  destinoTemOrcado,
  onCopiar,
  onResultado,
}: CopiarMesProps) {
  const tituloId = useId();
  const [perguntando, setPerguntando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const origem = mesCurto(de);

  const copiar = async (sobrescrever: boolean) => {
    setCopiando(true);
    try {
      const r = await onCopiar(sobrescrever);
      setPerguntando(false);
      if (r.copiados === 0) {
        onResultado({
          tipo: 'ok',
          texto: `Nada copiado de ${origem}: as subcategorias já estavam preenchidas.`,
        });
      } else {
        const mantidas =
          r.ignorados > 0
            ? ` (${plural(r.ignorados, 'subcategoria já preenchida ficou', 'subcategorias já preenchidas ficaram')} como estava${r.ignorados === 1 ? '' : 'm'})`
            : '';
        onResultado({
          tipo: 'ok',
          texto: `Orçado de ${origem} copiado — ajuste o que mudou${mantidas}.`,
        });
      }
    } catch (e: unknown) {
      setPerguntando(false);
      onResultado({
        tipo: 'erro',
        texto: e instanceof Error ? e.message : 'Erro ao copiar o orçamento',
      });
    } finally {
      setCopiando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={BTN}
        disabled={!de.temOrcado || copiando}
        title={de.temOrcado ? undefined : `${origem} não tem orçado para copiar`}
        onClick={() => (destinoTemOrcado ? setPerguntando(true) : void copiar(false))}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
        Copiar de {origem}
      </button>
      <Modal
        isOpen={perguntando}
        onClose={() => (copiando ? undefined : setPerguntando(false))}
        showCloseButton={false}
        ariaLabelledby={tituloId}
        className="max-w-md p-6"
      >
        <h3 id={tituloId} className="text-base font-semibold text-gray-900 dark:text-white/90">
          {mesLongo(para)} já tem orçados
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          O que fazer com o orçado de {origem}? Substituir troca todos os valores do mês; só
          preencher vazios mantém o que você já definiu.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={BTN_SECUNDARIO}
            disabled={copiando}
            onClick={() => setPerguntando(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={BTN_SECUNDARIO}
            disabled={copiando}
            onClick={() => void copiar(false)}
          >
            Só preencher vazios
          </button>
          <button
            type="button"
            className={BTN_PRIMARIO}
            disabled={copiando}
            onClick={() => void copiar(true)}
          >
            Substituir tudo
          </button>
        </div>
      </Modal>
    </>
  );
}
