'use client';

import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';
import {
  MASCARA_VALOR,
  PILULA_HTML,
  contemValorMonetario,
  mascararHtml,
  mascararTexto,
} from '@/utils/valoresOcultos';

/**
 * Esconder valores nos gráficos (ApexCharts) — decisão 7.
 *
 * As séries, barras, fatias, a grade e o eixo X ficam; o que sai são os VALORES:
 * - eixo Y em dinheiro: rótulo '' com a largura reservada (`labels.minWidth`), sem pulo. Eixos de
 *   % continuam (o formatter só some quando devolve R$/US$, ou sempre com `eixosSemSimbolo`);
 * - tooltip (`tooltip.{x,y,z}.formatter` e `tooltip.custom`): pílulas em HTML no lugar dos R$;
 * - dataLabels, legenda e demais formatters (SVG): "R$ •••••"; % ficam;
 * - centro/fatia da rosca (`plotOptions.pie.donut.labels`): "R$ •••••" ou "•••••".
 * Percorre também `responsive[].options`.
 *
 * REGRA DE APLICAÇÃO: o hook recebe SEMPRE as opções FINAIS (no ApexChartWrapper, depois das
 * mobileOptions). Olho aberto devolve a MESMA referência (nada muda).
 */

export interface OpcoesGraficoSensiveis {
  /** Eixos/valores sem símbolo (ex.: "2000K"): esconde direto, sem depender do R$. */
  eixosSemSimbolo?: boolean;
  /** Largura reservada do eixo Y escondido (padrão 56px). */
  larguraEixoY?: number;
}

type Fn = (...args: unknown[]) => unknown;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

const terminaEmPercentual = (s: string) => /%\s*$/.test(s.trim());
const temDigito = (s: string) => /\d/.test(s);

/** Valor sem símbolo: esconde se tiver número e não for %. */
const esconderSemSimbolo = (s: string, mascara: string) =>
  temDigito(s) && !terminaEmPercentual(s) ? mascara : s;

function embrulhar(orig: Fn, transformar: (saida: string) => string): Fn {
  return (...args: unknown[]) => {
    const saida = orig(...args);
    if (saida === null || saida === undefined) return saida;
    return transformar(Array.isArray(saida) ? saida.join(' ') : String(saida));
  };
}

function mascararFormatter(orig: Fn, caminho: string[], opts: OpcoesGraficoSensiveis): Fn {
  const semSimbolo = !!opts.eixosSemSimbolo;
  const emYaxis = caminho.includes('yaxis');
  const emTooltip = caminho.includes('tooltip');
  const emDonut = caminho.includes('donut');
  const eixoX = caminho.includes('xaxis') || (emTooltip && caminho.includes('x'));

  if (emYaxis && caminho[caminho.length - 1] === 'labels') {
    // (a) eixo Y: rótulo vazio quando é dinheiro (a largura fica reservada por minWidth).
    return embrulhar(orig, (s) => (semSimbolo || contemValorMonetario(s) ? '' : s));
  }
  if (emTooltip) {
    // (c) tooltip: o Apex injeta como HTML, então a pílula aparece.
    if (eixoX) return embrulhar(orig, mascararHtml);
    return embrulhar(orig, (s) =>
      contemValorMonetario(s)
        ? mascararHtml(s)
        : semSimbolo
          ? esconderSemSimbolo(s, PILULA_HTML)
          : s,
    );
  }
  if (emDonut) {
    // (d) centro da rosca (SVG): "R$ •••••", ou "•••••" se o total vier sem símbolo.
    return embrulhar(orig, (s) =>
      contemValorMonetario(s) ? mascararTexto(s) : esconderSemSimbolo(s, MASCARA_VALOR),
    );
  }
  // (d)/(e) dataLabels, legenda, eixo X e o resto (SVG).
  return embrulhar(orig, (s) =>
    contemValorMonetario(s)
      ? mascararTexto(s)
      : semSimbolo && !eixoX
        ? esconderSemSimbolo(s, MASCARA_VALOR)
        : s,
  );
}

