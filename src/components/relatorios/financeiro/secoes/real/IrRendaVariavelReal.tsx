import Link from 'next/link';
import type {
  BlocoIrRendaVariavelRelatorio,
  MesIrRendaVariavelRelatorio,
} from '@/types/relatorioFinanceiroIrRendaVariavel';
import { rotuloMes } from '../../formato';
import { useFormato } from '../../FormatoProvider';
import { Callout } from '../../ui/Callout';
import { Tag } from '../../ui/Tag';

/** Tela com a mesma apuração (Análises > IR). */
const LINK_ANALISES_IR = '/carteira?aba=analise';

/** Mês com algo a mostrar: venda, lucro/prejuízo ou DARF (inclusive o acumulado de antes). */
const temMovimento = (m: MesIrRendaVariavelRelatorio) =>
  m.vendasAcoes > 0 ||
  m.vendasEtf > 0 ||
  m.vendasFii > 0 ||
  m.lucroAcoes !== 0 ||
  m.lucroFii !== 0 ||
  m.darf.status !== 'sem';

/**
 * Tabela "Imposto de renda: apuração mensal de renda variável" da 4b (Advanced), como no
 * protótipo do Pedro. `bloco` null = a apuração falhou nesta geração.
 */
export function IrRendaVariavelReal({ bloco }: { bloco: BlocoIrRendaVariavelRelatorio | null }) {
  const { fR, fR0 } = useFormato();
  // Só os meses com movimento: 1 venda em 12 meses não vira 11 linhas zeradas.
  const meses = (bloco?.meses ?? []).filter(temMovimento);
  const ocultos = (bloco?.meses.length ?? 0) - meses.length;
  const vazio = meses.length === 0;
  return (
    <div className="block">
      <h3>
        Imposto de renda <small>apuração mensal de renda variável</small>
      </h3>
      {bloco === null ? (
        <Callout>
          O IR mensal de ações e FIIs não pôde ser carregado agora. Veja em{' '}
          <Link href={LINK_ANALISES_IR}>Análises &gt; IR</Link>.
        </Callout>
      ) : vazio ? (
        <p className="fine">Nenhuma venda de ações ou FIIs no período.</p>
      ) : (
        <>
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
                {meses.map((r) => (
                  <tr key={r.mes}>
                    <td>{rotuloMes(r.mes)}</td>
                    <td className="n" data-label="Vendas de ações">
                      <span>
                        {fR0(r.vendasAcoes)}
                        {r.isentoAcoes && <span className="sub">isento, até R$ 20 mil</span>}
                        {r.vendasEtf > 0 && (
                          <span className="sub">+ {fR0(r.vendasEtf)} em ETFs</span>
                        )}
                      </span>
                    </td>
                    <td className="n" data-label="Lucro ações">
                      <span>
                        {fR0(r.lucroAcoes)}
                        {r.prejuizoCompensadoAcoes > 0 && (
                          <span className="sub quebra">
                            {fR0(r.prejuizoCompensadoAcoes)} compensado
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="n" data-label="IR ações (15%)">
                      {fR(r.irAcoes)}
                    </td>
                    <td className="n" data-label="Lucro FIIs">
                      <span>
                        {fR0(r.lucroFii)}
                        {r.prejuizoCompensadoFii > 0 && (
                          <span className="sub quebra">
                            {fR0(r.prejuizoCompensadoFii)} compensado
                          </span>
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
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine">
            {ocultos > 0
              ? `${ocultos === 1 ? 'O mês' : `Os ${ocultos} meses`} sem venda nem imposto ${ocultos === 1 ? 'fica' : 'ficam'} de fora. `
              : ''}
            DARF vence no último dia útil do mês seguinte à venda. DARF abaixo de R$ 10 é somado ao
            do mês seguinte. Ganhos no exterior (stocks e REITs) são apurados na declaração anual
            (Lei 14.754/2023). Prejuízo de meses anteriores compensa lucro da mesma categoria. ETFs
            de ações entram com as ações (15%, sem a isenção de R$ 20 mil).
          </p>
        </>
      )}
    </div>
  );
}
