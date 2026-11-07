import type { BlocoDividas, ItemDividaRelatorio } from '@/types/relatorioFinanceiro';
import type { PontoSerieDividas } from '@/types/relatorioFinanceiroDividas';
import { CORES } from '../cores';
import { fP, rotuloMes, soma } from '../formato';
import { useFormato } from '../FormatoProvider';
import { ticks } from '../graficos/escala';
import { SvgBars } from '../graficos/SvgBars';
import { SvgLines } from '../graficos/SvgLines';
import { Callout } from '../ui/Callout';
import { ChartBox } from '../ui/ChartBox';
import { Kpi } from '../ui/Kpi';
import { Legenda } from '../ui/Legenda';
import { Pagina } from '../ui/Pagina';
import { Tag } from '../ui/Tag';
import type { PropsSecao } from '../tipos';

/** Taxa mensal equivalente a um CET anual em %. */
export const taxaMensal = (cetAA: number) => Math.pow(1 + cetAA / 100, 1 / 12) - 1;

export interface ResumoDividas {
  /** Dívidas que não estão quitadas (a tabela e os totais). */
  abertas: ItemDividaRelatorio[];
  /** Nº de contratos com saldo > 0. */
  contratos: number;
  total: number;
  parcelas: number;
  jurosMes: number;
  /** CET a.a. médio ponderado pelo saldo, só das dívidas com CET (null sem nenhuma). */
  cetMedio: number | null;
  /** Soma das que têm a fórmula (sem o rotativo). */
  jurosAteQuitar: number;
  /** Rotativas com saldo > 0. */
  rotativas: ItemDividaRelatorio[];
}

export function resumirDividas(dividas: BlocoDividas): ResumoDividas {
  const abertas = dividas.itens.filter((d) => d.status !== 'quitada');
  const comCet = abertas.filter((d) => d.cetAA != null && d.saldo > 0);
  const saldoComCet = soma(comCet.map((d) => d.saldo));
  return {
    abertas,
    contratos: abertas.filter((d) => d.saldo > 0).length,
    total: soma(abertas.map((d) => d.saldo)),
    parcelas: soma(abertas.map((d) => d.parcelaMes)),
    jurosMes: soma(abertas.map((d) => d.jurosMes ?? 0)),
    cetMedio:
      saldoComCet > 0 ? soma(comCet.map((d) => d.saldo * (d.cetAA ?? 0))) / saldoComCet : null,
    jurosAteQuitar: soma(abertas.map((d) => d.jurosAteQuitar ?? 0)),
    rotativas: abertas.filter((d) => d.sistema === 'Rotativo' && d.saldo > 0),
  };
}

/** '4 contratos' · '1 contrato' · 'nenhum contrato'. */
export function rotuloContratos(n: number): string {
  if (n === 0) return 'nenhum contrato';
  return n === 1 ? '1 contrato' : `${n} contratos`;
}

/** Ordem da tabela: CET a.a. desc, sem CET no fim. */
function porCusto(a: ItemDividaRelatorio, b: ItemDividaRelatorio): number {
  if (a.cetAA == null && b.cetAA == null) return 0;
  if (a.cetAA == null) return 1;
  if (b.cetAA == null) return -1;
  return b.cetAA - a.cetAA;
}

function semDividasForaImovel(d: BlocoDividas['semDividasForaImovel']): [string, string] {
  switch (d.motivo) {
    case 'sem_dividas':
      return ['Sem dívidas', 'nenhuma dívida em aberto'];
    case 'so_imovel':
      return ['Hoje', 'só o imóvel em aberto'];
    case 'com_rotativo':
      return [d.mes ? rotuloMes(d.mes) : '—', 'sem contar o rotativo'];
    default:
      return [d.mes ? rotuloMes(d.mes) : '—', 'se mantiver as parcelas'];
  }
}

/** Há o que desenhar: algum mês com saldo ou parcela. */
export const temEvolucao = (serie: PontoSerieDividas[]) =>
  serie.some((p) => p.saldo > 0 || p.juros > 0 || p.amortizacao > 0);

