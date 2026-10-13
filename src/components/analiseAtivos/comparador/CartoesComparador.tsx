'use client';

/**
 * Comparador no celular (v2.4, fatia D): o bloco de critérios PRIMEIRO (cartão "Critérios de
 * fundamentos · N anos"), depois um cartão por grupo de indicadores e "Na minha carteira". Dentro
 * de cada cartão, uma linha por item com uma grade de N colunas (cabe 4 a 320 px): o ticker em
 * cima e o valor embaixo. Todas as caixas com o mesmo fundo; sem rolagem horizontal.
 */
import BlocoCriteriosComparador, {
  CaixaCartao,
  CartaoGrupo,
  LinhaCartao,
} from '@/components/analiseAtivos/comparador/BlocoCriteriosComparador';
import ConteudoCelula from '@/components/analiseAtivos/comparador/CelulaComparador';
import CelulaNaCarteira, {
  type InfoNaCarteira,
} from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import type { ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const TC = TEXTOS_COMPARADOR;

export interface CartoesComparadorProps {
  dados: ComparadorResposta;
  classe: ClasseQuadro;
  naCarteira: (ticker: string) => InfoNaCarteira;
}

export default function CartoesComparador({ dados, classe, naCarteira }: CartoesComparadorProps) {
  const ativos = dados.ativos;
  const n = ativos.length;
  return (
    <div className="flex flex-col gap-3" data-cartoes-comparador="">
      <BlocoCriteriosComparador
        variante="cartao"
        janela={dados.janela}
        tickers={ativos.map((a) => a.ticker)}
        criterios={Object.fromEntries(ativos.map((a) => [a.ticker, a.criterios]))}
        rotulos={dados.criterios.rotulos}
        equivalencias={dados.criterios.equivalencias}
      />
      {dados.grupos.map((g) => (
        <CartaoGrupo key={g.codigo} titulo={g.rotulo}>
          {g.linhas.map((l) => (
            <LinhaCartao key={l.codigo} rotulo={l.rotulo} sub={l.sub} n={n}>
              {ativos.map((a) => (
                <CaixaCartao key={a.ticker} ticker={a.ticker}>
                  <ConteudoCelula linha={l} ticker={a.ticker} alinhamento="esquerda" />
                </CaixaCartao>
              ))}
            </LinhaCartao>
          ))}
        </CartaoGrupo>
      ))}
      <CartaoGrupo titulo={TC.grupos.naCarteira}>
        <LinhaCartao rotulo={TC.linhas.naCarteira.rotulo} sub={TC.linhas.naCarteira.sub} n={n}>
          {ativos.map((a) => (
            <CaixaCartao key={a.ticker} ticker={a.ticker}>
              <CelulaNaCarteira info={naCarteira(a.ticker)} classe={classe} quebrar />
            </CaixaCartao>
          ))}
        </LinhaCartao>
      </CartaoGrupo>
    </div>
  );
}
