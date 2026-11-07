import { fR, fR0 } from '../../formato';
import { apurarIrFicticio, type EntradaIrFicticia } from '../../ficticio/irMensal';
import { MESES_FICTICIOS, ultimos } from '../../ficticio/meses';
import { Tag } from '../../ui/Tag';

/** [vendas de ações, lucro ações, lucro FIIs] fixos por mês (Dez/25 a Nov/26). Nunca dado real. */
const IR_FICTICIO: EntradaIrFicticia[] = (
  [
    [14200, 820, 310],
    [23800, 1640, -120],
    [9100, -430, 540],
    [26500, 2210, 280],
    [17300, 960, 0],
    [21900, 1180, 470],
    [8700, 390, -60],
    [24600, -720, 650],
    [12800, 1530, 220],
    [27300, 2480, 390],
    [15600, 640, 30],
    [22100, 1720, 410],
  ] as const
).map(([va, la, lf]) => ({ va, la, lf }));

/** Apurado uma vez com os 12 meses (o prejuízo e o acumulado vêm de antes do recorte). */
const APURADO = apurarIrFicticio(IR_FICTICIO);

/** Tabela FICTÍCIA do IR mensal (mesmo DOM de real/IrRendaVariavelReal), sob o cadeado. */
export function IrRendaVariavelFicticio({ meses: n }: { meses: number }) {
  const meses = ultimos(MESES_FICTICIOS, n);
  const linhas = ultimos(APURADO, n);
  return (
    <div className="block">
      <h3>
        Imposto de renda <small>apuração mensal de renda variável</small>
      </h3>
      <div className="tw cards">
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th className="n">Vendas de ações</th>
              <th className="n">Lucro ações</th>
              <th className="n">IR ações (15%)</th>
              <th className="n">Lucro FIIs</th>
              <th className="n">IR FIIs (20%)</th>
              <th>DARF</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r, k) => {
              return (
                <tr key={meses[k]}>
                  <td>{meses[k]}</td>
                  <td className="n" data-label="Vendas de ações">
                    <span>
                      {fR0(r.va)}
                      {r.isento && <span className="sub">isento, até R$ 20 mil</span>}
                    </span>
                  </td>
                  <td className="n" data-label="Lucro ações">
                    <span>
                      {fR0(r.la)}
                      {r.compAcoes > 0 && (
                        <span className="sub">{fR0(r.compAcoes)} de prejuízo compensado</span>
                      )}
                    </span>
                  </td>
                  <td className="n" data-label="IR ações (15%)">
                    {fR(r.irAcoes)}
                  </td>
                  <td className="n" data-label="Lucro FIIs">
                    <span>
                      {fR0(r.lf)}
                      {r.compFii > 0 && (
                        <span className="sub">{fR0(r.compFii)} de prejuízo compensado</span>
                      )}
                    </span>
                  </td>
                  <td className="n" data-label="IR FIIs (20%)">
                    {fR(r.irFii)}
                  </td>
                  <td data-label="DARF">
                    <span>
                      {r.darf.status === 'pagar' ? (
                        <Tag tom="warn">{fR(r.darf.valor)} · código 6015</Tag>
                      ) : r.darf.status === 'acumula' ? (
                        <Tag>acumula p/ próximo</Tag>
                      ) : (
                        <Tag tom="good">Sem imposto</Tag>
                      )}
                      {r.darf.status === 'pagar' && r.acumuladoAnterior > 0 && (
                        <span className="sub">
                          inclui {fR(r.acumuladoAnterior)} de meses anteriores
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
