'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import Checkbox from '@/components/form/input/Checkbox';
import { TEXTO_CONSENTIMENTO_ATUAL } from '@/lib/openFinanceConsentimento';
import TextoConsentimento from './TextoConsentimento';

type Etapa = 'aviso' | 'consentimento' | 'redirecionamento';

interface ConectarBancoModalProps {
  /** Nome do banco quando é reconexão (renova a autorização de uma conexão existente). */
  reconexaoDe?: { id: string; connectorName: string } | null;
  ocupada: boolean;
  erro: string | null;
  /** "Li e autorizo" + "Autorizar e continuar": registra o aceite. */
  onAutorizar: () => Promise<boolean>;
  /** Depois do aviso de redirecionamento: abre o widget do Pluggy. */
  onContinuar: () => void;
  onFechar: () => void;
}

/**
 * Jornada antes do widget do Pluggy (adequação jurídica 21/09/2026), uma tela
 * por etapa definida pelos advogados:
 *   1. aviso inicial (redirecionamento + modo leitura);
 *   2. consentimento (dados, quem, finalidade, base legal, revogação) com
 *      dupla confirmação: marcar "Li e autorizo" habilita "Autorizar e continuar";
 *   3. disclaimer de redirecionamento (a etapa seguinte é da Pluggy/instituição).
 */
export default function ConectarBancoModal({
  reconexaoDe,
  ocupada,
  erro,
  onAutorizar,
  onContinuar,
  onFechar,
}: ConectarBancoModalProps) {
  const texto = TEXTO_CONSENTIMENTO_ATUAL;
  const [etapa, setEtapa] = useState<Etapa>('aviso');
  const [li, setLi] = useState(false);

  return (
    <Modal isOpen onClose={ocupada ? () => undefined : onFechar} className="m-4 max-w-2xl">
      <div className="max-h-[85vh] overflow-y-auto p-6 sm:p-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Etapa {etapa === 'aviso' ? 1 : etapa === 'consentimento' ? 2 : 3} de 3
          {reconexaoDe ? ` · renovar a autorização de ${reconexaoDe.connectorName}` : ''}
        </p>

        {etapa === 'aviso' ? (
          <>
            <h3 className="mb-3 pr-10 text-lg font-semibold text-gray-800 dark:text-white/90">
              {texto.aviso.titulo}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">{texto.aviso.texto}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onFechar}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => setEtapa('consentimento')}>
                Continuar
              </Button>
            </div>
          </>
        ) : null}

        {etapa === 'consentimento' ? (
          <>
            <h3 className="mb-4 pr-10 text-lg font-semibold text-gray-800 dark:text-white/90">
              {texto.consentimento.titulo}
            </h3>
            <TextoConsentimento texto={texto} />
            <div className="mt-5 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <Checkbox
                id="aceite-open-finance"
                checked={li}
                onChange={setLi}
                label={texto.consentimento.aceite}
                disabled={ocupada}
              />
            </div>
            {erro ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onFechar} disabled={ocupada}>
                Não autorizo
              </Button>
              <Button
                size="sm"
                disabled={!li || ocupada}
                onClick={async () => {
                  if (await onAutorizar()) setEtapa('redirecionamento');
                }}
              >
                {ocupada ? 'Registrando…' : 'Autorizar e continuar'}
              </Button>
            </div>
          </>
        ) : null}

        {etapa === 'redirecionamento' ? (
          <>
            <h3 className="mb-3 pr-10 text-lg font-semibold text-gray-800 dark:text-white/90">
              {texto.redirecionamento.titulo}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {texto.redirecionamento.texto}
            </p>
            {erro ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onFechar} disabled={ocupada}>
                Cancelar
              </Button>
              <Button size="sm" onClick={onContinuar} disabled={ocupada}>
                {ocupada ? 'Preparando…' : 'Continuar para a Pluggy'}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
