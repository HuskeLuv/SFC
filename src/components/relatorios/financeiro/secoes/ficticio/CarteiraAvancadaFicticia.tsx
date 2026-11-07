import { CORES } from '../../cores';
import { fAxP, fP, fR0 } from '../../formato';
import { SvgBars } from '../../graficos/SvgBars';
import { SvgLines } from '../../graficos/SvgLines';
import { PROVENTOS_FICTICIOS, RENTABILIDADE_FICTICIA } from '../../ficticio/carteira';
import { MESES_FICTICIOS, ultimos } from '../../ficticio/meses';
import type { PropsFicticio } from '../../tipos';
import { Callout } from '../../ui/Callout';
import { ChartBox } from '../../ui/ChartBox';
import { Kpi } from '../../ui/Kpi';
import { Legenda } from '../../ui/Legenda';
import { CoberturaFgcFicticia } from './CoberturaFgcFicticia';

/** Pontos por mês da série fictícia. */
const PPM = 8;

/** Série acumulada fictícia de 0 a `fim`, com uma oscilação fixa. */
function serie(fim: number, pontos: number, amplitude: number, fase: number): number[] {
  return Array.from({ length: pontos }, (_, i) => {
    const t = pontos === 1 ? 1 : i / (pontos - 1);
    const onda = i === 0 ? 0 : Math.sin(i * 0.9 + fase) * amplitude * Math.sqrt(t);
    return fim * t + onda;
  });
}

/**
 * Corpo FICTÍCIO da 4b (dados fixos) desenhado sob o cadeado. Nunca usa dado real. Mesmo
 * DOM/classes de real/CarteiraAvancadaReal.
 */
export function CarteiraAvancadaFicticia({ meses: n }: PropsFicticio) {
  const r = RENTABILIDADE_FICTICIA[n] ?? RENTABILIDADE_FICTICIA[1];
  const pontos = n * PPM + 1;
  const amp = Math.max(0.3, n * 0.25);
  const meses = ultimos(MESES_FICTICIOS, n);
  const xTicks: [number, string][] =
    n === 1
      ? [
          [0, '01/11'],
          [Math.round(pontos / 3), '10/11'],
          [Math.round((2 * pontos) / 3), '20/11'],
          [pontos - 1, '30/11'],
        ]
      : meses.filter((_, k) => n < 12 || k % 2 === 0).map((m) => [meses.indexOf(m) * PPM, m]);
  const prov = ultimos(PROVENTOS_FICTICIOS, n);
  const provTotal = prov.reduce((a, p) => a + p[0] + p[1] + p[2] + p[3], 0);
  const real = ((1 + r.carteira / 100) / (1 + r.ipca / 100) - 1) * 100;
  return (
    <>
      <div className="block">
        <h3>
          Rentabilidade (TWR) <small>carteira x índices, acumulado no período</small>
        </h3>
        <div className="kpis">
          <Kpi rotulo="Carteira" valor={fP(r.carteira, 2)} sub="TWR no período" destaque />
          <Kpi
            rotulo="% do CDI"
            valor={fP((r.carteira / r.cdi) * 100, 0)}
            sub={`CDI ${fP(r.cdi, 2)}`}
          />
          <Kpi rotulo="Rentabilidade real" valor={fP(real, 2)} sub="acima do IPCA" />
          <Kpi rotulo="Ibovespa" valor={fP(r.ibov, 2)} sub="mesmo período" />
        </div>
        <div className="chart">
          <Legenda
            series={[
              { nome: 'Carteira', cor: CORES.blue },
              { nome: 'Ibovespa', cor: CORES.ink },
              { nome: 'CDI', cor: CORES.b6 },
              { nome: 'IPCA', cor: CORES.b2 },
            ]}
          />
          <SvgLines
            series={[
              { color: CORES.ink, values: serie(r.ibov, pontos, amp * 2, 1), w: 1.2 },
              { color: CORES.b6, values: serie(r.cdi, pontos, 0, 0) },
              { color: CORES.b2, values: serie(r.ipca, pontos, 0, 0) },
              { color: CORES.blue, values: serie(r.carteira, pontos, amp, 2), w: 2.2, dot: true },
            ]}
            xTicks={xTicks}
            fmt={fAxP}
            h={210}
            ariaLabel="Rentabilidade acumulada da carteira e dos índices"
          />
        </div>
      </div>
      <div className="two">
        <ChartBox titulo="Proventos recebidos" sub={`${fR0(provTotal)} no período`}>
          <Legenda
            series={[
              { nome: 'FIIs', cor: CORES.gold },
              { nome: 'Ações', cor: CORES.navy },
              { nome: 'JCP', cor: CORES.b4 },
              { nome: 'Exterior', cor: CORES.b2 },
            ]}
          />
          <SvgBars
            labels={meses}
            stack
            h={200}
            W={340}
            series={[
              { color: CORES.gold, values: prov.map((p) => p[0]) },
              { color: CORES.navy, values: prov.map((p) => p[1]) },
              { color: CORES.b4, values: prov.map((p) => p[2]) },
              { color: CORES.b2, values: prov.map((p) => p[3]) },
            ]}
            ariaLabel="Proventos recebidos por mês e por tipo"
          />
          <span className="fine">Valores líquidos recebidos no período.</span>
        </ChartBox>
        <CoberturaFgcFicticia />
      </div>
      <Callout>
        <b>IR mensal de ações e FIIs:</b> em breve no relatório. Veja agora em{' '}
        <span className="lk-txt">Análises &gt; IR</span>.
      </Callout>
    </>
  );
}
