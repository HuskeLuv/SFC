'use client';

/**
 * MiniBarrasAnuais (v2.4, fatia 0) — valores anuais da janela de um critério (card de critérios,
 * C2). Barras numa cor só (patrimonio #396CAA, ou outside #0079F2 no visual v2 / tranquilidade #6E9DC4
 * no escuro), SEM cor semântica:
 * valor negativo desce abaixo da linha do zero na mesma cor, e só o TEXTO do valor sai em vermelho
 * (#D92D20 / #F97066). Ano sem dado = contorno tracejado rente ao zero. Limite (max/min) opcional
 * como linha tracejada cinza.
 *
 * Acessibilidade: o grupo é focável (tabIndex 0) com role="img" e aria-label de TODOS os anos
 * ('Receita crescente, 2021 a 2025: 2021: 23.600; …'). Hover numa barra ou ← → com foco mostram
 * 'ano: valor' na linha de leitura (aria-hidden; o aria-label já tem tudo).
 */
import { useState, type KeyboardEvent } from 'react';
import { useVisualV2 } from '@/components/analiseAtivos/shell/VisualV2';
import { BARRA_CRITERIO_V2 } from '@/constants/analiseAtivosVisual';
import {
  TEXTOS_CRITERIOS,
  formatarTexto,
  formatarValorCriterio,
} from '@/services/analiseAtivos/textosCriterios';
import type { MiniBarrasAnuaisProps, PontoCriterio } from '@/types/analiseAtivosCriterios';

export type { MiniBarrasAnuaisProps };

const T = TEXTOS_CRITERIOS.barras;
const LARGURA = 10;
const VAO = 3;
const ALTURA = 30;

export function textoAno(p: PontoCriterio, formato: MiniBarrasAnuaisProps['formato']): string {
  return p.valor === null
    ? formatarTexto(T.anoSemDado, { ano: p.ano })
    : formatarTexto(T.anoValor, { ano: p.ano, valor: formatarValorCriterio(p.valor, formato) });
}

export function ariaMiniBarras(
  rotulo: string,
  serie: PontoCriterio[],
  formato: MiniBarrasAnuaisProps['formato'],
): string {
  if (serie.length === 0) return rotulo;
  return formatarTexto(T.aria, {
    rotulo,
    anoInicio: serie[0].ano,
    anoFim: serie[serie.length - 1].ano,
    valores: serie.map((p) => textoAno(p, formato)).join(T.separador),
  });
}

export default function MiniBarrasAnuais({
  serie,
  formato,
  unidade,
  rotulo,
  limite,
  className = '',
}: MiniBarrasAnuaisProps) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const cor = useVisualV2() ? BARRA_CRITERIO_V2 : 'fill-[#396CAA] dark:fill-[#6E9DC4]';
  const pontos = [...serie].sort((a, b) => a.ano - b.ano);
  const valores = pontos.filter((p) => p.valor !== null).map((p) => p.valor as number);
  const refs = limite !== undefined ? [...valores, limite] : valores;
  const maxAbs = Math.max(...refs.map(Math.abs), 0.0001);
  const temNegativo = valores.some((v) => v < 0);
  const zero = temNegativo ? ALTURA / 2 : ALTURA - 0.5;
  const util = temNegativo ? ALTURA / 2 - 1 : ALTURA - 1.5;
  const largura = Math.max(1, pontos.length * (LARGURA + VAO) - VAO);
  const escalar = (v: number) => (Math.abs(v) / maxAbs) * util;

  const indiceLeitura = ativo ?? pontos.length - 1;
  const leitura = pontos[indiceLeitura];
  const negativo = leitura?.valor !== null && (leitura?.valor ?? 0) < 0;

  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const passo = e.key === 'ArrowRight' ? 1 : -1;
    setAtivo(Math.min(pontos.length - 1, Math.max(0, indiceLeitura + passo)));
  };

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`} data-mini-barras="">
      <div
        role="img"
        tabIndex={0}
        aria-label={ariaMiniBarras(rotulo, pontos, formato)}
        onKeyDown={aoTeclar}
        onMouseLeave={() => setAtivo(null)}
        onBlur={() => setAtivo(null)}
        className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]"
      >
        <svg
          width={largura}
          height={ALTURA}
          viewBox={`0 0 ${largura} ${ALTURA}`}
          aria-hidden="true"
          className="overflow-visible"
        >
          {pontos.map((p, i) => {
            const x = i * (LARGURA + VAO);
            const realcada = ativo === i;
            const aoEntrar = () => setAtivo(i);
            if (p.valor === null) {
              return (
                <rect
                  key={p.ano}
                  data-barra="sem_dado"
                  x={x + 0.5}
                  y={zero - 5.5}
                  width={LARGURA - 1}
                  height={5}
                  rx={1.5}
                  fill="none"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  onMouseEnter={aoEntrar}
                  className="stroke-gray-400 dark:stroke-gray-500"
                >
                  <title>{textoAno(p, formato)}</title>
                </rect>
              );
            }
            const h = Math.max(2, escalar(p.valor));
            return (
              <rect
                key={p.ano}
                data-barra={p.valor >= 0 ? 'positivo' : 'negativo'}
                x={x}
                y={p.valor >= 0 ? zero - h : zero}
                width={LARGURA}
                height={h}
                rx={1.5}
                onMouseEnter={aoEntrar}
                className={`${cor} ${ativo === null || realcada ? '' : 'opacity-60'}`}
              >
                <title>{textoAno(p, formato)}</title>
              </rect>
            );
          })}
          {limite !== undefined ? (
            <line
              data-limite=""
              x1={-1}
              x2={largura + 1}
              y1={limite >= 0 ? zero - escalar(limite) : zero + escalar(limite)}
              y2={limite >= 0 ? zero - escalar(limite) : zero + escalar(limite)}
              strokeWidth={1}
              strokeDasharray="3 2"
              className="stroke-gray-400 dark:stroke-gray-500"
            />
          ) : null}
          <line
            data-zero=""
            x1={-1}
            x2={largura + 1}
            y1={zero}
            y2={zero}
            strokeWidth={1}
            className="stroke-gray-300 dark:stroke-gray-600"
          />
        </svg>
      </div>
      {leitura ? (
        <span
          aria-hidden="true"
          data-leitura-barra=""
          className="text-[11.5px] text-gray-500 tabular-nums dark:text-gray-400"
        >
          {leitura.ano}:{' '}
          <span className={negativo ? 'text-[#D92D20] dark:text-[#F97066]' : ''}>
            {formatarValorCriterio(leitura.valor, formato)}
          </span>
          {unidade && leitura.valor !== null ? ` (${unidade})` : ''}
        </span>
      ) : null}
    </div>
  );
}
