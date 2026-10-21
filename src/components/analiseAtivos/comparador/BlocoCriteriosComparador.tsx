'use client';

/**
 * BlocoCriteriosComparador (v2.4, fatia D) — "Critérios de fundamentos · N anos", o PRIMEIRO bloco
 * do Comparador. Os critérios aparecem lado a lado, com marcas NEUTRAS (✓ / — / n/a, nunca
 * verde/vermelho), a frase factual de cada ativo e, no fim, "Critérios atendidos: n de k" (k = 6;
 * v2.5: financeiras também 6, salvo se os params religarem o D4). Nenhuma célula ganha fundo,
 * filete ou ícone por ter mais critérios atendidos: a diferença de denominador fica visível só pelo
 * texto. Rótulos da v2 vêm da resposta ('Alavancagem ≤ 20% do PL', 'Dív. líq./EBITDA < 3×'); a
 * observação do resultado (lucro sem o descontado na fonte) vai junto da frase.
 *
 * - 'tabela' (computador): devolve as <tr> para o <tbody> da TabelaComparador (faixa de grupo +
 *   uma linha por critério + a linha de contagem com borda de 2 px);
 * - 'cartao' (celular): um cartão com uma linha por critério e uma grade de N colunas.
 * Linhas = `rotulos` (id → rótulo, na ordem do perfil). No misto, a linha de tijolo acha a marca
 * do fundo de papel pela equivalência (vac ↔ inad, alav ↔ ltv).
 * 'sem_dado' conta como não atende: "não atende · sem dado nas demonstrações".
 */
import { useVisualV2 } from '@/components/analiseAtivos/shell/VisualV2';
import { VISUAL_V2 } from '@/constants/analiseAtivosVisual';
import type { ReactNode } from 'react';
import { FUNDO_STICKY } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import MarcaCriterio from '@/components/analiseAtivos/comum/MarcaCriterio';
import { TABLE_SECTION_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import {
  TEXTOS_CRITERIOS,
  formatarTexto,
  textoContador,
} from '@/services/analiseAtivos/textosCriterios';
import type {
  BlocoCriteriosComparadorProps,
  CriteriosLinhaApi,
  IdCriterio,
  MarcaCriterioLinha,
} from '@/types/analiseAtivosCriterios';

export type { BlocoCriteriosComparadorProps };

const TC = TEXTOS_COMPARADOR;
const TCR = TEXTOS_CRITERIOS;

// ---------------------------------------------------------------------------
// Peças comuns (tabela e cartões do Comparador)
// ---------------------------------------------------------------------------

/** Faixa de grupo da tabela (th scope=rowgroup, azul patrimonio do TABLE_STYLES). */
export function FaixaGrupo({ titulo, colunas }: { titulo: string; colunas: number }) {
  const v2 = useVisualV2();
  if (v2) {
    // visual v2 (item C7): faixa cinza (superfície 2) em caixa alta 11 px, no lugar do
    // TABLE_SECTION_STYLE (que não muda)
    return (
      <tr className="border-b border-gray-200 dark:border-gray-800" data-faixa-v2="">
        <th
          scope="rowgroup"
          colSpan={colunas}
          className={`px-0 py-[7px] text-left text-[11px] font-semibold tracking-[0.06em] text-gray-800 uppercase dark:text-white/90 ${VISUAL_V2.superficie2}`}
        >
          <span className="sticky left-0 inline-block px-3.5">{titulo}</span>
        </th>
      </tr>
    );
  }
  return (
    <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
      <th scope="rowgroup" colSpan={colunas} className="px-0 py-1.5 text-left text-[13px]">
        <span className="sticky left-0 inline-block px-3.5">{titulo}</span>
      </th>
    </tr>
  );
}

/** Cabeçalho de linha fixo à esquerda (fundo opaco). */
export function CabecalhoLinha({
  rotulo,
  sub,
  forte = false,
}: {
  rotulo: string;
  sub: string | null;
  forte?: boolean;
}) {
  const v2 = useVisualV2();
  // visual v2 (item C7): rótulo da linha em cinza (td.lbl), o total segue forte
  const cor =
    v2 && !forte ? 'text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-white/90';
  return (
    <th
      scope="row"
      className={`sticky left-0 z-[1] px-3.5 py-2.5 text-left text-[13.5px] whitespace-normal ${cor} ${
        forte ? 'font-semibold' : 'font-medium'
      } ${FUNDO_STICKY}`}
    >
      {rotulo}
      {sub ? (
        <small className="block text-xs font-normal text-gray-500 dark:text-gray-400">{sub}</small>
      ) : null}
    </th>
  );
}

/** Cartão de um grupo (celular). */
export function CartaoGrupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      aria-label={titulo}
      className="overflow-hidden rounded-[14px] border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <h3 className="m-0 bg-[#396CAA] px-3 py-2 text-[13.5px] font-semibold text-white">
        {titulo}
      </h3>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">{children}</div>
    </section>
  );
}

