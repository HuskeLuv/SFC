'use client';

/**
 * Comparador no celular: um cartão por grupo (faixa patrimonio) e, dentro, uma linha por critério
 * com uma grade de N colunas (cabe 4 a 320px): o ticker em cima e o valor embaixo. ★ com fundo +
 * filete no TOPO + ícone + "destaque". Sem rolagem horizontal.
 */
import type { ReactNode } from 'react';
import ConteudoCelula, {
  classesCelula,
  infoCelula,
} from '@/components/analiseAtivos/comparador/CelulaComparador';
import { ValorIndice } from '@/components/analiseAtivos/comparador/TabelaComparador';
import CelulaNaCarteira, {
  type InfoNaCarteira,
} from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import type { ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const TC = TEXTOS_COMPARADOR;

function Cartao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      aria-label={titulo}
      className="overflow-hidden rounded-[14px] border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="bg-[#396CAA] px-3 py-2 text-[13.5px] font-semibold text-white">{titulo}</div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">{children}</div>
    </section>
  );
}

function Criterio({
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

function Caixa({
  ticker,
  extra = '',
  children,
}: {
  ticker: string;
  extra?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 rounded-lg px-1.5 py-1 ${extra}`}>
      <span className="text-[11.5px] text-gray-500 dark:text-gray-400">{ticker}</span>
      <span className="min-w-0 text-[13.5px]">{children}</span>
    </div>
  );
}

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
      <Cartao titulo={TC.grupos.indice}>
        <Criterio rotulo={TC.linhas.indice.rotulo} sub={null} n={n}>
          {ativos.map((a) => (
            <Caixa key={a.ticker} ticker={a.ticker}>
              <ValorIndice a={a} compacto />
            </Caixa>
          ))}
        </Criterio>
      </Cartao>
      {dados.grupos.map((g) => (
        <Cartao key={g.codigo} titulo={g.rotulo}>
          {g.linhas.map((l) => (
            <Criterio key={l.codigo} rotulo={l.rotulo} sub={l.sub} n={n}>
              {ativos.map((a) => (
                <Caixa
                  key={a.ticker}
                  ticker={a.ticker}
                  extra={classesCelula(infoCelula(l, a.ticker), 'topo')}
                >
                  <ConteudoCelula linha={l} ticker={a.ticker} alinhamento="esquerda" />
                </Caixa>
              ))}
            </Criterio>
          ))}
        </Cartao>
      ))}
      <Cartao titulo={TC.grupos.naCarteira}>
        <Criterio rotulo={TC.linhas.naCarteira.rotulo} sub={TC.linhas.naCarteira.sub} n={n}>
          {ativos.map((a) => (
            <Caixa key={a.ticker} ticker={a.ticker}>
              <CelulaNaCarteira info={naCarteira(a.ticker)} classe={classe} quebrar />
            </Caixa>
          ))}
        </Criterio>
      </Cartao>
    </div>
  );
}
