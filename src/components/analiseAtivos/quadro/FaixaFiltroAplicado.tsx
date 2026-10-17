'use client';

/**
 * Faixa do filtro salvo aplicado no Quadro (bloco 1, fatia B), com ?filtro=<id> na URL.
 * - "Filtro salvo: Elétricas pagadoras" (role=status) e o "×" de 44 px que tira o filtro salvo
 *   (os chips da tela ficam como estão).
 * - Ao mexer nos chips: "· alterado" + "Salvar alterações" (PATCH estado) e "Salvar como novo"
 *   (ModalSalvarFiltro, montado pelo Quadro).
 * - ajustado = um critério do filtro saiu da classe e foi retirado na leitura: aviso.
 * - O id não existe mais (apagado em outro aparelho): aviso + "×".
 */
import {
  BOTAO_CAMADA_SEC,
  FOCO_SALVOS,
} from '@/components/analiseAtivos/ativo/acoes/SheetSalvarEmListas';
import { IconeFiltro } from '@/components/analiseAtivos/quadro/FiltrosSalvos';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { FiltroSalvoApi } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.filtros.faixa;

export interface FaixaFiltroAplicadoProps {
  /** o filtro salvo aplicado; null = o id da URL não existe mais */
  filtro: FiltroSalvoApi | null;
  alterado: boolean;
  salvando?: boolean;
  onSalvarAlteracoes: () => void;
  onSalvarComoNovo: () => void;
  onTirar: () => void;
  className?: string;
}

export default function FaixaFiltroAplicado({
  filtro,
  alterado,
  salvando = false,
  onSalvarAlteracoes,
  onSalvarComoNovo,
  onTirar,
  className = '',
}: FaixaFiltroAplicadoProps) {
  const nome = filtro?.nome ?? '';
  return (
    <div
      role="status"
      data-faixa-filtro-aplicado={filtro ? (alterado ? 'alterado' : 'igual') : 'nao-encontrado'}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#DCE6F2] bg-[#EDF2F8] py-1 pr-1 pl-3 text-sm text-gray-800 dark:border-[#6E9DC4]/30 dark:bg-white/5 dark:text-white/90 ${className}`}
    >
      <span className="text-[#396CAA] dark:text-[#6E9DC4]">
        <IconeFiltro />
      </span>
      {filtro ? (
        <span className="min-w-0">
          {formatarTexto(T.aplicado, { nome })}
          {alterado ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-[#314666] dark:bg-[#6E9DC4]/20 dark:text-[#6E9DC4]">
              {T.alterado}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="min-w-0">{T.naoEncontrado}</span>
      )}
      <span className="min-w-0 flex-1" />
      {filtro && alterado ? (
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BOTAO_CAMADA_SEC}
            onClick={onSalvarAlteracoes}
            disabled={salvando}
            aria-busy={salvando || undefined}
            data-salvar-alteracoes=""
          >
            {T.salvarAlteracoes}
          </button>
          <button
            type="button"
            className={BOTAO_CAMADA_SEC}
            onClick={onSalvarComoNovo}
            data-salvar-como-novo=""
          >
            {T.salvarComoNovo}
          </button>
        </span>
      ) : null}
      <button
        type="button"
        onClick={onTirar}
        aria-label={formatarTexto(T.tirarAria, { nome })}
        data-tirar-filtro=""
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/5 ${FOCO_SALVOS}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {filtro?.ajustado ? (
        <p className="w-full pb-1 text-[12.5px] text-gray-600 dark:text-gray-300">{T.ajustado}</p>
      ) : null}
    </div>
  );
}
