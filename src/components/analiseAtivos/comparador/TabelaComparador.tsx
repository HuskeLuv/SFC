'use client';

/**
 * Tabela critério × ativo do Comparador (computador). ISONÔMICA (v2.4, fatia D): TABLE_STYLES;
 * table-layout fixed; 1ª coluna de 230 px fixa com fundo opaco; cabeçalho #314666; faixas de grupo
 * (th scope=rowgroup) em patrimonio; contêiner role=region tabIndex=0 com caption sr-only.
 * Ordem: o bloco "Critérios de fundamentos · N anos" PRIMEIRO, depois os grupos de indicadores da
 * API (valores lado a lado, todos com o mesmo fundo) e "Na minha carteira" (overlay do cliente).
 * Os mini-gráficos base 100 ficam num cartão próprio, abaixo da tabela.
 */
import type { ReactNode } from 'react';
import BlocoCriteriosComparador, {
  CabecalhoLinha,
  FaixaGrupo,
} from '@/components/analiseAtivos/comparador/BlocoCriteriosComparador';
import ConteudoCelula from '@/components/analiseAtivos/comparador/CelulaComparador';
import CelulaNaCarteira, {
  type InfoNaCarteira,
} from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import type { ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosCriterios';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const TC = TEXTOS_COMPARADOR;
const COL_FIXA = 230;
const COL_ATIVO = 190;

export interface TabelaComparadorProps {
  dados: ComparadorResposta;
  classe: ClasseQuadro;
  /** "Na minha carteira" de um ticker (overlay do cliente) */
  naCarteira: (ticker: string) => InfoNaCarteira;
}

export default function TabelaComparador({ dados, classe, naCarteira }: TabelaComparadorProps) {
  const ativos = dados.ativos;
  const tickers = ativos.map((a) => a.ticker);
  const n = ativos.length;
  const colunas = n + 1;
  const td = 'px-3.5 py-2.5 text-center align-middle text-[13.5px]';
  const corpo: ReactNode[] = [];

  for (const g of dados.grupos) {
    corpo.push(<FaixaGrupo key={`g-${g.codigo}`} titulo={g.rotulo} colunas={colunas} />);
    for (const l of g.linhas) {
      corpo.push(
        <tr key={`${g.codigo}-${l.codigo}`} className={TABLE_STYLES.row} data-linha={l.codigo}>
          <CabecalhoLinha rotulo={l.rotulo} sub={l.sub} />
          {ativos.map((a) => (
            <td key={a.ticker} className={td}>
              <ConteudoCelula linha={l} ticker={a.ticker} />
            </td>
          ))}
        </tr>,
      );
    }
  }

  corpo.push(<FaixaGrupo key="g-carteira" titulo={TC.grupos.naCarteira} colunas={colunas} />);
  corpo.push(
    <tr key="carteira" className={TABLE_STYLES.row} data-linha="naCarteira">
      <CabecalhoLinha rotulo={TC.linhas.naCarteira.rotulo} sub={TC.linhas.naCarteira.sub} />
      {ativos.map((a) => (
        <td key={a.ticker} className={td}>
          <CelulaNaCarteira info={naCarteira(a.ticker)} classe={classe} />
        </td>
      ))}
    </tr>,
  );

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={TC.tabela.rotuloRegiao}
      className={`${TABLE_STYLES.wrapper} relative outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]`}
    >
      <table
        className={`${TABLE_STYLES.table} table-fixed`}
        style={{ minWidth: COL_FIXA + n * COL_ATIVO }}
        data-tabela-comparador=""
      >
        <caption className="sr-only">
          {formatarTexto(TC.tabela.caption, { valor: tickers.join(', ') })}
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
              <th key={a.ticker} scope="col" className={`${TABLE_STYLES.th} text-center`}>
                {a.ticker}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <BlocoCriteriosComparador
            janela={dados.janela}
            tickers={tickers}
            criterios={Object.fromEntries(ativos.map((a) => [a.ticker, a.criterios]))}
            rotulos={dados.criterios.rotulos}
            equivalencias={dados.criterios.equivalencias}
          />
          {corpo}
        </tbody>
      </table>
    </div>
  );
}