/** Os 2 gráficos do protótipo com n > 1: saldo no fim de cada mês e juros × amortização. */
function EvolucaoDividas({ serie }: { serie: PontoSerieDividas[] }) {
  const { fR0, fAx } = useFormato();
  const labels = serie.map((p) => rotuloMes(p.mes));
  const amortizado = soma(serie.map((p) => p.amortizacao));
  const juros = soma(serie.map((p) => p.juros));
  return (
    <>
      <div className="two">
        <ChartBox titulo="Saldo devedor" sub="fim de cada mês">
          <SvgLines
            fmt={fAx}
            series={[{ color: CORES.navy, values: serie.map((p) => p.saldo), dot: true }]}
            xTicks={ticks(labels, 4)}
            h={190}
            area
            W={340}
            ariaLabel="Saldo devedor no fim de cada mês"
          />
        </ChartBox>
        <ChartBox titulo="Parcela: juros x amortização" sub="pagos em cada mês">
          <Legenda
            series={[
              { nome: 'Amortização', cor: CORES.blue },
              { nome: 'Juros', cor: CORES.bad },
            ]}
          />
          <SvgBars
            fmt={fAx}
            labels={labels}
            stack
            h={176}
            W={340}
            series={[
              { color: CORES.blue, values: serie.map((p) => p.amortizacao) },
              { color: CORES.bad, values: serie.map((p) => p.juros) },
            ]}
            ariaLabel="Parcela paga em cada mês: amortização e juros"
          />
        </ChartBox>
      </div>
      <p className="fine">
        {amortizado > 0 || juros > 0 ? (
          <>
            Pelos pagamentos registrados, no período você amortizou {fR0(amortizado)} e pagou{' '}
            {fR0(juros)} de juros.
          </>
        ) : (
          'Nenhum pagamento registrado no período.'
        )}
      </p>
    </>
  );
}

