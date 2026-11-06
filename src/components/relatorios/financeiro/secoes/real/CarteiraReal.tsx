import { CORES } from '../../cores';
import { rotuloMes } from '../../formato';
import { useFormato } from '../../FormatoProvider';
import { Donut, type FatiaDonut } from '../../graficos/Donut';
import { SvgBars } from '../../graficos/SvgBars';
import type { PropsCarteiraReal } from '../../tipos';
import { Callout } from '../../ui/Callout';
import { ChartBox } from '../../ui/ChartBox';
import { Kpi } from '../../ui/Kpi';
import { COR_CLASSE, dataBr, meses } from '../apoio';

/**
 * Corpo REAL da 4a (rótulos do Pedro). Só entra por next/dynamic quando temAcesso.
 * Export default (next/dynamic).
 */
export default function CarteiraReal({ relatorio, carteira }: PropsCarteiraReal) {
  const { fR0, fAx } = useFormato();
  const n = relatorio.periodo.meses;
  const fatias: FatiaDonut[] = carteira.classes
    .filter((c) => c.valor > 0)
    .map((c) => [c.nome, c.valor, COR_CLASSE[c.chave]]);
  const variacao = carteira.variacaoPeriodo;
  const semHistorico = carteira.historicoStatus !== 'ok' || carteira.historico.length === 0;
  return (
    <>
      <div className="kpis">
        <Kpi
          rotulo="Patrimônio investido"
          valor={fR0(carteira.patrimonio)}
          sub={carteira.asOf ? `em ${dataBr(carteira.asOf)}` : 'sem fechamento registrado'}
          destaque
        />
        <Kpi
          rotulo="Variação no período"
          valor={variacao == null ? '—' : `${variacao >= 0 ? '+' : ''}${fR0(variacao)}`}
          sub={
            variacao != null
              ? 'aportes + rendimento'
              : carteira.historicoStatus === 'indisponivel'
                ? 'histórico indisponível'
                : 'histórico em processamento'
          }
        />
        <Kpi rotulo="Aportes no período" valor={fR0(carteira.aportesPeriodo)} sub={meses(n)} />
        <Kpi
          rotulo="Ativos na carteira"
          valor={String(carteira.nAtivos)}
          sub={`em ${carteira.nClasses} ${carteira.nClasses === 1 ? 'classe' : 'classes'}`}
        />
      </div>
      <div className="two">
        <ChartBox titulo="Distribuição por classe">
          {fatias.length ? (
            <Donut parts={fatias} fmtValor={fR0} fmtTotal={fAx} />
          ) : (
            <p className="fine">Nenhum investimento na carteira.</p>
          )}
        </ChartBox>
        <ChartBox
          titulo="Histórico de patrimônio"
          sub={n === 1 ? 'últimos 6 meses' : 'fim de cada mês'}
        >
          {semHistorico ? (
            <Callout>
              {carteira.historicoStatus === 'indisponivel'
                ? 'O histórico salvo não corresponde às posições atuais e fica de fora deste relatório.'
                : 'Histórico em processamento. Ele aparece aqui na próxima geração.'}
            </Callout>
          ) : (
            <SvgBars
              fmt={fAx}
              labels={carteira.historico.map((h) => rotuloMes(h.mes))}
              series={[{ color: CORES.blue, values: carteira.historico.map((h) => h.valor) }]}
              h={230}
              W={340}
              ariaLabel="Histórico de patrimônio no fim de cada mês"
            />
          )}
        </ChartBox>
      </div>
    </>
  );
}