function percorrer(no: unknown, caminho: string[], opts: OpcoesGraficoSensiveis): unknown {
  if (Array.isArray(no)) return no.map((item) => percorrer(item, caminho, opts));
  if (!isPlainObject(no)) return no;
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(no)) {
    const valor = no[chave];
    if (chave === 'formatter' && typeof valor === 'function') {
      saida[chave] = mascararFormatter(valor as Fn, caminho, opts);
    } else if (
      chave === 'custom' &&
      typeof valor === 'function' &&
      caminho[caminho.length - 1] === 'tooltip'
    ) {
      // (b) tooltip montado à mão (ex.: Proventos): troca os R$ do HTML por pílulas.
      saida[chave] = embrulhar(valor as Fn, (s) =>
        opts.eixosSemSimbolo && !contemValorMonetario(s) ? s : mascararHtml(s),
      );
    } else {
      saida[chave] = percorrer(valor, [...caminho, chave], opts);
    }
  }
  // Eixo Y com formatter: reserva a largura do rótulo que sumiu.
  if (
    caminho[caminho.length - 1] === 'labels' &&
    caminho.includes('yaxis') &&
    typeof saida.formatter === 'function' &&
    saida.minWidth === undefined
  ) {
    saida.minWidth = opts.larguraEixoY ?? 56;
  }
  return saida;
}

const formatterDoEixoY = (eixo: unknown): Fn | undefined => {
  const labels = isPlainObject(eixo) ? eixo.labels : undefined;
  const f = isPlainObject(labels) ? labels.formatter : undefined;
  return typeof f === 'function' ? (f as Fn) : undefined;
};

/**
 * Sem `tooltip.y.formatter`, o Apex mostra no tooltip o valor pelo formatter do eixo Y — que agora
 * devolve ''. Para o tooltip trazer a pílula (e não um valor vazio), cria o formatter do tooltip a
 * partir do formatter ORIGINAL do eixo (o da série, quando há vários eixos).
 */
function tooltipPeloEixoY(
  original: Record<string, unknown>,
  saida: Record<string, unknown>,
  opts: OpcoesGraficoSensiveis,
) {
  const eixos = Array.isArray(original.yaxis) ? original.yaxis : [original.yaxis];
  const formatters = eixos.map(formatterDoEixoY);
  if (!formatters.some(Boolean)) return;
  const tooltip = isPlainObject(original.tooltip) ? original.tooltip : {};
  if (tooltip.enabled === false || typeof tooltip.custom === 'function') return;
  const y = tooltip.y;
  if (Array.isArray(y) || (isPlainObject(y) && typeof y.formatter === 'function')) return;
  const peloEixo: Fn = (valor, ctx) => {
    const i = isPlainObject(ctx) && typeof ctx.seriesIndex === 'number' ? ctx.seriesIndex : 0;
    const f = formatters[Math.min(i, formatters.length - 1)] ?? formatters.find(Boolean);
    return f ? f(valor, ctx) : valor;
  };
  const tooltipSaida = isPlainObject(saida.tooltip) ? saida.tooltip : {};
  saida.tooltip = {
    ...tooltipSaida,
    y: {
      ...(isPlainObject(tooltipSaida.y) ? tooltipSaida.y : {}),
      formatter: mascararFormatter(peloEixo, ['tooltip', 'y'], opts),
    },
  };
}

/** Versão pura (testável): clona as opções preservando funções e mascara os formatters. */
export function mascararOpcoesGrafico<T>(options: T, opts: OpcoesGraficoSensiveis = {}): T {
  const saida = percorrer(options, [], opts);
  if (isPlainObject(options) && isPlainObject(saida)) tooltipPeloEixoY(options, saida, opts);
  return saida as T;
}

export function useOpcoesGraficoSensiveis<T extends ApexOptions>(
  options: T,
  opts?: OpcoesGraficoSensiveis,
): T {
  const { ativo } = useValoresOcultos();
  const eixosSemSimbolo = opts?.eixosSemSimbolo;
  const larguraEixoY = opts?.larguraEixoY;
  return useMemo(
    () => (ativo ? mascararOpcoesGrafico(options, { eixosSemSimbolo, larguraEixoY }) : options),
    [ativo, options, eixosSemSimbolo, larguraEixoY],
  );
}

/**
 * `key` do ReactApexChart: remonta o gráfico ao alternar o olho. O react-apexcharts chama
 * `updateOptions`, e o Apex MESCLA as opções novas nas antigas: chave criada só no modo oculto
 * (`labels.minWidth` do eixo Y, `tooltip.y.formatter`, o `total.formatter` da rosca) sobreviveria
 * ao reabrir o olho. Com a chave desligada o valor é constante (nada remonta).
 */
export function useChaveGraficoSensivel(): string {
  return useValoresOcultos().ativo ? 'valores-ocultos' : 'valores-visiveis';
}
