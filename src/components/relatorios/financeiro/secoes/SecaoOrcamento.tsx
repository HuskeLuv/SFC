import type { BlocoOrcamento, MesOrcamentoRelatorio } from '@/types/relatorioFinanceiro';
import { CORES } from '../cores';
import { fP, soma } from '../formato';
import { useFormato } from '../FormatoProvider';
import { SvgBars } from '../graficos/SvgBars';
import { Callout } from '../ui/Callout';
import { ChartBox } from '../ui/ChartBox';
import { Kpi } from '../ui/Kpi';
import { Legenda } from '../ui/Legenda';
import { Pagina } from '../ui/Pagina';
import type { PropsSecao } from '../tipos';
import { gastoDoMes } from './apoio';

/** Categoria somada no período (porte de budAgg do protótipo). */
export interface CategoriaAgregada {
  chave: string;
  nome: string;
  orc: number;
  real: number;
  /** Meses com orçado > 0 e status 'bad' (estourados). */
  over: number;
}

export interface OrcamentoAgregado {
  meses: MesOrcamentoRelatorio[];
  cats: CategoriaAgregada[];
  receita: number;
  orc: number;
  real: number;
  sobra: number;
  /** Índice de poupança em % (null sem receita). */
  poup: number | null;
}

/**
 * Soma o período por chave canônica (a mesma categoria entre meses e anos), na ordem em que as
 * categorias aparecem. Sobra = receita − realizado (decisão 2: pelo realizado).
 */
export function agregarOrcamento(orcamento: BlocoOrcamento): OrcamentoAgregado {
  const porChave = new Map<string, CategoriaAgregada>();
  for (const mes of orcamento.meses) {
    for (const c of mes.categorias) {
      const atual = porChave.get(c.chave) ?? {
        chave: c.chave,
        nome: c.nome,
        orc: 0,
        real: 0,
        over: 0,
      };
      atual.orc += c.orcado;
      atual.real += c.realizado;
      if (c.orcado > 0 && c.status === 'bad') atual.over += 1;
      porChave.set(c.chave, atual);
    }
  }
  const cats = [...porChave.values()];
  const receita = soma(orcamento.meses.map((m) => m.receita));
  const orc = soma(cats.map((c) => c.orc));
  const real = soma(cats.map((c) => c.real));
  const sobra = receita - real;
  return {
    meses: orcamento.meses,
    cats,
    receita,
    orc,
    real,
    sobra,
    poup: receita > 0 ? (sobra / receita) * 100 : null,
  };
}

/** Categoria que mais passou do orçado (orçado > 0); null quando nenhuma passou. */
export function maiorEstouro(cats: CategoriaAgregada[]): CategoriaAgregada | null {
  const pior = cats.filter((c) => c.orc > 0).sort((x, y) => y.real - y.orc - (x.real - x.orc))[0];
  return pior && pior.real > pior.orc ? pior : null;
}

/** Linha de apoio da receita do mês corrente (n=1). */
function origemReceita(m: MesOrcamentoRelatorio | undefined): string {
  if (!m || m.receitaOrigem === 'fluxo') return 'do fluxo de caixa';
  if (m.receitaOrigem === 'media3m') return 'média dos últimos 3 meses';
  return 'sem receita lançada';
}

/** Orçado acima de 100,5% = estourou (regra do app); acima de 90% = laranja (só cor). */
function tomBarra(orc: number, real: number): '' | 'warn' | 'bad' {
  if (orc <= 0) return real > 0 ? 'bad' : '';
  const p = real / orc;
  return p > 1.005 ? 'bad' : p > 0.9 ? 'warn' : '';
}

