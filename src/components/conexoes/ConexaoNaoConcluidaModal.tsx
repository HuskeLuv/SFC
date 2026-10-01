'use client';

import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import { MODAL_STICKY_FOOTER } from '@/lib/ui/mobile';

/**
 * Aviso quando a conexão chegou ao banco e não voltou concluída (widget fechado ou erro).
 * Causa mais comum nos tickets: instituição errada na lista — ex.: "BTGPactual" (conta
 * corrente) escolhido por quem só tem a corretora ("BTGPactual Investimentos"); o banco
 * recusa com um erro genérico na própria tela e o My Finance não recebe o motivo.
 */
export default function ConexaoNaoConcluidaModal({
  instituicao,
  detalhe,
  onTentarDeNovo,
  onFechar,
}: {
  instituicao: string;
  /** Mensagem de erro do widget, quando houver. */
  detalhe?: string | null;
  onTentarDeNovo: () => void;
  onFechar: () => void;
}) {
  return (
    <Modal isOpen onClose={onFechar} className="m-4 max-w-lg">
      <div className="p-6 sm:p-8 max-lg:pb-0 sm:max-lg:pb-0">
        <h3 className="mb-1 pr-10 text-lg font-semibold text-gray-800 dark:text-white/90">
          A conexão com {instituicao} não foi concluída
        </h3>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          Quando o banco mostra um erro ou a autorização não termina, quase sempre a instituição
          escolhida na lista não é a mesma da conta em que você entrou. Confira antes de tentar de
          novo:
        </p>
        <ul className="space-y-2 text-sm">
          <li className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
            <span className="font-medium text-gray-800 dark:text-white/90">
              O banco aparece mais de uma vez na lista?
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Alguns têm uma opção para a conta corrente e outra para a corretora — por exemplo,
              &quot;BTGPactual&quot; e &quot;BTGPactual Investimentos&quot;. Escolha a da conta que
              você quer conectar.
            </span>
          </li>
          <li className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
            <span className="font-medium text-gray-800 dark:text-white/90">
              O acesso é da mesma conta?
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              O login, o token ou o app usados na autorização precisam ser da conta escolhida aqui.
              O token da conta de investimentos não autoriza a conta corrente, e vice-versa.
            </span>
          </li>
          <li className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
            <span className="font-medium text-gray-800 dark:text-white/90">
              Conta pessoal ou da empresa?
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Contas PJ ficam nas opções com &quot;Empresas&quot; no nome.
            </span>
          </li>
        </ul>
        {detalhe ? (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Mensagem recebida: {detalhe}
          </p>
        ) : null}
        <div
          className={`mt-6 flex justify-end gap-3 ${MODAL_STICKY_FOOTER.p6sm8} max-lg:[&>button]:flex-1 max-lg:[&>button]:min-h-11 max-lg:bottom-[calc(-8px-env(safe-area-inset-bottom))]`}
        >
          <Button size="sm" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <Button size="sm" onClick={onTentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      </div>
    </Modal>
  );
}