export function SecaoDividas({ relatorio }: PropsSecao) {
  const { fR0 } = useFormato();
  const n = relatorio.periodo.meses;
  const dividas = relatorio.dividas;
  const r = resumirDividas(dividas);
  const meses = relatorio.orcamento.meses;
  const receitaMes = meses.length > 0 ? meses[meses.length - 1].receita : 0;
  const pctReceita = receitaMes > 0 ? r.parcelas / receitaMes : null;
  const [quitaValor, quitaSub] = semDividasForaImovel(dividas.semDividasForaImovel);
  const linhas = [...r.abertas].sort(porCusto);

  const rotSaldo = soma(r.rotativas.map((d) => d.saldo));
  const rotJuros = soma(r.rotativas.map((d) => d.jurosMes ?? 0));
  const rotSemCet = r.rotativas.some((d) => d.cetAA == null || d.jurosMes == null);

  return (
    <Pagina
      numero={3}
      titulo="Dívidas"
      lead="Quanto você deve, quanto isso custa e quando termina."
      relatorio={relatorio}
    >
      <div className="kpis">
        <Kpi rotulo="Saldo devedor total" valor={fR0(r.total)} sub={rotuloContratos(r.contratos)} />
        <Kpi
          rotulo="Parcelas do mês"
          valor={fR0(r.parcelas)}
          sub={pctReceita != null ? `${fP(pctReceita * 100)} da receita` : '— da receita'}
          tom={pctReceita != null && pctReceita > 0.3 ? 'bad' : undefined}
        />
        <Kpi rotulo="Juros do mês" valor={fR0(r.jurosMes)} sub="o que não abate dívida" />
        <Kpi
          rotulo="CET médio ponderado"
          valor={r.cetMedio != null ? `${fP(r.cetMedio, 1)} a.a.` : '—'}
          sub="pelo saldo de cada dívida"
        />
        <Kpi rotulo="Juros até quitar" valor={fR0(r.jurosAteQuitar)} sub="sem contar o rotativo" />
        <Kpi rotulo="Sem dívidas, fora o imóvel" valor={quitaValor} sub={quitaSub} destaque />
      </div>

      {linhas.length > 0 ? (
        <div className="block">
          <h3>
            Dívidas ordenadas pelo custo <small>da mais cara para a mais barata</small>
          </h3>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Dívida</th>
                  <th>Tipo</th>
                  <th className="n">Saldo</th>
                  <th className="n">Parcela</th>
                  <th className="n">CET a.a.</th>
                  <th className="n">Juros/mês</th>
                  <th className="n">Quitação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.nome}
                      {d.instituicao ? <span className="sub">{d.instituicao}</span> : null}
                    </td>
                    <td>
                      {d.sistema === 'Rotativo' ? <Tag tom="bad">Rotativo</Tag> : d.sistema}
                      {d.cetAA == null ? <span className="sub">taxa não informada</span> : null}
                    </td>
                    <td className="n">{fR0(d.saldo)}</td>
                    <td className="n">
                      {fR0(d.parcelaMes)}
                      {d.sistema === 'Rotativo' ? <span className="sub">mínimo 15%</span> : null}
                    </td>
                    <td
                      className="n"
                      style={{ color: d.cetAA != null && d.cetAA > 100 ? CORES.bad : 'inherit' }}
                    >
                      {d.cetAA != null ? fP(d.cetAA, 1) : '—'}
                    </td>
                    <td className="n">{d.jurosMes != null ? fR0(d.jurosMes) : '—'}</td>
                    <td className="n">
                      {d.quitacao ? rotuloMes(d.quitacao) : '—'}
                      {d.parcelasRestantes ? (
                        <span className="sub">{d.parcelasRestantes} parcelas</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>Total</td>
                  <td></td>
                  <td className="n">{fR0(r.total)}</td>
                  <td className="n">{fR0(r.parcelas)}</td>
                  <td className="n">{r.cetMedio != null ? fP(r.cetMedio, 1) : '—'}</td>
                  <td className="n">{fR0(r.jurosMes)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Callout>
          Você não tem dívidas em aberto. Se tiver alguma, cadastre na tela{' '}
          <a href="/dividas" style={{ color: 'inherit', fontWeight: 600 }}>
            Dívidas
          </a>
          .
        </Callout>
      )}

      {rotSaldo > 0 ? (
        rotSemCet ? (
          <Callout tom="warn">
            Você tem {fR0(rotSaldo)} no rotativo do cartão. Informe a taxa na tela Dívidas para ver
            quanto ele custa por mês.
          </Callout>
        ) : (
          <Callout tom="warn">
            O rotativo é {fP(r.total > 0 ? (rotSaldo / r.total) * 100 : 0, 1)} do que você deve, mas
            gera {fP(r.jurosMes > 0 ? (rotJuros / r.jurosMes) * 100 : 0, 0)} dos juros do mês.
            Quitar {fR0(rotSaldo)} dele economiza cerca de {fR0(rotJuros)} por mês.
          </Callout>
        )
      ) : null}

      {dividas.avisos.parcelasVencidasSemPagamento > 0 ? (
        <p className="fine">
          {dividas.avisos.parcelasVencidasSemPagamento === 1
            ? '1 parcela vencida está sem pagamento registrado'
            : `${dividas.avisos.parcelasVencidasSemPagamento} parcelas vencidas estão sem pagamento registrado`}
          : o saldo e a quitação podem aparecer maiores que os reais. Registre os pagamentos na tela
          Dívidas.
        </p>
      ) : null}
      {dividas.avisos.semCet > 0 ? (
        <p className="fine">
          {dividas.avisos.semCet === 1
            ? '1 dívida está sem taxa informada'
            : `${dividas.avisos.semCet} dívidas estão sem taxa informada`}
          : sem a taxa, não entram no CET médio nem nos juros.
        </p>
      ) : null}

      {n > 1 && temEvolucao(dividas.serie) ? <EvolucaoDividas serie={dividas.serie} /> : null}
    </Pagina>
  );
}