export function SecaoOrcamento({ relatorio }: PropsSecao) {
  const { fR0, fAx } = useFormato();
  const n = relatorio.periodo.meses;
  const orcamento = relatorio.orcamento;
  const b = agregarOrcamento(orcamento);
  const temOrc = orcamento.temOrcamento;
  const mesAtual = b.meses[b.meses.length - 1];

  const cats = b.cats.filter((c) => c.orc > 0 || c.real > 0);
  const mx = Math.max(0, ...cats.map((c) => (temOrc ? Math.max(c.orc, c.real) : c.real)));
  const largura = (v: number) => (mx > 0 ? (v / mx) * 100 : 0);
  const zero = temOrc
    ? b.cats
        .filter((c) => c.orc === 0 && c.real === 0)
        .map((c) => c.nome)
        .join(', ')
    : '';

  const top = [...b.cats]
    .filter((c) => c.over > 0)
    .sort((x, y) => y.over - x.over || y.real - y.orc - (x.real - x.orc))
    .slice(0, 5);

  const ritmo = orcamento.ritmo;
  const temMovimento = b.meses.some((m) => m.receita !== 0 || gastoDoMes(m) !== 0);

  return (
    <Pagina
      numero={2}
      titulo="Orçamento"
      lead="Para onde foi o dinheiro e quanto sobrou."
      relatorio={relatorio}
    >
      <div className="kpis">
        <Kpi
          rotulo="Receita prevista"
          valor={fR0(b.receita)}
          sub={n === 1 ? origemReceita(mesAtual) : 'soma do período'}
        />
        <Kpi
          rotulo="Orçado"
          valor={temOrc ? fR0(b.orc) : '—'}
          sub={
            temOrc && b.receita > 0
              ? `${fP((b.orc / b.receita) * 100)} da receita`
              : 'sem orçamento'
          }
        />
        <Kpi
          rotulo="Realizado"
          valor={fR0(b.real)}
          sub={
            temOrc && b.orc > 0 ? `${fP((b.real / b.orc) * 100, 0)} do orçado` : 'gastos lançados'
          }
        />
        <Kpi
          rotulo="Disponível"
          valor={temOrc ? fR0(b.orc - b.real) : '—'}
          sub="orçado − realizado"
        />
        <Kpi
          rotulo="Índice de poupança"
          valor={b.poup != null ? fP(b.poup) : '—'}
          sub={`${fR0(b.sobra)} para investir`}
          destaque
          tom={b.sobra < 0 ? 'bad' : 'good'}
        />
      </div>

      <div className="block">
        <h3>
          {temOrc ? 'Orçado x realizado por categoria' : 'Realizado por categoria'}{' '}
          <small>{n === 1 ? 'no mês' : 'soma do período'}</small>
        </h3>
        {temOrc ? (
          <div className="legend">
            <span>
              <i style={{ background: '#e6ebf2' }} />
              Orçado
            </span>
            <span>
              <i style={{ background: CORES.blue }} />
              Realizado
            </span>
            <span>
              <i style={{ background: CORES.warn }} />
              Acima de 90%
            </span>
            <span>
              <i style={{ background: CORES.bad }} />
              Estourou
            </span>
          </div>
        ) : null}
        {cats.length > 0 ? (
          <div className="hb">
            {cats.map((c) => {
              const st = temOrc ? tomBarra(c.orc, c.real) : '';
              const dif = c.orc - c.real;
              return (
                <div className="hb-row" key={c.chave}>
                  <span>{c.nome}</span>
                  <div className="hb-track">
                    {temOrc ? (
                      <span className="hb-orc" style={{ width: `${largura(c.orc)}%` }} />
                    ) : null}
                    <span className={`hb-real ${st}`} style={{ width: `${largura(c.real)}%` }} />
                  </div>
                  <span className="hb-v">
                    <b>{fR0(c.real)}</b>
                    {temOrc ? (
                      <>
                        {' '}
                        / {fR0(c.orc)} ·{' '}
                        <span className={dif < 0 ? 'bad' : ''}>
                          {c.orc > 0 ? fP((c.real / c.orc) * 100, 0) : '—'}
                        </span>
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="fine">Nenhum gasto lançado no período.</p>
        )}
        {zero ? <p className="fine">Sem orçamento no período: {zero}.</p> : null}
      </div>

      {!temOrc ? (
        <Callout>
          Defina seu orçamento na aba Orçamento do{' '}
          <a href="/fluxodecaixa" style={{ color: 'inherit', fontWeight: 600 }}>
            Fluxo de Caixa
          </a>{' '}
          para comparar o planejado com o realizado. Nada é ativado por este relatório.
        </Callout>
      ) : null}

      {n > 1 ? (
        <>
          {temMovimento ? (
            <ChartBox titulo="Receita, gastos e sobra por mês">
              <Legenda
                series={[
                  { nome: 'Receita', cor: CORES.grey },
                  { nome: 'Gastos', cor: CORES.navy },
                  { nome: 'Sobra', cor: CORES.blue },
                ]}
              />
              <SvgBars
                labels={b.meses.map((m) => m.rotulo)}
                series={[
                  { color: CORES.grey, values: b.meses.map((m) => m.receita) },
                  { color: CORES.navy, values: b.meses.map(gastoDoMes) },
                  { color: CORES.blue, values: b.meses.map((m) => m.receita - gastoDoMes(m)) },
                ]}
                fmt={fAx}
                ariaLabel="Receita, gastos e sobra por mês"
              />
            </ChartBox>
          ) : null}
          {temOrc ? (
            <div className="block">
              <h3>
                Categorias que mais estouraram <small>meses acima do orçado</small>
              </h3>
              {top.length > 0 ? (
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        <th className="n">Meses estourados</th>
                        <th className="n">Média orçada</th>
                        <th className="n">Média realizada</th>
                        <th className="n">Diferença/mês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top.map((c) => (
                        <tr key={c.chave}>
                          <td>{c.nome}</td>
                          <td className="n">
                            {c.over} de {n}
                          </td>
                          <td className="n">{fR0(c.orc / n)}</td>
                          <td className="n">{fR0(c.real / n)}</td>
                          <td
                            className="n"
                            style={{ color: c.real > c.orc ? CORES.bad : CORES.good }}
                          >
                            {fR0((c.orc - c.real) / n)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="fine">Nenhuma categoria passou do orçado no período.</p>
              )}
            </div>
          ) : null}
        </>
      ) : ritmo ? (
        <Callout>
          Ritmo do mês: {ritmo.dia} de {ritmo.diasNoMes} dias passaram ({fP(ritmo.pctMes, 0)})
          {ritmo.pctOrcadoLancado != null ? (
            <>
              {' '}
              e {fP(ritmo.pctOrcadoLancado, 0)} do orçado já está lançado. Contas fixas lançadas no
              início do mês puxam esse número para cima.
            </>
          ) : (
            '.'
          )}
        </Callout>
      ) : null}
    </Pagina>
  );
}
