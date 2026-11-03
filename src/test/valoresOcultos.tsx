import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { expect } from 'vitest';
import { ValoresOcultosProvider } from '@/context/ValoresOcultosContext';
import { REGEX_VALOR_MONETARIO } from '@/utils/valoresOcultos';

/**
 * Helpers de teste do "esconder valores" (fatia 0).
 *
 * - <ComValoresOcultos>: provider com a flag ligada, o olho FECHADO (ou aberto com
 *   `ocultos={false}`). Desde o fechamento da Fase 6 o olho vale em qualquer rota.
 * - SENTINELAS: valores improváveis para pôr nas fixtures. Com o olho fechado, nenhuma
 *   representação deles pode aparecer — pega também quantidade e valor sem "R$".
 * - expectSemValoresExpostos(container): nenhum R$/US$ nem sentinela no texto visível nem em
 *   title/aria-label/aria-description, fora de `.mf-sensivel__valor` e `[data-mf-valor-visivel]`.
 * - expectPilulas(container, n?): quantas pílulas (`.mf-sensivel`) há.
 */

export function ComValoresOcultos({
  children,
  ocultos = true,
}: {
  children: React.ReactNode;
  ocultos?: boolean;
}) {
  return (
    <ValoresOcultosProvider habilitado inicial={ocultos}>
      {children}
    </ValoresOcultosProvider>
  );
}

export function renderComValoresOcultos(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { ocultos?: boolean },
) {
  const { ocultos = true, ...rest } = options ?? {};
  return render(ui, {
    ...rest,
    wrapper: ({ children }) => <ComValoresOcultos ocultos={ocultos}>{children}</ComValoresOcultos>,
  });
}

export const SENTINELAS = {
  saldo: 9876543.21,
  aplicado: 8765432.1,
  quantidade: 7777,
  precoMedio: 66.66,
} as const;

const fmt = (n: number, min: number, max: number, agrupar = true) =>
  n.toLocaleString('pt-BR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: agrupar,
  });

/** Formas com que um sentinela pode aparecer na tela (pt-BR, cru, compacto). */
export function representacoesDoSentinela(n: number): string[] {
  const formas = new Set<string>();
  const inteiro = Number.isInteger(n);
  formas.add(fmt(n, inteiro ? 0 : 2, 2)); // 9.876.543,21 · 7.777 · 66,66
  formas.add(fmt(n, inteiro ? 0 : 2, 2, false)); // 9876543,21 · 7777
  if (Math.abs(n) >= 10000) {
    formas.add(`${Math.trunc(n / 1000)}K`); // 9876K
    formas.add(`${fmt(n / 1000, 0, 0, false)}K`);
  }
  if (Math.abs(n) >= 1_000_000) {
    formas.add(`${fmt(n / 1_000_000, 1, 1)} mi`); // 9,9 mi
    formas.add(`${fmt(n / 1_000_000, 1, 1)} M`);
  }
  return [...formas];
}

const ESCONDIDO = '.mf-sensivel__valor, [data-mf-valor-visivel]';
const ATRIBUTOS = ['title', 'aria-label', 'aria-description'];

/** Textos visíveis (nós de texto + atributos de texto) fora dos trechos escondidos/permitidos. */
export function textosExpostos(container: HTMLElement): string[] {
  const textos: string[] = [];
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let no = walker.nextNode();
  while (no) {
    const pai = no.parentElement;
    if (pai && !pai.closest(ESCONDIDO) && !pai.closest('script, style') && no.textContent) {
      textos.push(no.textContent);
    }
    no = walker.nextNode();
  }
  const elementos = [container, ...Array.from(container.querySelectorAll('*'))];
  for (const el of elementos) {
    if (el.closest(ESCONDIDO)) continue;
    for (const attr of ATRIBUTOS) {
      const v = el.getAttribute(attr);
      if (v) textos.push(v);
    }
  }
  return textos;
}

export function expectSemValoresExpostos(
  container: HTMLElement,
  { sentinelas = Object.values(SENTINELAS) }: { sentinelas?: readonly number[] } = {},
) {
  const textos = textosExpostos(container);
  const tudo = textos.join('\n');
  const monetarios = [
    ...new Set([...textos, tudo].flatMap((t) => t.match(new RegExp(REGEX_VALOR_MONETARIO)) ?? [])),
  ];
  expect(monetarios, 'valores em R$/US$ expostos com o olho fechado').toEqual([]);
  const expostos = sentinelas
    .flatMap(representacoesDoSentinela)
    .filter((forma) => textos.some((t) => t.includes(forma)) || tudo.includes(forma));
  expect(expostos, 'valores-sentinela expostos com o olho fechado').toEqual([]);
}

export function expectPilulas(container: HTMLElement, n?: number) {
  const pilulas = container.querySelectorAll('.mf-sensivel').length;
  if (n === undefined) expect(pilulas, 'nenhuma pílula').toBeGreaterThan(0);
  else expect(pilulas).toBe(n);
}
