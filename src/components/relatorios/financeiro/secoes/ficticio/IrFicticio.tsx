import { fP, fR, fR0, soma } from '../../formato';
import { IR_FICTICIO as F } from '../../ficticio/ir';
import type { PropsFicticio } from '../../tipos';
import { Kpi } from '../../ui/Kpi';
import { Progresso } from '../../ui/Progresso';
import { Tag } from '../../ui/Tag';

function Condicao({
  tom,
  ic,
  titulo,
  texto,
}: {
  tom: string;
  ic: string;
  titulo: string;
  texto: string;
}) {
  return (
    <div>
      <span className={`ic ${tom}`}>{ic}</span>
      <div>
        <b>{titulo}</b>
        <span>{texto}</span>
      </div>
    </div>
  );
}

/**
 * Corpo FICTÍCIO da seção 8 (dados fixos, textos neutros) desenhado sob o cadeado alto no Basic e
 * no Pro. Nunca usa dado real. Mesmo DOM/classes de adv/SecaoIrConteudo, sem os termos que só o
 * Advanced pode ver (decisão 6).
 */
export function IrFicticio(_props: PropsFicticio) {
  const pct = (F.contribuido / F.limite) * 100;
  return (
    <>
      <div className="kpis">
        <Kpi
          rotulo="Renda tributável (projeção)"
          valor={fR0(F.renda)}
          sub={`salário ${fR0(F.salario)} · aluguéis ${fR0(F.alugueis)}`}
          destaque
        />
        <Kpi rotulo="Limite do benefício fiscal (12%)" valor={fR0(F.limite)} sub="teto anual" />
        <Kpi
          rotulo="Contribuições em previdência"
          valor={fR0(F.contribuido)}
          sub={`${fP(pct)} do limite · ${F.nContribuicoes} contribuições`}
        />
        <Kpi
          rotulo="Economia estimada de IR"
          valor={fR0(F.economia)}
          sub={`até ${fR0(F.economiaMaxima)} com o limite completo`}
          tom="good"
        />
      </div>
      <div className="chart" style={{ gap: 10, padding: '14px 16px' }}>
        <h3>
          Espaço do benefício fiscal até 31/12/{F.ano}{' '}
          <small>
            faltam {fR0(F.falta)} · {F.dias} dias
          </small>
        </h3>
        <Progresso pct={pct} />
        <div className="dream" style={{ border: 0, padding: 0 }}>
          <div className="row">
            <span>
              Contribuído <b>{fR(F.contribuido)}</b>
            </span>
            <span>
              Limite <b>{fR(F.limite)}</b>
            </span>
          </div>
        </div>
        <div className="callout">
          Uma contribuição única de <b>{fR(F.falta)}</b> ainda em {F.ano} reduz o IR em cerca de{' '}
          <b style={{ color: 'var(--good)' }}>{fR(F.economiaFalta)}</b>.
        </div>
      </div>
      <div className="two">
        <div className="chart" style={{ padding: '14px 16px', gap: 12 }}>
          <h3>
            Condições do benefício <small>verificadas com os seus dados</small>
          </h3>
          <div className="chk">
            <Condicao
              tom="good"
              ic="✓"
              titulo="Declaração pelo modelo completo"
              texto="Seus abatimentos passam do desconto simplificado."
            />
            <Condicao
              tom="good"
              ic="✓"
              titulo="Contribuição ao INSS no ano"
              texto="Lançada no fluxo de caixa."
            />
            <Condicao
              tom="good"
              ic="✓"
              titulo="Plano de previdência elegível"
              texto="2 planos cadastrados."
            />
            <Condicao
              tom="warn"
              ic="!"
              titulo={`Contribuições até 31/12/${F.ano}`}
              texto={`Ainda há ${fR0(F.falta)} de espaço no limite de 12%.`}
            />
            <Condicao
              tom=""
              ic="i"
              titulo="Regime de tributação: regressivo"
              texto="Alíquota cai de 35% para 10% após 10 anos."
            />
          </div>
        </div>
        <div className="chart" style={{ padding: '14px 16px', gap: 10 }}>
          <h3>
            Completa x simplificada{' '}
            <small>
              DAA {F.ano + 1}, ano-calendário {F.ano}
            </small>
          </h3>
          <div className="tw sim">
            <table>
              <thead>
                <tr>
                  <th />
                  <th className="n">Completa</th>
                  <th className="n">Simplificada</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Renda tributável</td>
                  <td className="n">{fR(F.renda)}</td>
                  <td className="n">{fR(F.renda)}</td>
                </tr>
                <tr>
                  <td>Previdência</td>
                  <td className="n g">{fR(-F.contribuido)}</td>
                  <td className="n x">—</td>
                </tr>
                <tr>
                  <td>INSS</td>
                  <td className="n">{fR(-F.inss)}</td>
                  <td className="n x">—</td>
                </tr>
                <tr>
                  <td>Dependentes, saúde e educação</td>
                  <td className="n">{fR(-F.outras)}</td>
                  <td className="n x">—</td>
                </tr>
                <tr>
                  <td>Desconto simplificado (20%, teto)</td>
                  <td className="n x">—</td>
                  <td className="n">{fR(-F.simplificado)}</td>
                </tr>
                <tr>
                  <td>Base de cálculo</td>
                  <td className="n">{fR(F.baseCompleta)}</td>
                  <td className="n">{fR(F.baseSimplificada)}</td>
                </tr>
                <tr>
                  <td>IR antes das doações</td>
                  <td className="n">{fR(F.irTabelaCompleta)}</td>
                  <td className="n">{fR(F.irSimplificada)}</td>
                </tr>
                <tr>
                  <td>Doações incentivadas</td>
                  <td className="n g">{fR(-F.doacoes)}</td>
                  <td className="n x">—</td>
                </tr>
                <tr className="tot">
                  <td>IR devido estimado</td>
                  <td className="n b">{fR(F.irCompleta)}</td>
                  <td className="n">{fR(F.irSimplificada)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ margin: 0, fontSize: 12.5 }}>
            A completa economiza <b style={{ color: 'var(--good)' }}>{fR(F.economiaCompleta)}</b>.
          </p>
          <span className="fine">
            Retido na fonte no ano: {fR(F.retido)} → restituição projetada {fR(F.restituicao)}
          </span>
        </div>
      </div>
      <div className="block">
        <h3>
          Contribuições em previdência no ano <small>agrupadas por entidade</small>
        </h3>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Plano / entidade</th>
                <th>CNPJ</th>
                <th>Regime</th>
                <th className="n">Contribuições</th>
                <th className="n">Total no ano</th>
                <th className="n">Saldo atual</th>
              </tr>
            </thead>
            <tbody>
              {F.planos.map((p) => (
                <tr key={p[0]}>
                  <td>
                    {p[0]}
                    <span className="sub">—</span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>CNPJ do fundo</td>
                  <td>{p[1]}</td>
                  <td className="n">{p[2]}</td>
                  <td className="n">
                    <b>{fR(p[3])}</b>
                  </td>
                  <td className="n">{fR(p[4])}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Total</td>
                <td />
                <td />
                <td className="n">{F.nContribuicoes}</td>
                <td className="n">{fR(soma(F.planos.map((p) => p[3])))}</td>
                <td className="n">{fR(soma(F.planos.map((p) => p[4])))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="two">
        <div className="block">
          <h3>Onde lançar na declaração</h3>
          <ul className="insights" style={{ fontSize: 12.5 }}>
            <li>
              <span>
                <b>Pagamentos Efetuados.</b> Um lançamento por entidade, com CNPJ e o total do ano.
              </span>
            </li>
            <li>
              <span>
                <b>Bens e Direitos.</b> Veja o que entra e o que não entra.
              </span>
            </li>
            <li>
              <span>
                <b>Resgates</b> entram pelo informe da entidade.
              </span>
            </li>
            <li>
              <span>
                <b>Confira com o informe anual</b> que a entidade envia em fevereiro.
              </span>
            </li>
          </ul>
        </div>
        <div className="callout" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b style={{ fontFamily: 'var(--f-display)', color: 'var(--navy9)' }}>Observações</b>
          <span>O IR incide no resgate sobre o valor total.</span>
          <span>Dividendos, JCP e renda fixa não entram na base dos 12%.</span>
          <span>Renda muito baixa ou muito alta pode reduzir o benefício.</span>
        </div>
      </div>
      <div className="block">
        <h3>
          Abatimentos no modelo completo{' '}
          <small>identificados pelas categorias do fluxo de caixa</small>
        </h3>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Abatimento</th>
                <th>Limite</th>
                <th>O que entra</th>
                <th className="n">Identificado no ano</th>
              </tr>
            </thead>
            <tbody>
              {F.abatimentos.map((d) => (
                <tr key={d[0]}>
                  <td>
                    <b style={{ fontWeight: 600 }}>{d[0]}</b>
                  </td>
                  <td>
                    <Tag tom={d[2] === 'good' ? 'good' : ''}>{d[1]}</Tag>
                  </td>
                  <td className="wrap">{d[3]}</td>
                  <td className="n">{fR(d[4])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">
          Valores estimados pela tabela progressiva vigente; não substituem o cálculo da Receita
          Federal.
        </p>
      </div>
    </>
  );
}
