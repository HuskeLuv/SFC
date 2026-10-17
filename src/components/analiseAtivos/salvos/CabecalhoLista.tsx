'use client';

/**
 * Cabeçalho da lista aberta na página Salvos (bloco 1, fatia C): nome, "n ativos · criada em
 * DD/MM/AAAA" (+ " · alertas: …" com recursos.alertas) e as ações "Alertas da lista" (só com o
 * recurso; abre o AlertasDaLista da fatia D), "Renomear" e "Apagar lista". No celular, as ações
 * viram botões de ícone de 44×44 (o nome acessível continua o texto inteiro).
 */
import { IconeSino } from '@/components/analiseAtivos/salvos/SeletorListas';
import {
  formatarDataLonga,
  resumoAlertasLista,
} from '@/components/analiseAtivos/salvos/compartilhados/formatosSalvos';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ResumoLista } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.pagina.cabecalho;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const BOTAO = `inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium whitespace-nowrap text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO}`;

function IconeLapis() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconeLixeira() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "3 ativos · criada em 02/10/2026 · alertas: resultado entregue, provento anunciado" */
export function textoSubtituloLista(lista: ResumoLista, alertasLigados: boolean): string {
  const n = lista.contagem.acao + lista.contagem.fii;
  const data = formatarDataLonga(lista.criadaEm);
  let s = n === 1 ? formatarTexto(T.umAtivo, { data }) : formatarTexto(T.nAtivos, { n, data });
  if (alertasLigados) {
    s += formatarTexto(T.alertas, { tipos: resumoAlertasLista(lista.alertas) || T.nenhumAlerta });
  }
  return s;
}

export interface CabecalhoListaProps {
  lista: ResumoLista;
  alertasLigados: boolean;
  onAlertas: () => void;
  onRenomear: () => void;
  onApagar: () => void;
}

export default function CabecalhoLista({
  lista,
  alertasLigados,
  onAlertas,
  onRenomear,
  onApagar,
}: CabecalhoListaProps) {
  return (
    <div
      data-salvos-cabecalho=""
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5"
    >
      <div className="min-w-0">
        <h2 className="text-lg leading-tight font-bold [overflow-wrap:anywhere] text-gray-800 dark:text-white/90">
          {lista.nome}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-gray-500 dark:text-gray-400">
          {textoSubtituloLista(lista, alertasLigados)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {alertasLigados ? (
          <button
            type="button"
            onClick={onAlertas}
            aria-label={T.alertasDaLista}
            aria-haspopup="dialog"
            data-acao-lista="alertas"
            className={BOTAO}
          >
            <IconeSino className="shrink-0" />
            <span className="hidden md:inline">{T.alertasDaLista}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRenomear}
          aria-label={T.renomearAria}
          aria-haspopup="dialog"
          data-acao-lista="renomear"
          className={BOTAO}
        >
          <IconeLapis />
          <span className="hidden md:inline">{T.renomear}</span>
        </button>
        <button
          type="button"
          onClick={onApagar}
          aria-label={T.apagarAria}
          aria-haspopup="dialog"
          data-acao-lista="apagar"
          className={`${BOTAO} hover:text-[#D92D20] dark:hover:text-[#F97066]`}
        >
          <IconeLixeira />
          <span className="hidden md:inline">{T.apagar}</span>
        </button>
      </div>
    </div>
  );
}
