'use client';

/**
 * SeletorNivel (Bloco D, fatia 0) — controle segmentado do cabeçalho dos cards: "Essencial | Raio-X"
 * (Fundamentos, fatia A) e "Múltiplos | Meus cenários" (Valuation, fatia B). Vai no slot
 * `cabecalhoExtra` do card (acao do CartaoAnalise), antes do menu ⋯.
 *
 * - role="group" com nome acessível; cada opção é um <button aria-pressed>.
 * - TODO botão com altura mínima de 44px em todos os tamanhos (decisão 13: regra do app, inclusive
 *   no computador; o protótipo tinha 34–40px).
 * - Estilo do protótipo (.lvl): trilho cinza (gray-100 / white 5%), raio 10, botão ativo preenchido
 *   patrimonio / tranquilidade no escuro, como .pill.on do HTML (texto branco/potencia, semibold);
 *   inativo em cinza escuro com hover leve. Foco: ANEL_FOCO (afastado 2 px do preenchimento).
 * - Em tela estreita (< 640px, onde o card tem menos de 560px) ocupa a largura toda, com as opções
 *   divididas por igual; acima, tamanho do conteúdo.
 * - Setas ← → trocam de opção (padrão de controle segmentado), além de Tab/Enter/Espaço.
 * - Visual v2 (F4, item C4): sem trilho; pílulas compactas do HTML do Pedro num alvo de 44 px.
 */
import { useRef, type KeyboardEvent } from 'react';
import {
  ANEL_FOCO,
  ANEL_FOCO_GRUPO,
  PILULA_COMPACTA,
  PILULA_COMPACTA_DESLIGADA,
  PILULA_COMPACTA_LIGADA,
} from '@/components/analiseAtivos/comum/estiloPilulas';
import { useVisualV2 } from '@/components/analiseAtivos/shell/VisualV2';
import type { SeletorNivelProps } from '@/types/analiseAtivosBlocoD';

export default function SeletorNivel<T extends string>({
  opcoes,
  ativo,
  onTrocar,
  rotuloGrupo,
  className = '',
}: SeletorNivelProps<T>) {
  const botoes = useRef<Array<HTMLButtonElement | null>>([]);
  const v2 = useVisualV2();

  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const atual = opcoes.findIndex((o) => o.valor === ativo);
    if (atual < 0) return;
    const passo = e.key === 'ArrowRight' ? 1 : -1;
    const proximo = (atual + passo + opcoes.length) % opcoes.length;
    e.preventDefault();
    onTrocar(opcoes[proximo].valor);
    botoes.current[proximo]?.focus();
  };

  if (v2) {
    return (
      <div
        role="group"
        aria-label={rotuloGrupo}
        onKeyDown={aoTeclar}
        data-seletor-nivel=""
        data-visual-v2=""
        className={`inline-flex flex-none items-center gap-1 ${className}`}
      >
        {opcoes.map((o, i) => {
          const selecionado = o.valor === ativo;
          return (
            <button
              key={o.valor}
              ref={(el) => {
                botoes.current[i] = el;
              }}
              type="button"
              aria-pressed={selecionado}
              onClick={() => {
                if (!selecionado) onTrocar(o.valor);
              }}
              className="group inline-flex min-h-11 items-center justify-center focus-visible:outline-none"
            >
              <span
                className={`${PILULA_COMPACTA} ${ANEL_FOCO_GRUPO} ${
                  selecionado ? PILULA_COMPACTA_LIGADA : PILULA_COMPACTA_DESLIGADA
                }`}
              >
                {o.rotulo}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={rotuloGrupo}
      onKeyDown={aoTeclar}
      data-seletor-nivel=""
      className={`flex w-full flex-none gap-0.5 rounded-[10px] bg-gray-100 p-[3px] sm:inline-flex sm:w-auto dark:bg-white/[0.06] ${className}`}
    >
      {opcoes.map((o, i) => {
        const selecionado = o.valor === ativo;
        return (
          <button
            key={o.valor}
            ref={(el) => {
              botoes.current[i] = el;
            }}
            type="button"
            aria-pressed={selecionado}
            onClick={() => {
              if (!selecionado) onTrocar(o.valor);
            }}
            className={`inline-flex min-h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-[13.5px] sm:flex-none ${ANEL_FOCO} ${
              selecionado
                ? 'bg-[#396CAA] font-semibold text-white shadow-sm dark:bg-[#6E9DC4] dark:text-[#2D2D2D]'
                : 'bg-transparent font-medium text-gray-700 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white'
            }`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
