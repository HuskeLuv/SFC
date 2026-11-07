import { FGC_FICTICIO } from '../../ficticio/fgc';
import { fP, fR0 } from '../../formato';
import { ChartBox } from '../../ui/ChartBox';
import { Progresso } from '../../ui/Progresso';
import { Tag } from '../../ui/Tag';

const LIMITE = 250_000;
const TETO = 1_000_000;

/** Cobertura do FGC FICTÍCIA (dados fixos), mesmo DOM de real/CoberturaFgcReal. */
export function CoberturaFgcFicticia() {
  const total = FGC_FICTICIO.reduce((s, f) => s + f[1], 0);
  return (
    <ChartBox
      titulo="Cobertura do FGC"
      sub={`${fP((total / TETO) * 100)} do teto global de R$ 1 milhão`}
    >
      <div className="ind">
        {FGC_FICTICIO.map(([nome, valor, n]) => (
          <div key={nome}>
            <div className="dream" style={{ border: 0, padding: 0, gap: 4 }}>
              <div className="row">
                <span>
                  {nome} · {n} {n === 1 ? 'título' : 'títulos'}
                </span>
                <b>{fR0(valor)}</b>
              </div>
              <Progresso pct={(valor / LIMITE) * 100} tom="good" />
              <div className="row">
                <span>{fP((valor / LIMITE) * 100)} de R$ 250 mil por emissor</span>
                <Tag tom="good">Dentro do limite</Tag>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ChartBox>
  );
}
