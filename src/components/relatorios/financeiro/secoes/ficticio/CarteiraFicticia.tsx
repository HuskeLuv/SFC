import { CORES } from '../../cores';
import { fR0 } from '../../formato';
import { Donut } from '../../graficos/Donut';
import { SvgBars } from '../../graficos/SvgBars';
import { CARTEIRA_FICTICIA as F } from '../../ficticio/carteira';
import { MESES_FICTICIOS, ultimos } from '../../ficticio/meses';
import type { PropsFicticio } from '../../tipos';
import { ChartBox } from '../../ui/ChartBox';
import { Kpi } from '../../ui/Kpi';

/**
 * Corpo FICTÍCIO da 4a (dados fixos, rótulos neutros) desenhado sob o cadeado. Nunca usa dado
 * real. Mesmo DOM/classes de real/CarteiraReal.
 */
export function CarteiraFicticia({ meses: n }: PropsFicticio) {
  const nHist = n === 1 ? 6 : n;
  const investido = ultimos(F.investimentos, n).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Patrimônio investido" valor={fR0(F.patrimonio)} sub={F.data} destaque />
        <Kpi
          rotulo="Variação no período"
          valor={`+${fR0(F.variacao)}`}
          sub="investimentos + rendimento"
        />
        <Kpi
          rotulo="Investimentos no período"
          valor={fR0(investido)}
          sub={`${n} ${n > 1 ? 'meses' : 'mês'}`}
        />
        <Kpi
          rotulo="Ativos na carteira"
          valor={String(F.nAtivos)}
          sub={`em ${F.nClasses} classes`}
        />
      </div>
      <div className="two">
        <ChartBox titulo="Distribuição por classe">
          <Donut parts={F.classes} />
        </ChartBox>
        <ChartBox
          titulo="Histórico de patrimônio"
          sub={n === 1 ? 'últimos 6 meses' : 'fim de cada mês'}
        >
          <SvgBars
            labels={ultimos(MESES_FICTICIOS, nHist)}
            series={[{ color: CORES.blue, values: ultimos(F.historico, nHist) }]}
            h={230}
            W={340}
            ariaLabel="Histórico de patrimônio"
          />
        </ChartBox>
      </div>
    </>
  );
}
