'use client';

/**
 * Rail das listas da página Salvos (bloco 1, fatia C): chips em ORDEM DE CRIAÇÃO (sem reordenar),
 * com a contagem de ativos e o sino quando a lista tem alertas ligados (só com recursos.alertas),
 * + "Nova lista" tracejado. No celular, rola na horizontal dentro do próprio trilho (a página não
 * rola de lado); no computador, quebra a linha. Chips de 44px; a atual leva aria-current.
 */
import { IconeMais } from '@/components/analiseAtivos/shell/BotaoCriarLista';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ResumoLista } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.pagina.listas;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const CHIP = `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] border px-3.5 text-[13.5px] whitespace-nowrap ${FOCO}`;

export function IconeSino({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function temAlertaLigado(l: Pick<ResumoLista, 'alertas'>): boolean {
  return l.alertas.resultado || l.alertas.provento || l.alertas.criterios;
}

export interface SeletorListasProps {
  listas: ResumoLista[];
  atual: string;
  onEscolher: (id: string) => void;
  onNovaLista: () => void;
  /** recursos.alertas: sino nas listas com alertas ligados */
  alertasLigados: boolean;
}

export default function SeletorListas({
  listas,
  atual,
  onEscolher,
  onNovaLista,
  alertasLigados,
}: SeletorListasProps) {
  return (
    <ul
      aria-label={T.rotulo}
      data-salvos-listas=""
      data-mf-scroll-x=""
      className="flex relative w-full min-w-0 list-none items-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
    >
      {listas.map((l) => {
        const eAtual = l.id === atual;
        const total = l.contagem.acao + l.contagem.fii;
        return (
          <li key={l.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onEscolher(l.id)}
              aria-current={eAtual ? 'true' : undefined}
              data-lista-chip={l.id}
              className={`${CHIP} ${
                eAtual
                  ? 'border-[#396CAA] bg-[#EDF2F8] font-semibold text-[#314666] dark:border-[#6E9DC4] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]'
                  : 'border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.04]'
              }`}
            >
              <span className="max-w-[16rem] truncate">{l.nome}</span>
              <span
                className={`rounded-full px-[7px] py-px text-[11.5px] font-semibold tabular-nums ${
                  eAtual
                    ? 'bg-white text-[#314666] dark:bg-white/10 dark:text-[#6E9DC4]'
                    : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400'
                }`}
              >
                {total}
              </span>
              {alertasLigados && temAlertaLigado(l) ? (
                <>
                  <span className="sr-only">{T.alertasLigadosSr}</span>
                  <IconeSino className="h-[13px] w-[13px] text-gray-500 dark:text-gray-400" />
                </>
              ) : null}
            </button>
          </li>
        );
      })}
      <li className="shrink-0">
        <button
          type="button"
          onClick={onNovaLista}
          aria-haspopup="dialog"
          data-nova-lista=""
          className={`${CHIP} border-dashed border-gray-300 bg-white font-semibold text-[#396CAA] hover:bg-gray-50 dark:border-gray-600 dark:bg-transparent dark:text-[#6E9DC4] dark:hover:bg-white/[0.04]`}
        >
          <IconeMais />
          {T.novaLista}
        </button>
      </li>
    </ul>
  );
}
