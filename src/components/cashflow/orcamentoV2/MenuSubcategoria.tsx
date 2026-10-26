'use client';

import { useEffect, useId, useState } from 'react';
import { Dropdown } from '@/components/ui/dropdown/Dropdown';
import { Modal } from '@/components/ui/modal';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { SubcategoriaV2 } from '@/types/orcamentoV2';
import type { ImpactoExclusaoV2 } from '@/hooks/useOrcamentoV2Estrutura';
import { mesCurto, plural } from './apresentacao';

export interface MenuSubcategoriaProps {
  sub: SubcategoriaV2;
  /** Categoria de poupança (Planejamento): sempre fixa, sem "Marcar como fixa". */
  poupanca: boolean;
  onRenomear: () => void;
  onAlternarFixa: () => void;
  onBuscarImpacto: (itemId: string, signal?: AbortSignal) => Promise<ImpactoExclusaoV2>;
  /** Exclui; lança com a mensagem do servidor (ex.: 409 cores divergentes). */
  onExcluir: (itemId: string) => Promise<void>;
}

const ITEM =
  'block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/5';

const BTN_SECUNDARIO =
  'rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/5';

/** Ação destrutiva no vermelho semântico aprovado (#D92D20 / #F97066 no escuro). */
const BTN_PERIGO =
  'rounded-lg bg-[#D92D20] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#F97066] dark:text-gray-900';

/**
 * Menu ⋯ da subcategoria (spec §4.5; R-07/R-12; Q12): Renomear, Marcar/Desmarcar como fixa e
 * Excluir. A Geral e os espelhos (objetivo/dívida) não renomeiam nem excluem
 * (`editavelEstrutura` do payload); em Planejamento (poupança) a fixa não se aplica. Sem nenhuma
 * opção, o botão não aparece (T26).
 *
 * Excluir abre uma confirmação com o impacto (`GET .../impacto`): quantos lançamentos e
 * transações vão para a Geral e o que acontece com os orçados. Cores divergentes (Q5) bloqueiam
 * a exclusão com a lista de meses para acertar na Planilha.
 */
export default function MenuSubcategoria({
  sub,
  poupanca,
  onRenomear,
  onAlternarFixa,
  onBuscarImpacto,
  onExcluir,
}: MenuSubcategoriaProps) {
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const podeEstrutura = sub.editavelEstrutura;
  const podeFixa = !poupanca;

  if (!podeEstrutura && !podeFixa) return null;

  const escolher = (acao: () => void) => () => {
    setAberto(false);
    acao();
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="dropdown-toggle rounded px-2 py-0.5 text-base leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-200"
        aria-label={`Mais ações de ${sub.nome}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        ⋯
      </button>
      <Dropdown isOpen={aberto} onClose={() => setAberto(false)} className="w-52 py-1">
        <div role="menu" aria-label={`Ações de ${sub.nome}`}>
          {podeEstrutura && (
            <button type="button" role="menuitem" className={ITEM} onClick={escolher(onRenomear)}>
              Renomear
            </button>
          )}
          {podeFixa && (
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              onClick={escolher(onAlternarFixa)}
            >
              {sub.fixa ? 'Desmarcar como fixa' : 'Marcar como fixa'}
            </button>
          )}
          {podeEstrutura && (
            <button
              type="button"
              role="menuitem"
              className={`${ITEM} ${SELO_TEXTO.estourou}`}
              onClick={escolher(() => setConfirmando(true))}
            >
              Excluir subcategoria
            </button>
          )}
        </div>
      </Dropdown>
      {confirmando && (
        <ConfirmarExclusao
          sub={sub}
          onFechar={() => setConfirmando(false)}
          onBuscarImpacto={onBuscarImpacto}
          onExcluir={onExcluir}
        />
      )}
    </div>
  );
}

function ConfirmarExclusao({
  sub,
  onFechar,
  onBuscarImpacto,
  onExcluir,
}: {
  sub: SubcategoriaV2;
  onFechar: () => void;
  onBuscarImpacto: MenuSubcategoriaProps['onBuscarImpacto'];
  onExcluir: MenuSubcategoriaProps['onExcluir'];
}) {
  const tituloId = useId();
  const [impacto, setImpacto] = useState<ImpactoExclusaoV2 | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    onBuscarImpacto(sub.id, ctrl.signal)
      .then(setImpacto)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setErro(e instanceof Error ? e.message : 'Erro ao consultar a subcategoria');
      });
    return () => ctrl.abort();
  }, [sub.id, onBuscarImpacto]);

  const bloqueada = (impacto?.coresDivergentes.length ?? 0) > 0;

  const confirmar = async () => {
    setExcluindo(true);
    setErro(null);
    try {
      await onExcluir(sub.id);
      onFechar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao excluir a subcategoria');
      setExcluindo(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={excluindo ? () => {} : onFechar}
      showCloseButton={false}
      ariaLabelledby={tituloId}
      className="max-w-md p-6"
    >
      <div data-mf-confirmar-exclusao="">
        <h3 id={tituloId} className="text-base font-semibold text-gray-900 dark:text-white/90">
          Excluir “{sub.nome}”?
        </h3>
        {!impacto && !erro && (
          <div className="mt-4 space-y-2" aria-busy="true">
            <div className="h-3 w-4/5 rounded bg-gray-200 motion-safe:animate-pulse dark:bg-gray-800" />
            <div className="h-3 w-3/5 rounded bg-gray-200 motion-safe:animate-pulse dark:bg-gray-800" />
          </div>
        )}
        {impacto && (
          <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>
              {impacto.celulas === 0
                ? 'Esta subcategoria não tem lançamentos no Fluxo de Caixa.'
                : `Os ${plural(impacto.celulas, 'lançamento', 'lançamentos')} desta subcategoria passam para Geral.`}
              {impacto.transacoes > 0 &&
                ` ${plural(impacto.transacoes, 'transação importada do banco também vai', 'transações importadas do banco também vão')} para Geral.`}
            </p>
            {impacto.mesesComOrcado > 0 && (
              <p>
                Orçado em {plural(impacto.mesesComOrcado, 'mês', 'meses')}: o dos meses fechados é
                somado em Geral; o do mês atual e dos próximos sai.
              </p>
            )}
            {bloqueada && (
              <p role="alert" className={`font-medium ${SELO_TEXTO.estourou}`}>
                Não dá para excluir agora: em{' '}
                {impacto.coresDivergentes.map((m) => mesCurto(m)).join(', ')} esta subcategoria e a
                Geral estão com status diferentes (uma paga e outra não). Acerte o status na
                Planilha e tente de novo.
              </p>
            )}
          </div>
        )}
        {erro && (
          <p role="alert" className={`mt-3 text-sm font-medium ${SELO_TEXTO.estourou}`}>
            {erro}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={BTN_SECUNDARIO} onClick={onFechar} disabled={excluindo}>
            Cancelar
          </button>
          <button
            type="button"
            className={BTN_PERIGO}
            onClick={() => void confirmar()}
            disabled={!impacto || bloqueada || excluindo}
          >
            {excluindo ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
