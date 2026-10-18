'use client';

/**
 * PilulasJanela (v2.4, fatia 0) — escolha da janela dos critérios: 3 | 5 | 10 anos (padrão 5).
 *  - role="radiogroup" com nome acessível; cada opção é role="radio" aria-checked;
 *  - pílula VISÍVEL de 32 px dentro de um alvo de 44 px (min-h-11), também no computador;
 *  - setas ← → (e ↑ ↓) movem e selecionam (roving tabindex: só a selecionada entra no Tab);
 *  - selecionada: preenchida patrimonio #396CAA com texto branco (escuro: tranquilidade #6E9DC4
 *    com texto potencia #2D2D2D) — estiloPilulas.ts, ticket do Pedro de 16/10.
 */
import { useRef, type KeyboardEvent } from 'react';
import {
  ANEL_FOCO_GRUPO,
  PILULA_DESLIGADA,
  PILULA_LIGADA,
} from '@/components/analiseAtivos/comum/estiloPilulas';
import { TEXTOS_CRITERIOS, textoJanela } from '@/services/analiseAtivos/textosCriterios';
import {
  JANELAS_CRITERIOS,
  type Janela,
  type PilulasJanelaProps,
} from '@/types/analiseAtivosCriterios';

export type { PilulasJanelaProps };

export default function PilulasJanela({
  valor,
  onTrocar,
  opcoes = JANELAS_CRITERIOS,
  rotuloGrupo = TEXTOS_CRITERIOS.janela.rotuloGrupo,
  variante = 'padrao',
  className = '',
}: PilulasJanelaProps) {
  const botoes = useRef<Array<HTMLButtonElement | null>>([]);

  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    const passo =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (passo === 0) return;
    const atual = opcoes.indexOf(valor);
    if (atual < 0) return;
    const proximo = (atual + passo + opcoes.length) % opcoes.length;
    e.preventDefault();
    onTrocar(opcoes[proximo] as Janela);
    botoes.current[proximo]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={rotuloGrupo}
      onKeyDown={aoTeclar}
      data-pilulas-janela=""
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {opcoes.map((j, i) => {
        const selecionada = j === valor;
        return (
          <button
            key={j}
            ref={(el) => {
              botoes.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selecionada}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => {
              if (!selecionada) onTrocar(j);
            }}
            className="group inline-flex min-h-11 items-center justify-center focus-visible:outline-none"
          >
            <span
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] whitespace-nowrap tabular-nums ${ANEL_FOCO_GRUPO} ${
                selecionada ? PILULA_LIGADA : PILULA_DESLIGADA
              }`}
            >
              {textoJanela(j as Janela, variante === 'compacta')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
