import { CORES } from '../../cores';
import { fAxP, fP, rotuloMes, soma } from '../../formato';
import { useFormato } from '../../FormatoProvider';
import { SvgBars } from '../../graficos/SvgBars';
import { SvgLines } from '../../graficos/SvgLines';
import type { PropsCarteiraAvancadaReal } from '../../tipos';
import { ChartBox } from '../../ui/ChartBox';
import { Kpi } from '../../ui/Kpi';
import { Legenda } from '../../ui/Legenda';
import { CoberturaFgcReal } from './CoberturaFgcReal';
import { IrRendaVariavelReal } from './IrRendaVariavelReal';

/** Marcas do eixo x: dias com n=1, início de cada mês nos demais (de 2 em 2 com 12 meses). */
function marcasX(datas: string[], n: number): [number, string][] {
  if (datas.length === 0) return [];
  if (n === 1) {
    const max = datas.length - 1;
    const idx = [0, Math.round(max / 3), Math.round((2 * max) / 3), max];
    return [...new Set(idx)].map((i) => [i, `${datas[i].slice(8, 10)}/${datas[i].slice(5, 7)}`]);
  }
  const out: [number, string][] = [];
  const vistos = new Set<string>();
  datas.forEach((d, i) => {
    const mes = d.slice(0, 7);
    if (i === 0 || vistos.has(mes)) {
      vistos.add(mes);
      return;
    }
    vistos.add(mes);
    out.push([out.length === 0 ? 0 : i, rotuloMes(mes)]);
  });
  return n >= 12 ? out.filter((_, k) => k % 2 === 0) : out;
}

/**
 * Corpo REAL da 4b (rótulos do Pedro). Só entra por next/dynamic quando temAcesso.
 * Export default (next/dynamic).
 */
export default function CarteiraAvancadaReal({
  relatorio,
  carteiraAvancada: ca,
}: PropsCarteiraAvancadaReal) {
  const { fR0, fAx } = useFormato();
  const n = relatorio.periodo.meses;
  const { twr, cdi, ipca, ibov, retornoDiario: rd } = ca;
  const pctCdi = twr != null && cdi != null && cdi > 0 ? (twr / cdi) * 100 : null;
  const real = twr != null && ipca != null ? ((1 + twr / 100) / (1 + ipca / 100) - 1) * 100 : null;
  const temSerie = rd.datas.length > 1 && rd.carteira.length === rd.datas.length;
  const prov = ca.proventos;
  const provTotal = soma(prov.map((p) => p.fii + p.acao + p.jcp + p.exterior));
  return (
    <>
      <div className="block">
        <h3>
          Rentabilidade (TWR) <small>carteira x índices, acumulado no período</small>
        </h3>
        <div className="kpis">
          <Kpi
            rotulo="Carteira"
            valor={twr == null ? '—' : fP(twr, 2)}
            sub={twr == null ? 'rentabilidade em processamento' : 'TWR no período'}
            destaque
          />
          <Kpi
            rotulo="% do CDI"
            valor={pctCdi == null ? '—' : fP(pctCdi, 0)}
            sub={cdi == null ? 'CDI indisponível' : `CDI ${fP(cdi, 2)}`}
          />
          <Kpi
            rotulo="Rentabilidade real"
            valor={real == null ? '—' : fP(real, 2)}
            sub={real != null && real < 0 ? 'abaixo do IPCA' : 'acima do IPCA'}
          />
          <Kpi rotulo="Ibovespa" valor={ibov == null ? '—' : fP(ibov, 2)} sub="mesmo período" />
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
          {temSerie ? (
            <SvgLines
              series={[
                { color: CORES.ink, values: rd.ibov, w: 1.2 },
                { color: CORES.b6, values: rd.cdi },
                { color: CORES.b2, values: rd.ipca },
                { color: CORES.blue, values: rd.carteira, w: 2.2, dot: true },
              ]}
              xTicks={marcasX(rd.datas, n)}
              fmt={fAxP}
              h={210}
              ariaLabel="Rentabilidade acumulada da carteira, do Ibovespa, do CDI e do IPCA"
            />
          ) : (
            <p className="fine">
              Rentabilidade em processamento: o gráfico aparece na próxima geração.
            </p>
          )}
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
          {provTotal === 0 ? (
            <p className="fine">Nenhum provento recebido no período.</p>
          ) : (
            <SvgBars
              fmt={fAx}
              labels={prov.map((p) => rotuloMes(p.mes))}
              stack
              h={200}
              W={340}
              series={[
                { color: CORES.gold, values: prov.map((p) => p.fii) },
                { color: CORES.navy, values: prov.map((p) => p.acao) },
                { color: CORES.b4, values: prov.map((p) => p.jcp) },
                { color: CORES.b2, values: prov.map((p) => p.exterior) },
              ]}
              ariaLabel="Proventos recebidos por mês e por tipo"
            />
          )}
          <span className="fine">
            Líquido pago, em reais pelo câmbio da data de pagamento. Pode diferir da aba Proventos.
          </span>
        </ChartBox>
        <CoberturaFgcReal fgc={ca.fgc} />
      </div>
      <IrRendaVariavelReal bloco={ca.irRendaVariavel} />
    </>
  );
}
