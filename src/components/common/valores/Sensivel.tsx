'use client';

import React, { type ReactNode } from 'react';
import { useValoresOcultos } from '@/context/ValoresOcultosContext';
import {
  contemValorMonetario,
  dividirPorValores,
  type SensibilidadeValor,
} from '@/utils/valoresOcultos';

/**
 * Esconder valores — marcação explícita de valor em dinheiro, quantidade ou preço médio.
 *
 * COMO USAR
 * - `<Sensivel>{formatBRL(v)}</Sensivel>`: vira pílula com o olho fechado (largura fixa 5,5em).
 * - `<Sensivel curto>{qtd}</Sensivel>`: pílula curta (3,5em), para quantidades.
 * - `<ValorVisivel>`: exceção explícita (cotação pública, indicador de mercado, valor digitado).
 * - `<TextoSensivel texto="Aplicado R$ 1.234,56" />`: só os trechos R$/US$ viram pílula.
 * - `renderSensivel(node, modo)` / `<ConteudoSensivel modo>`: o mesmo por modo
 *   (`SensibilidadeValor`), para componentes compartilhados (MetricCard, ResponsiveTable…). Em
 *   'auto' só strings com R$/US$ escondem.
 *
 * NUNCA embrulhe elemento interativo (botão, link, input): ele some junto. Embrulhe só o texto.
 *
 * Modo visível (olho aberto, flag desligada ou tela não coberta): renderiza `children` cru — o
 * DOM, o textContent e o nome acessível ficam IDÊNTICOS aos de hoje. Olho fechado numa tela
 * coberta: `span.mf-sensivel` (a pílula, desenhada pelo CSS de globals.css) com o valor fora da
 * árvore de acessibilidade e "valor oculto" só para leitor de tela. O SSR já sai assim (o
 * RootLayout lê o cookie), então não há flash.
 */

export interface SensivelProps {
  /** Pílula curta (quantidades). */
  curto?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Sensivel({ curto = false, className, children }: SensivelProps) {
  const { ativo } = useValoresOcultos();
  if (!ativo) return <>{children}</>;
  const classes = ['mf-sensivel', curto ? 'mf-sensivel--curto' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} data-mf-sensivel="">
      <span className="mf-sensivel__valor" aria-hidden="true">
        {children}
      </span>
      <span className="mf-sensivel__sr">valor oculto</span>
    </span>
  );
}

/** Valor que fica visível mesmo com o olho fechado (cotação, mercado, valor digitado). */
export function ValorVisivel({ children }: { children?: ReactNode }) {
  const { ativo } = useValoresOcultos();
  if (!ativo) return <>{children}</>;
  return <span data-mf-valor-visivel="">{children}</span>;
}

/** Texto livre: só os valores em R$/US$ viram pílula; o resto (%, nomes, datas) fica. */
export function TextoSensivel({ texto }: { texto: string }) {
  const { ativo } = useValoresOcultos();
  if (!ativo || !contemValorMonetario(texto)) return <>{texto}</>;
  return (
    <>
      {dividirPorValores(texto).map((trecho, i) =>
        trecho.sensivel ? (
          <Sensivel key={i}>{trecho.texto}</Sensivel>
        ) : (
          <React.Fragment key={i}>{trecho.texto}</React.Fragment>
        ),
      )}
    </>
  );
}

/** Aplica o modo de sensibilidade a um conteúdo já formatado. */
export function renderSensivel(node: ReactNode, modo: SensibilidadeValor = 'auto'): ReactNode {
  if (node === null || node === undefined || node === false) return node;
  switch (modo) {
    case 'sensivel':
      return <Sensivel>{node}</Sensivel>;
    case 'sensivel-curto':
      return <Sensivel curto>{node}</Sensivel>;
    case 'visivel':
      return <ValorVisivel>{node}</ValorVisivel>;
    default:
      return typeof node === 'string' && contemValorMonetario(node) ? (
        <TextoSensivel texto={node} />
      ) : (
        node
      );
  }
}

/** `renderSensivel` como componente (seguro também quando o pai é server component). */
export function ConteudoSensivel({
  modo = 'auto',
  children,
}: {
  modo?: SensibilidadeValor;
  children?: ReactNode;
}) {
  return <>{renderSensivel(children, modo)}</>;
}
