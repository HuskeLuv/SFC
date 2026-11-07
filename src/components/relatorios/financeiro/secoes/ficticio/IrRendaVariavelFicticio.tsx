import { fR, fR0 } from '../../formato';
import { MESES_FICTICIOS, ultimos } from '../../ficticio/meses';
import { Tag } from '../../ui/Tag';

/** [vendas de ações, lucro ações, lucro FIIs] fixos por mês (Dez/25 a Nov/26). Nunca dado real. */
const IR_FICTICIO: [number, number, number][] = [
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
];

/** Tabela FICTÍCIA do IR mensal (mesmo DOM de real/IrRendaVariavelReal), sob o cadeado. */
export function IrRendaVariavelFicticio({ meses: n }: { meses: number }) {
  const meses = ultimos(MESES_FICTICIOS, n);
  const linhas = ultimos(IR_FICTICIO, n);
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
            {linhas.map(([va, la, lf], k) => {
              const isento = va <= 20000;
              const irA = !isento && la > 0 ? la * 0.15 : 0;
              const irF = lf > 0 ? lf * 0.2 : 0;
              const t = irA + irF;
              return (
                <tr key={meses[k]}>
                  <td>{meses[k]}</td>
                  <td className="n" data-label="Vendas de ações">
                    <span>
                      {fR0(va)}
                      {isento && <span className="sub">isento, até R$ 20 mil</span>}
                    </span>
                  </td>
                  <td className="n" data-label="Lucro ações">
                    <span>{fR0(la)}</span>
                  </td>
                  <td className="n" data-label="IR ações (15%)">
                    {fR(irA)}
                  </td>
                  <td className="n" data-label="Lucro FIIs">
                    <span>{fR0(lf)}</span>
                  </td>
                  <td className="n" data-label="IR FIIs (20%)">
                    {fR(irF)}
                  </td>
                  <td data-label="DARF">
                    <span>
                      {t >= 10 ? (
                        <Tag tom="warn">{fR(t)} · código 6015</Tag>
                      ) : t > 0 ? (
                        <Tag>acumula p/ próximo</Tag>
                      ) : (
                        <Tag tom="good">Sem imposto</Tag>
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
