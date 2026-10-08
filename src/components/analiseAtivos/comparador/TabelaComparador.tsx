'use client';

/**
 * Tabela critério × ativo do Comparador (computador). TABLE_STYLES; table-layout fixed; 1ª coluna
 * de 230px fixa com fundo opaco; cabeçalho #314666; faixas de grupo (th scope=rowgroup) em
 * patrimonio; contêiner role=region tabIndex=0 com caption sr-only. Linhas: Índice MF (anel, sem
 * ★), os grupos da API (★ com fundo + filete + ícone + "destaque"), "Na minha carteira" (overlay
 * do cliente) e os mini-gráficos base 100 na mesma escala.
 */
import type { ReactNode } from 'react';
import AnelIndice from '@/components/analiseAtivos/comum/AnelIndice';
import { FUNDO_STICKY } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import ConteudoCelula, {
  classesCelula,
  infoCelula,
} from '@/components/analiseAtivos/comparador/CelulaComparador';
import { MiniGrafico } from '@/components/analiseAtivos/comparador/MiniGraficosComparador';
import CelulaNaCarteira, {
  type InfoNaCarteira,
} from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import {
  TABLE_HEADER_STYLE,
  TABLE_SECTION_STYLE,
  TABLE_STYLES,
} from '@/components/ui/table/tableStyles';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { AtivoComparador, ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const TC = TEXTOS_COMPARADOR;
const COL_FIXA = 230;
const COL_ATIVO = 160;

/** Texto "4 de 5 critérios · incompleto" do Índice de um ativo. */
export function textoCriteriosIndice(a: AtivoComparador): string {
  const { criteriosAtendidos: at, criteriosAplicaveis: ap, estado } = a.indice;
  const partes: string[] = [];
  if (at !== null && ap !== null) {
    partes.push(
      formatarTexto(TC.linhas.indice.sub, { atendidos: String(at), aplicaveis: String(ap) }),
    );
  }
  if (estado === 'incompleto') partes.push(TC.celula.indiceIncompleto);
  return partes.join(' · ');
}

export function ValorIndice({ a, compacto = false }: { a: AtivoComparador; compacto?: boolean }) {
  const v = a.indice.valor;
  const numero =
    v === null || a.indice.estado === 'sem_score' || a.indice.estado === 'fora_do_indice'
      ? TC.celula.semDado
      : `${formatarAnalise(v, 'numero')}${a.indice.estado === 'incompleto' ? '*' : ''}`;
  return (
    <span className={`inline-flex items-center gap-2 ${compacto ? '' : 'justify-end'}`}>
      {compacto ? null : <AnelIndice valor={v} estado={a.indice.estado} tamanho={32} />}
      <span className={`flex flex-col ${compacto ? 'items-start' : 'items-end'}`}>
        {/* no computador o número já está dentro do anel */}
        {compacto ? (
          <span className="text-[15px] font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {numero}
          </span>
        ) : null}
        <span className="text-[11.5px] text-gray-500 dark:text-gray-400">
          {textoCriteriosIndice(a)}
        </span>
      </span>
    </span>
  );
}

function FaixaGrupo({ titulo, colunas }: { titulo: string; colunas: number }) {
  return (
    <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
      <th scope="rowgroup" colSpan={colunas} className="px-0 py-1.5 text-left text-[13px]">
        <span className="sticky left-0 inline-block px-3.5">{titulo}</span>
      </th>
    </tr>
  );
}

function CabecalhoLinha({ rotulo, sub }: { rotulo: string; sub: string | null }) {
  return (
    <th
      scope="row"
      className={`sticky left-0 z-[1] px-3.5 py-2.5 text-left text-[13.5px] font-medium whitespace-normal text-gray-800 dark:text-white/90 ${FUNDO_STICKY}`}
    >
      {rotulo}
      {sub ? (
        <small className="block text-xs font-normal text-gray-500 dark:text-gray-400">{sub}</small>
      ) : null}
    </th>
  );
}

export interface TabelaComparadorProps {
  dados: ComparadorResposta;
  classe: ClasseQuadro;
  /** "Na minha carteira" de um ticker (overlay do cliente) */
  naCarteira: (ticker: string) => InfoNaCarteira;
}

export default function TabelaComparador({ dados, classe, naCarteira }: TabelaComparadorProps) {
  const ativos = dados.ativos;
  const n = ativos.length;
  const colunas = n + 1;
  const td = 'px-3.5 py-2.5 text-right align-middle text-[13.5px]';
  const linhaTr = TABLE_STYLES.row;
  const corpo: ReactNode[] = [];

  corpo.push(<FaixaGrupo key="g-indice" titulo={TC.grupos.indice} colunas={colunas} />);
  corpo.push(
    <tr key="indice" className={linhaTr}>
      <CabecalhoLinha rotulo={TC.linhas.indice.rotulo} sub={null} />
      {ativos.map((a) => (
        <td key={a.ticker} className={td}>
          <ValorIndice a={a} />
        </td>
      ))}
    </tr>,
  );

  for (const g of dados.grupos) {
    corpo.push(<FaixaGrupo key={`g-${g.codigo}`} titulo={g.rotulo} colunas={colunas} />);
    for (const l of g.linhas) {
      corpo.push(
        <tr key={`${g.codigo}-${l.codigo}`} className={linhaTr} data-linha={l.codigo}>
          <CabecalhoLinha rotulo={l.rotulo} sub={l.sub} />
          {ativos.map((a) => {
            const info = infoCelula(l, a.ticker);
            return (
              <td key={a.ticker} className={`${td} ${classesCelula(info, 'esquerda')}`}>
                <ConteudoCelula linha={l} ticker={a.ticker} />
              </td>
            );
          })}
        </tr>,
      );
    }
  }

  corpo.push(<FaixaGrupo key="g-carteira" titulo={TC.grupos.naCarteira} colunas={colunas} />);
  corpo.push(
    <tr key="carteira" className={linhaTr}>
      <CabecalhoLinha rotulo={TC.linhas.naCarteira.rotulo} sub={TC.linhas.naCarteira.sub} />
      {ativos.map((a) => (
        <td key={a.ticker} className={td}>
          <CelulaNaCarteira info={naCarteira(a.ticker)} classe={classe} />
        </td>
      ))}
    </tr>,
  );

  if (dados.graficos) {
    const g = dados.graficos;
    corpo.push(<FaixaGrupo key="g-graficos" titulo={g.titulo} colunas={colunas} />);
    corpo.push(
      <tr key="graficos" className={linhaTr}>
        <CabecalhoLinha rotulo={TC.graficos.rotuloLinha} sub={TC.graficos.subLinha} />
        {g.series.map((s) => (
          <td key={s.ticker} className={`${td} align-bottom`}>
            <MiniGrafico serie={s} graficos={g} />
          </td>
        ))}
      </tr>,
    );
  }

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={TC.tabela.rotuloRegiao}
      className={`${TABLE_STYLES.wrapper} outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]`}
    >
      <table
        className={`${TABLE_STYLES.table} table-fixed`}
        style={{ minWidth: COL_FIXA + n * COL_ATIVO }}
        data-tabela-comparador=""
      >
        <caption className="sr-only">
          {formatarTexto(TC.tabela.caption, { valor: ativos.map((a) => a.ticker).join(', ') })}
        </caption>
        <colgroup>
          <col style={{ width: COL_FIXA }} />
          {ativos.map((a) => (
            <col key={a.ticker} />
          ))}
        </colgroup>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <th
              scope="col"
              className={`${TABLE_STYLES.th} sticky left-0 z-[2] text-left`}
              style={TABLE_HEADER_STYLE}
            >
              {TC.tabela.colunaCriterio}
            </th>
            {ativos.map((a) => (
              <th key={a.ticker} scope="col" className={`${TABLE_STYLES.th} text-right`}>
                {a.ticker}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{corpo}</tbody>
      </table>
    </div>
  );
}
