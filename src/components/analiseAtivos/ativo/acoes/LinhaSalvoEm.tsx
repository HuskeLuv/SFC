'use client';

/**
 * Linha "Salvo em…" embaixo do cabeçalho do ativo (bloco 1, fatia B). Só com o ativo salvo:
 * "Salvo em Dividendos e Utilidade pública" (os nomes são TEXTO, não links) e, com recursos.alertas,
 * " · alertas: resultado entregue, provento anunciado" (a união dos avisos das listas; nenhum →
 * "nenhum ligado nas listas"). Um único botão de 44 px: "Mudar listas" (2+ listas, abre o
 * "Salvar em…") ou "Ver em Salvos" (1 lista, leva à página Salvos nessa lista).
 */
import Link from 'next/link';
import { useRef } from 'react';
import type { ControleSalvar } from '@/components/analiseAtivos/ativo/acoes/BotaoSalvarAtivo';
import {
  juntarNomesListas,
  resumoAlertasLista,
  uniaoAlertas,
} from '@/components/analiseAtivos/salvos/compartilhados/formatosSalvos';
import { ID_LISTA_PROVISORIA } from '@/hooks/useAnaliseAtivosSalvos';
import { ROTAS_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';

const T = TEXTOS_SALVOS.salvar;

const BOTAO = `inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-[13px] font-medium whitespace-nowrap text-gray-800 hover:bg-gray-50 outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5 dark:focus-visible:ring-[#6E9DC4]`;

function IconeLista() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

export interface LinhaSalvoEmProps {
  controle: ControleSalvar;
  className?: string;
}

export default function LinhaSalvoEm({ controle: c, className = '' }: LinhaSalvoEmProps) {
  const ref = useRef<HTMLButtonElement>(null);
  if (!c.ligado || c.consultor || !c.salvo || c.nomesListas.length === 0) return null;

  let alertas = '';
  if (c.alertasLigados && c.listasDetalhe.length > 0) {
    const tipos = resumoAlertasLista(uniaoAlertas(c.listasDetalhe));
    alertas = formatarTexto(T.alertasDaLinha, { tipos: tipos || T.nenhumAlertaLigado });
  }
  const primeira = c.listaIds.find((id) => id !== ID_LISTA_PROVISORIA);

  return (
    <div
      data-linha-salvo-em=""
      className={`flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-[#EDF2F8] px-3 py-1.5 text-[13px] text-gray-700 sm:justify-end dark:bg-white/5 dark:text-gray-300 ${className}`}
    >
      <span className="min-w-0">
        {formatarTexto(T.salvoEm, { listas: juntarNomesListas(c.nomesListas) })}
        {alertas}
      </span>
      {c.totalListas >= 2 ? (
        <button
          ref={ref}
          type="button"
          className={BOTAO}
          aria-haspopup="dialog"
          aria-expanded={c.escolhaAberta}
          onClick={() => c.abrirEscolha(ref.current)}
          data-mudar-listas=""
        >
          <IconeLista />
          {T.mudarListas}
        </button>
      ) : primeira ? (
        <Link
          href={ROTAS_SALVOS.paginaLista(primeira, c.classe)}
          className={BOTAO}
          data-ver-em-salvos=""
        >
          <IconeLista />
          {T.verEmSalvos}
        </Link>
      ) : null}
    </div>
  );
}
