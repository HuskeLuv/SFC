import { CORES } from '../../cores';
import { fP, fR0, soma } from '../../formato';
import { ticks } from '../../graficos/escala';
import { SvgLines } from '../../graficos/SvgLines';
import { MESES_FICTICIOS, ultimos } from '../../ficticio/meses';
import { SONHOS_FICTICIOS } from '../../ficticio/sonhos';
import type { PropsFicticio } from '../../tipos';
import { Kpi } from '../../ui/Kpi';
import { Progresso } from '../../ui/Progresso';
import { Tag } from '../../ui/Tag';

/**
 * Corpo FICTÍCIO da seção 6 (dados fixos, rótulos neutros) desenhado sob o cadeado. Nunca usa
 * dado real. Mesmo DOM/classes de real/SonhosReal.
 */
export function SonhosFicticios({ meses: n }: PropsFicticio) {
  const S = SONHOS_FICTICIOS;
  const tot = soma(S.map((d) => d.meta));
  const at = soma(S.map((d) => d.acumulado));
  const mensal = soma(S.map((d) => d.mensal));
  const nHist = n === 1 ? 6 : n;
  const labels = ultimos(MESES_FICTICIOS, nHist);
  return (
    <>
      <div className="kpis">
        <Kpi
          rotulo="Sonhos ativos"
          valor={String(S.length)}
          sub={`${S.filter((d) => d.status === 'good').length} no ritmo`}
        />
        <Kpi rotulo="Soma das metas" valor={fR0(tot)} />
        <Kpi
          rotulo="Já acumulado"
          valor={fR0(at)}
          sub={`${fP((at / tot) * 100)} do total`}
          destaque
        />
        <Kpi
          rotulo="Depósito necessário"
          valor={`${fR0(mensal)}/mês`}
          sub="para cumprir os prazos"
        />
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Sonho</th>
              <th>Prazo</th>
              <th className="n">Meta</th>
              <th className="n">Acumulado</th>
              <th className="n">%</th>
              <th className="n">{n === 1 ? 'Depositado no mês' : 'Depositado no período'}</th>
              <th>Conclusão</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {S.map((d) => {
              const h = d.historico;
              const dep = (h[h.length - 1] - h[Math.max(0, h.length - 1 - n)]) * 1000;
              return (
                <tr key={d.nome}>
                  <td>
                    {d.nome}
                    <span className="sub">prioridade {d.prioridade.toLowerCase()}</span>
                  </td>
                  <td>{d.prazo}</td>
                  <td className="n">{fR0(d.meta)}</td>
                  <td className="n">{fR0(d.acumulado)}</td>
                  <td className="n">{fP((d.acumulado / d.meta) * 100, 0)}</td>
                  <td className="n">{fR0(Math.max(0, dep))}</td>
                  <td>{d.conclusao}</td>
                  <td>
                    <Tag tom={d.status}>{d.rotulo}</Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="dreams">
        {S.map((d) => {
          const pct = (d.acumulado / d.meta) * 100;
          return (
            <div className="dream" key={d.nome}>
              <div className="top">
                <div>
                  <h4>{d.nome}</h4>
                  <span className="fine">
                    Meta {fR0(d.meta)} · {d.conclusao} · depósito {fR0(d.mensal)}/mês
                  </span>
                </div>
                <Tag tom={d.status}>{fP(pct, 0)}</Tag>
              </div>
              <Progresso pct={pct} tom={d.status} />
              <div className="row">
                <span>
                  Acumulado <b>{fR0(d.acumulado)}</b>
                </span>
                <span>
                  Faltam <b>{fR0(d.meta - d.acumulado)}</b>
                </span>
              </div>
              <SvgLines
                series={[
                  {
                    color: CORES.blue,
                    values: ultimos(d.historico, nHist).map((v) => v * 1000),
                    dot: true,
                  },
                ]}
                xTicks={ticks(labels, 4)}
                h={120}
                area
                W={340}
                ariaLabel={`Saldo de ${d.nome}`}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
