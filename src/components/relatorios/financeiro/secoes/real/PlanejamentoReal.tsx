import Link from 'next/link';
import { CORES } from '../../cores';
import { fAxP, fP, fR0, rotuloMes, soma } from '../../formato';
import { ticks } from '../../graficos/escala';
import { SvgBars } from '../../graficos/SvgBars';
import { SvgLines } from '../../graficos/SvgLines';
import type { PropsPlanejamentoReal } from '../../tipos';
import { Callout } from '../../ui/Callout';
import { ChartBox } from '../../ui/ChartBox';
import { Kpi } from '../../ui/Kpi';
import { Legenda } from '../../ui/Legenda';
import { fMi, meses } from '../apoio';

export const LINK_PLANO_INDEPENDENCIA = '/planejamento-financeiro?modo=aposentadoria';

/**
 * Corpo REAL da seção 5 (rótulos do Pedro). Só entra por next/dynamic quando temAcesso.
 * Export default (next/dynamic).
 */
export default function PlanejamentoReal({ relatorio, planejamento: p }: PropsPlanejamentoReal) {
  const n = relatorio.periodo.meses;

  if (!p.temPlano) {
    return (
      <>
        <div className="kpis">
          <Kpi
            rotulo="Patrimônio realizado"
            valor={fR0(p.patrimonioRealizado)}
            sub="hoje"
            destaque
          />
        </div>
        <Callout>
          Cadastre seu plano de independência no{' '}
          <Link href={LINK_PLANO_INDEPENDENCIA}>Planejamento</Link> para comparar o planejado com o
          realizado, mês a mês.
        </Callout>
      </>
    );
  }

  const meta = p.metaMensal;
  const metaTxt = meta != null ? `${fP(meta, 3)} a.m.` : null;
  const planejadoHoje = p.patrimonioPlanejadoHoje;
  const dif = planejadoHoje != null ? p.patrimonioRealizado - planejadoHoje : null;

  // Evolução: com n=1 o backend manda 6 meses; só os meses com os dois valores.
  const evolucao = p.serie.filter((s) => s.planejado != null && s.realizado != null);
  const evoLabels = evolucao.map((s) => rotuloMes(s.mes));
  // Barras: só os meses do período.
  const doPeriodo = p.serie.slice(Math.max(0, p.serie.length - n));
  const labels = doPeriodo.map((s) => rotuloMes(s.mes));
  const apP = doPeriodo.map((s) => s.aporteProjetado ?? 0);
  const apR = doPeriodo.map((s) => s.aporteRealizado ?? 0);
  const rr = doPeriodo.map((s) => s.rentabilidade ?? 0);
  const comRent = doPeriodo.filter((s) => s.rentabilidade != null);
  const acima = meta != null ? comRent.filter((s) => (s.rentabilidade ?? 0) >= meta).length : 0;
  const somaP = soma(apP);
  const somaR = soma(apR);

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Patrimônio realizado" valor={fR0(p.patrimonioRealizado)} sub="hoje" destaque />
        <Kpi
          rotulo="Patrimônio planejado"
          valor={planejadoHoje != null ? fR0(planejadoHoje) : '—'}
          sub="para hoje"
        />
        {dif != null && planejadoHoje ? (
          <Kpi
            rotulo={dif >= 0 ? 'À frente do plano' : 'Atrás do plano'}
            valor={`${dif >= 0 ? '+' : ''}${fR0(dif)}`}
            sub={`${fP((dif / planejadoHoje) * 100)} do planejado`}
            tom={dif >= 0 ? 'good' : 'bad'}
          />
        ) : (
          <Kpi rotulo="Diferença do plano" valor="—" sub="sem planejado para hoje" />
        )}
        <Kpi
          rotulo="Meta de independência"
          valor={p.metaIndependencia ? fMi(p.metaIndependencia.valor) : '—'}
          sub={
            p.metaIndependencia
              ? `${rotuloMes(p.metaIndependencia.mes)}${metaTxt ? ` · rentabilidade meta ${metaTxt}` : ''}`
              : 'meta não calculada'
          }
        />
      </div>
      <ChartBox
        titulo="Evolução patrimonial: planejado x realizado"
        sub={n === 1 ? 'últimos 6 meses' : undefined}
      >
        <Legenda
          series={[
            { nome: 'Planejado', cor: CORES.grey },
            { nome: 'Realizado', cor: CORES.blue },
          ]}
        />
        {evolucao.length > 1 ? (
          <SvgLines
            series={[
              { color: '#9aa5b5', values: evolucao.map((s) => s.planejado ?? 0), dash: true },
              {
                color: CORES.blue,
                values: evolucao.map((s) => s.realizado ?? 0),
                dot: true,
                w: 2.2,
              },
            ]}
            xTicks={ticks(evoLabels, 7)}
            h={190}
            ariaLabel="Evolução patrimonial planejada e realizada"
          />
        ) : (
          <p className="fine">Histórico em processamento: o gráfico aparece na próxima geração.</p>
        )}
      </ChartBox>
      <div className="two">
        <ChartBox titulo="Aportes: projetado x realizado">
          <Legenda
            series={[
              { nome: 'Projetado', cor: CORES.grey },
              { nome: 'Realizado', cor: CORES.blue },
            ]}
          />
          <SvgBars
            labels={labels}
            series={[
              { color: CORES.grey, values: apP },
              { color: CORES.blue, values: apR },
            ]}
            h={200}
            W={340}
            ariaLabel="Aportes projetados e realizados por mês"
          />
        </ChartBox>
        <ChartBox
          titulo="Rentabilidade mensal x meta"
          sub={metaTxt ? `linha = meta ${metaTxt}` : undefined}
        >
          <SvgBars
            labels={labels}
            series={[
              {
                color: CORES.blue,
                values: rr,
                colors: rr.map((v) => (meta == null || v >= meta ? CORES.blue : '#9fb6d3')),
              },
            ]}
            h={210}
            fmt={fAxP}
            refLine={meta ?? undefined}
            W={340}
            ariaLabel="Rentabilidade mensal contra a meta"
          />
        </ChartBox>
      </div>
      <p className="fine">
        Rentabilidade mensal calculada por TWR, sem contar aportes como ganho (pode diferir da aba
        Acompanhamento). {meta != null ? `Em ${meses(n)}, ${acima} ficaram acima da meta. ` : ''}
        Aportes realizados: {fR0(somaR)} de {fR0(somaP)} projetados
        {somaP > 0 ? ` (${fP((somaR / somaP) * 100, 0)})` : ''}.
      </p>
    </>
  );
}
