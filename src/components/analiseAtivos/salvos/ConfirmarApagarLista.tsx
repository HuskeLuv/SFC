'use client';

/**
 * Confirmação de "Apagar lista" (bloco 1, fatia C): ModalAnalise (diálogo no computador,
 * BottomSheet + useMobileHistoryLayer no celular) com o botão vermelho. Diz o que sai (os ativos
 * desta lista e, com alertas ligados, os alertas dela) e o que continua (as outras listas e a
 * Carteira). DELETE /listas/[id]; o aviso "Lista X apagada." e a navegação ficam com a página.
 */
import { useState } from 'react';
import ModalAnalise, {
  BOTAO_MODAL_SECUNDARIO,
  FOCO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { temAlertaLigado } from '@/components/analiseAtivos/salvos/SeletorListas';
import { useApagarLista } from '@/hooks/useAnaliseAtivosSalvos';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ResumoLista } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.apagarLista;

const BOTAO_PERIGO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#D92D20] px-4 text-sm font-medium text-white transition-colors hover:bg-[#D92D20]/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#F97066] dark:text-gray-900 dark:hover:bg-[#F97066]/90 ${FOCO_MODAL}`;

/** "Os 3 ativos saem desta lista e os alertas dela param. Os ativos continuam…" */
export function textoConfirmarApagar(lista: ResumoLista, alertasLigados: boolean): string {
  const n = lista.contagem.acao + lista.contagem.fii;
  const sai = n === 1 ? T.saiUmItem : formatarTexto(T.saemItens, { n });
  const alertas = alertasLigados && temAlertaLigado(lista) ? T.alertasParam : '';
  return n === 0 ? T.continuam : `${sai}${alertas}${T.fimFrase}${T.continuam}`;
}

export interface ConfirmarApagarListaProps {
  aberto: boolean;
  lista: ResumoLista | null;
  alertasLigados: boolean;
  onFechar: () => void;
  onApagada: (lista: ResumoLista) => void;
}

export default function ConfirmarApagarLista({
  aberto,
  lista,
  alertasLigados,
  onFechar,
  onApagada,
}: ConfirmarApagarListaProps) {
  const apagar = useApagarLista();
  const [erro, setErro] = useState(false);
  if (!lista) return null;

  const confirmar = () => {
    setErro(false);
    apagar.mutate(
      { id: lista.id },
      {
        onSuccess: () => onApagada(lista),
        onError: () => setErro(true),
      },
    );
  };

  return (
    <ModalAnalise
      aberto={aberto}
      onFechar={() => {
        setErro(false);
        onFechar();
      }}
      titulo={formatarTexto(T.titulo, { lista: lista.nome })}
      rodape={
        <>
          <span className="min-w-0 flex-1" />
          <button type="button" onClick={onFechar} className={BOTAO_MODAL_SECUNDARIO}>
            {T.cancelar}
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={apagar.isPending}
            aria-busy={apagar.isPending || undefined}
            data-confirmar-apagar=""
            className={BOTAO_PERIGO}
          >
            {T.confirmar}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        {textoConfirmarApagar(lista, alertasLigados)}
      </p>
      {erro ? (
        <p role="alert" className="mt-3 text-sm text-[#D92D20] dark:text-[#F97066]">
          {TEXTOS_SALVOS.toast.erroGenerico}
        </p>
      ) : null}
    </ModalAnalise>
  );
}