/** Linha de um cartão: rótulo em cima e uma grade de N colunas (cabe 4 a 320 px). */
export function LinhaCartao({
  rotulo,
  sub,
  n,
  children,
}: {
  rotulo: string;
  sub: string | null;
  n: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <span className="text-[13px] font-medium text-gray-800 dark:text-white/90">
        {rotulo}
        {sub ? (
          <small className="font-normal text-gray-500 dark:text-gray-400"> · {sub}</small>
        ) : null}
      </span>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {children}
      </div>
    </div>
  );
}

/** Caixa de um ativo dentro da linha do cartão (ticker em cima, valor embaixo). */
export function CaixaCartao({ ticker, children }: { ticker: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-1.5 py-1">
      <span className="text-[11.5px] text-gray-500 dark:text-gray-400">{ticker}</span>
      <span className="min-w-0 text-[13.5px]">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------

/** Marca do ativo para a linha `id` (ou a equivalente, no misto). */
export function marcaDaLinha(
  criterios: CriteriosLinhaApi | null,
  id: IdCriterio,
  equivalencias: Partial<Record<IdCriterio, IdCriterio>> = {},
): MarcaCriterioLinha | null {
  if (!criterios) return null;
  const eq = equivalencias[id];
  return criterios.marcas.find((m) => m.id === id || (eq !== undefined && m.id === eq)) ?? null;
}

/** Frase visível sob a marca (o estado vai no sr-only da MarcaCriterio). */
export function fraseDaMarca(m: MarcaCriterioLinha): string {
  if (m.estado === 'nao_se_aplica') return TCR.estados.nao_se_aplica;
  if (m.estado === 'sem_dado') {
    const fato = m.fato || TCR.fatos.semDado;
    return fato.startsWith(TCR.estados.nao_atende)
      ? fato
      : formatarTexto(TC.criterios.naoAtendePrefixo, { fato });
  }
  return m.fato;
}

function ConteudoMarca({ marca, cartao }: { marca: MarcaCriterioLinha | null; cartao: boolean }) {
  const alinhar = cartao ? 'items-start text-left' : 'items-center text-center';
  if (!marca) {
    return (
      <span className={`inline-flex flex-col gap-1 ${alinhar}`}>
        <span aria-hidden="true" className="text-gray-500 dark:text-gray-400">
          {TC.celula.semDado}
        </span>
        <small className="text-xs text-gray-500 dark:text-gray-400">
          {TC.criterios.semAvaliacaoTexto}
        </small>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex max-w-full min-w-0 flex-col gap-1 ${alinhar}`}
      title={marca.estado === 'nao_se_aplica' ? marca.fato : undefined}
    >
      <MarcaCriterio estado={marca.estado} />
      <small
        className={`block text-xs leading-[1.35] text-gray-500 dark:text-gray-400 ${
          cartao ? '[overflow-wrap:anywhere]' : 'mx-auto max-w-[240px] whitespace-normal'
        }`}
      >
        {fraseDaMarca(marca)}
      </small>
      {marca.obs?.map((o) => (
        <small
          key={o}
          data-obs-criterio={o}
          className={`block text-[11.5px] leading-[1.35] text-gray-500 italic dark:text-gray-400 ${
            cartao ? '[overflow-wrap:anywhere]' : 'mx-auto max-w-[240px] whitespace-normal'
          }`}
        >
          {TCR.obs[o]}
        </small>
      ))}
    </span>
  );
}

function Contagem({ criterios }: { criterios: CriteriosLinhaApi | null }) {
  if (!criterios) {
    return (
      <span className="text-[13px] text-gray-500 dark:text-gray-400">
        {TC.criterios.semAvaliacao}
      </span>
    );
  }
  return (
    <b className="text-[15px] font-semibold text-gray-800 tabular-nums dark:text-white/90">
      {textoContador(criterios.n, criterios.de)}
    </b>
  );
}

export type BlocoCriteriosComparadorPropsD = BlocoCriteriosComparadorProps & {
  /** 'tabela' (linhas do <tbody>, padrão) ou 'cartao' (celular) */
  variante?: 'tabela' | 'cartao';
  /** id da linha (tijolo) → id do papel; só no misto */
  equivalencias?: Partial<Record<IdCriterio, IdCriterio>>;
};

export default function BlocoCriteriosComparador({
  janela,
  tickers,
  criterios,
  rotulos,
  equivalencias = {},
  variante = 'tabela',
  className = '',
}: BlocoCriteriosComparadorPropsD) {
  const titulo = formatarTexto(TCR.janela.tituloComJanela, { anos: janela });
  const linhas = Object.entries(rotulos) as Array<[IdCriterio, string]>;
  const n = tickers.length;

  if (variante === 'cartao') {
    return (
      <div className={className} data-bloco-criterios="cartao">
        <CartaoGrupo titulo={titulo}>
          {linhas.map(([id, rotulo]) => (
            <LinhaCartao key={id} rotulo={rotulo} sub={null} n={n}>
              {tickers.map((t) => (
                <CaixaCartao key={t} ticker={t}>
                  <ConteudoMarca
                    marca={marcaDaLinha(criterios[t] ?? null, id, equivalencias)}
                    cartao
                  />
                </CaixaCartao>
              ))}
            </LinhaCartao>
          ))}
          <LinhaCartao rotulo={TC.criterios.atendidos} sub={null} n={n}>
            {tickers.map((t) => (
              <CaixaCartao key={t} ticker={t}>
                <Contagem criterios={criterios[t] ?? null} />
              </CaixaCartao>
            ))}
          </LinhaCartao>
        </CartaoGrupo>
      </div>
    );
  }

  const td = 'px-3.5 py-2.5 text-center align-top text-[13.5px]';
  return (
    <>
      <FaixaGrupo titulo={titulo} colunas={n + 1} />
      {linhas.map(([id, rotulo]) => (
        <tr key={id} className={TABLE_STYLES.row} data-criterio={id}>
          <CabecalhoLinha rotulo={rotulo} sub={null} />
          {tickers.map((t) => (
            <td key={t} className={td}>
              <ConteudoMarca
                marca={marcaDaLinha(criterios[t] ?? null, id, equivalencias)}
                cartao={false}
              />
            </td>
          ))}
        </tr>
      ))}
      <tr
        className="border-t-2 border-b border-t-gray-200 border-b-gray-100 dark:border-t-gray-700 dark:border-b-gray-800"
        data-criterio="atendidos"
      >
        <CabecalhoLinha rotulo={TC.criterios.atendidos} sub={null} forte />
        {tickers.map((t) => (
          <td key={t} className={`${td} align-middle`}>
            <Contagem criterios={criterios[t] ?? null} />
          </td>
        ))}
      </tr>
    </>
  );
}
