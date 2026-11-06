import { fR0, soma } from '../../formato';
import { SAUDE_FICTICIA as F } from '../../ficticio/saude';
import type { PropsFicticio } from '../../tipos';
import { Tag } from '../../ui/Tag';
import { ROTULO_STATUS } from '../apoio';

/**
 * Corpo FICTÍCIO da seção 7 (dados fixos) desenhado sob o cadeado. Nunca usa dado real. Mesmo
 * DOM/classes de real/SaudeReal.
 */
export function SaudeFicticia({ meses: n }: PropsFicticio) {
  const at = soma(F.bens.map((b) => b[1]));
  const dv = soma(F.dividas.map((d) => d[1]));
  return (
    <>
      <div className="score">
        <div>
          <div className="big">
            {F.nota}
            <small>/100</small>
          </div>
          <Tag tom={F.status}>{ROTULO_STATUS[F.status]}</Tag>
        </div>
        <div className="block">
          <p style={{ margin: 0, fontSize: 13.5 }}>{F.frase}</p>
          {n > 1 ? (
            <span className="fine">O histórico da nota começa a ser registrado em breve.</span>
          ) : null}
        </div>
      </div>
      <div className="block">
        <h3>Indicadores</h3>
        <div className="ind">
          {F.indicadores.map((i) => (
            <div className="ind-row" key={i[0]}>
              <span>
                {i[0]}
                <span className="d">{i[1]}</span>
              </span>
              <span className="v" style={{ color: `var(--${i[4]})` }}>
                {i[2]}
              </span>
              <span className="m">meta {i[3]}</span>
              <span className="st">
                <Tag tom={i[4]}>{ROTULO_STATUS[i[4]]}</Tag>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="block">
        <h3>
          Balanço patrimonial <small>{F.data}</small>
        </h3>
        <div className="bp">
          <div>
            <b style={{ fontFamily: 'var(--f-display)', color: 'var(--navy9)' }}>Bens e direitos</b>
            {F.bens.map((b) => (
              <div className="r" key={b[0]}>
                <span>{b[0]}</span>
                <span>{fR0(b[1])}</span>
              </div>
            ))}
            <div className="r t">
              <span>Total</span>
              <span>{fR0(at)}</span>
            </div>
          </div>
          <div>
            <b style={{ fontFamily: 'var(--f-display)', color: 'var(--navy9)' }}>Dívidas</b>
            {F.dividas.map((d) => (
              <div className="r" key={d[0]}>
                <span>{d[0]}</span>
                <span>{fR0(d[1])}</span>
              </div>
            ))}
            <div className="r t">
              <span>Total</span>
              <span>{fR0(dv)}</span>
            </div>
          </div>
          <div className="pl">
            <span>Patrimônio líquido</span>
            <b>{fR0(at - dv)}</b>
          </div>
        </div>
      </div>
    </>
  );
}
