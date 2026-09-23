'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { MOTIVOS_DENUNCIA, COMUNIDADE_LIMITES, type MotivoDenuncia } from '@/constants/comunidade';
import { useDenunciar } from '@/hooks/useComunidade';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, INPUT_CLASS } from './shared';

export function DenunciaModal({
  alvo,
  onFechar,
}: {
  alvo: { postId?: string; commentId?: string } | null;
  onFechar: () => void;
}) {
  const denunciar = useDenunciar();
  const [motivo, setMotivo] = useState<MotivoDenuncia>('spam');
  const [detalhe, setDetalhe] = useState('');
  const [enviada, setEnviada] = useState(false);

  useEffect(() => {
    if (alvo) {
      setMotivo('spam');
      setDetalhe('');
      setEnviada(false);
      denunciar.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao trocar de alvo
  }, [alvo]);

  const enviar = () => {
    if (!alvo) return;
    denunciar.mutate(
      { ...alvo, motivo, detalhe: detalhe.trim() || undefined },
      { onSuccess: () => setEnviada(true) },
    );
  };

  return (
    <Modal isOpen={alvo != null} onClose={onFechar} className="m-4 max-w-md p-6">
      {enviada ? (
        <>
          <h3 className="pr-8 text-lg font-semibold text-gray-800 dark:text-white/90">
            Denúncia enviada
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Obrigado. A equipe My Finance vai analisar o conteúdo.
          </p>
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={onFechar} className={BOTAO_PRIMARIO}>
              Fechar
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="pr-8 text-lg font-semibold text-gray-800 dark:text-white/90">
            Denunciar {alvo?.commentId ? 'comentário' : 'publicação'}
          </h3>
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Motivo</legend>
            {(Object.keys(MOTIVOS_DENUNCIA) as MotivoDenuncia[]).map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <input
                  type="radio"
                  name="motivo-denuncia"
                  checked={motivo === m}
                  onChange={() => setMotivo(m)}
                  className="accent-brand-500"
                />
                {MOTIVOS_DENUNCIA[m]}
              </label>
            ))}
          </fieldset>
          <label className="mt-4 block text-sm text-gray-700 dark:text-gray-300">
            Detalhes (opcional)
            <textarea
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              maxLength={COMUNIDADE_LIMITES.detalheDenunciaMaxChars}
              rows={3}
              className={`${INPUT_CLASS} mt-1 resize-none`}
            />
          </label>
          {denunciar.error && (
            <p className="mt-3 text-sm text-error-600 dark:text-error-400">
              {denunciar.error.message}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={denunciar.isPending}
              className={BOTAO_PRIMARIO}
            >
              {denunciar.isPending ? 'Enviando…' : 'Enviar denúncia'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
