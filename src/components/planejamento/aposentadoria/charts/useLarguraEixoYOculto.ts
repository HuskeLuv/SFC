'use client';

import { useMemo, type RefObject } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';

/** Largura padrão do eixo Y escondido quando não dá para medir (SSR, jsdom). */
const LARGURA_PADRAO = 56;

function medirNoCanvas(textos: string[], fontSize: number): number {
  if (typeof document === 'undefined') return LARGURA_PADRAO;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return LARGURA_PADRAO;
    ctx.font = `400 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    const largura = Math.ceil(Math.max(0, ...textos.map((t) => ctx.measureText(t).width)));
    return largura > 0 ? largura : LARGURA_PADRAO;
  } catch {
    return LARGURA_PADRAO;
  }
}

/** Topo "redondo" do eixo (7.900 → 8.000; 9.600 → 10.000), como o forceNiceScale do Apex. */
const topoRedondo = (v: number) => {
  if (v <= 0) return 0;
  const passo = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / passo) * passo;
};

/**
 * Rótulos que o eixo Y das opções FINAIS mostraria para o maior valor das séries (e o topo
 * redondo do eixo): é o que a medida no canvas usa quando não há rótulo na tela.
 */
export function rotulosDoEixoY(options: ApexOptions, maiorValor: number): string[] {
  const eixo = Array.isArray(options.yaxis) ? options.yaxis[0] : options.yaxis;
  const formatter = eixo?.labels?.formatter as ((v: number) => string | string[]) | undefined;
  if (!formatter) return [];
  return [maiorValor, topoRedondo(maiorValor)].map((v) => String(formatter(v)));
}

/**
 * Esconder valores (decisão 7) nos gráficos da Aposentadoria: largura que o eixo Y SEM rótulo
 * reserva (`larguraEixoY` do useOpcoesGraficoSensiveis), para a área do gráfico não pular ao
 * fechar o olho. Mesmo critério do LineChartCarteiraHistorico: ao fechar o olho, os rótulos ainda
 * estão na tela e a largura real do mais largo é a medida; abrindo a página já oculta, mede no
 * canvas os rótulos que o eixo teria (`rotulos`, já formatados).
 */
export function useLarguraEixoYOculto(
  containerRef: RefObject<HTMLElement | null>,
  rotulos: string[],
  fontSize = 11,
): number {
  const { ativo } = useValoresOcultos();
  const chaveRotulos = rotulos.join('|');
  return useMemo(() => {
    if (!ativo) return LARGURA_PADRAO;
    const naTela = containerRef.current?.querySelectorAll('.apexcharts-yaxis-label') ?? [];
    const medida = Math.max(
      0,
      ...Array.from(naTela, (r) => (r.textContent?.trim() ? r.getBoundingClientRect().width : 0)),
    );
    if (medida > 0) return Math.ceil(medida);
    return medirNoCanvas(chaveRotulos.split('|'), fontSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, chaveRotulos, fontSize]);
}
