import { CORES } from '../../cores';
import { fAxP, fP, fR0 } from '../../formato';
import { ticks } from '../../graficos/escala';
import { SvgBars } from '../../graficos/SvgBars';
import { SvgLines } from '../../graficos/SvgLines';
import { PLANEJAMENTO_FICTICIO as F } from '../../ficticio/planejamento';
import { MESES_FICTICIOS, ultimos } from '../../ficticio/meses';
import type { PropsFicticio } from '../../tipos';
import { ChartBox } from '../../ui/ChartBox';
import { Kpi } from '../../ui/Kpi';
import { Legenda } from '../../ui/Legenda';

/**
 * Corpo FICTÍCIO da seção 5 (dados fixos, rótulos neutros) desenhado sob o cadeado. Nunca usa
 * dado real. Mesmo DOM/classes de real/PlanejamentoReal.
 */
export function PlanejamentoFicticio({ meses: n }: PropsFicticio) {
  const nEvo = n === 1 ? 6 : n;
  const dif = F.realizado - F.planejado;
  const labels = ultimos(MESES_FICTICIOS, n);
  const rr = ultimos(F.rentabilidade, n);
  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Patrimônio realizado" valor={fR0(F.realizado)} sub="hoje" destaque />
        <Kpi rotulo="Patrimônio planejado" valor={fR0(F.planejado)} sub="para hoje" />
        <Kpi
          rotulo="À frente do plano"
          valor={`+${fR0(dif)}`}
          sub={`${fP((dif / F.planejado) * 100)} do planejado`}
          tom="good"
        />
        <Kpi rotulo="Meta de independência" valor={F.meta} sub={F.metaSub} />
      </div>
      <ChartBox
        titulo="Evolução patrimonial: projetado x realizado"
        sub={n === 1 ? 'últimos 6 meses' : undefined}
      >
        <Legenda
          series={[
            { nome: 'Projetado', cor: CORES.grey },
            { nome: 'Realizado', cor: CORES.blue },
          ]}
        />
        <SvgLines
          series={[
            { color: '#9aa5b5', values: ultimos(F.seriePlanejado, nEvo), dash: true },
            { color: CORES.blue, values: ultimos(F.serieRealizado, nEvo), dot: true, w: 2.2 },
          ]}
          xTicks={ticks(ultimos(MESES_FICTICIOS, nEvo), 7)}
          h={190}
          ariaLabel="Evolução patrimonial"
        />
      </ChartBox>
      <div className="two">
        <ChartBox titulo="Depósito mensal: projetado x realizado">
          <Legenda
            series={[
              { nome: 'Projetado', cor: CORES.grey },
              { nome: 'Realizado', cor: CORES.blue },
            ]}
          />
          <SvgBars
            labels={labels}
            series={[
              { color: CORES.grey, values: ultimos(F.depositoProjetado, n) },
              { color: CORES.blue, values: ultimos(F.depositoRealizado, n) },
            ]}
            h={200}
            W={340}
            ariaLabel="Depósito mensal"
          />
        </ChartBox>
        <ChartBox
          titulo="Rentabilidade mensal x meta"
          sub={`linha = meta ${fP(F.metaMensal, 3)} a.m.`}
        >
          <SvgBars
            labels={labels}
            series={[
              {
                color: CORES.blue,
                values: rr,
                colors: rr.map((v) => (v >= F.metaMensal ? CORES.blue : '#9fb6d3')),
              },
            ]}
            h={210}
            fmt={fAxP}
            refLine={F.metaMensal}
            W={340}
            ariaLabel="Rentabilidade mensal contra a meta"
          />
        </ChartBox>
      </div>
      <p className="fine">
        Rentabilidade mensal calculada por TWR. Projetado x realizado no período.
      </p>
    </>
  );
}
