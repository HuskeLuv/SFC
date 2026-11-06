import Link from 'next/link';
import { CORES } from '../../cores';
import { fP, rotuloMes, soma } from '../../formato';
import { useFormato } from '../../FormatoProvider';
import { ticks } from '../../graficos/escala';
import { SvgLines } from '../../graficos/SvgLines';
import type { PropsSonhosReal } from '../../tipos';
import { Callout } from '../../ui/Callout';
import { Kpi } from '../../ui/Kpi';
import { Progresso } from '../../ui/Progresso';
import { Tag } from '../../ui/Tag';

export const LINK_SONHOS = '/planejamento-financeiro?modo=sonhos';

/**
 * Corpo REAL da seção 6 (rótulos do Pedro). Só entra por next/dynamic quando temAcesso.
 * Export default (next/dynamic).
 */
export default function SonhosReal({ relatorio, sonhos }: PropsSonhosReal) {
  const { fR0, fAx } = useFormato();
  const n = relatorio.periodo.meses;
  const rotuloAportado = n === 1 ? 'Aportado no mês' : 'Aportado no período';

  if (sonhos.length === 0) {
    return (
      <Callout>
        Nenhum sonho com meta cadastrado. Cadastre seus sonhos em{' '}
        <Link href={LINK_SONHOS}>Planejamento &gt; Meus Sonhos</Link> para acompanhar o progresso de
        cada um aqui.
      </Callout>
    );
  }

  const tot = soma(sonhos.map((d) => d.meta));
  const at = soma(sonhos.map((d) => d.acumulado));
  const ap = soma(sonhos.map((d) => d.aporteMensal));
  const noRitmo = sonhos.filter((d) => d.status === 'good').length;
  const pct = (d: (typeof sonhos)[number]) => (d.meta > 0 ? (d.acumulado / d.meta) * 100 : 0);

  return (
    <>
      <div className="kpis">
        <Kpi rotulo="Sonhos ativos" valor={String(sonhos.length)} sub={`${noRitmo} no ritmo`} />
        <Kpi rotulo="Soma das metas" valor={fR0(tot)} />
        <Kpi
          rotulo="Já acumulado"
          valor={fR0(at)}
          sub={tot > 0 ? `${fP((at / tot) * 100)} do total` : undefined}
          destaque
        />
        <Kpi rotulo="Aporte necessário" valor={`${fR0(ap)}/mês`} sub="para cumprir os prazos" />
      </div>
      <div className="tw cards">
        <table>
          <thead>
            <tr>
              <th>Sonho</th>
              <th>Prazo</th>
              <th className="n">Meta</th>
              <th className="n">Acumulado</th>
              <th className="n">%</th>
              <th className="n">{rotuloAportado}</th>
              <th>Conclusão</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sonhos.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.nome}
                  <span className="sub">prioridade {d.prioridade.toLowerCase()}</span>
                </td>
                <td data-label="Prazo">{d.prazo}</td>
                <td className="n" data-label="Meta">
                  {fR0(d.meta)}
                </td>
                <td className="n" data-label="Acumulado">
                  {fR0(d.acumulado)}
                </td>
                <td className="n" data-label="%">
                  {fP(pct(d), 0)}
                </td>
                <td className="n" data-label={rotuloAportado}>
                  {fR0(Math.max(0, d.aportadoPeriodo))}
                </td>
                <td data-label="Conclusão">{d.conclusao ? rotuloMes(d.conclusao) : '—'}</td>
                <td data-label="Status">
                  <Tag tom={d.status}>{d.rotuloStatus}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dreams">
        {sonhos.map((d) => {
          const labels = d.historico.map((h) => rotuloMes(h.mes));
          return (
            <div className="dream" key={d.id}>
              <div className="top">
                <div>
                  <h4>{d.nome}</h4>
                  <span className="fine">
                    Meta {fR0(d.meta)} · {d.conclusao ? rotuloMes(d.conclusao) : 'sem data'} ·
                    aporte {fR0(d.aporteMensal)}/mês
                  </span>
                </div>
                <Tag tom={d.status}>{fP(pct(d), 0)}</Tag>
              </div>
              <Progresso pct={pct(d)} tom={d.status} />
              <div className="row">
                <span>
                  Acumulado <b>{fR0(d.acumulado)}</b>
                </span>
                <span>
                  Faltam <b>{fR0(Math.max(0, d.meta - d.acumulado))}</b>
                </span>
              </div>
              {d.historico.length > 1 ? (
                <SvgLines
                  fmt={fAx}
                  series={[
                    { color: CORES.blue, values: d.historico.map((h) => h.valor), dot: true },
                  ]}
                  xTicks={ticks(labels, 4)}
                  h={120}
                  area
                  W={340}
                  ariaLabel={`Saldo de ${d.nome} no fim de cada mês`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
