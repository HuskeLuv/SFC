import type {
  BaseIndicadorSaude,
  ChaveIndicadorSaude,
  StatusSemaforo,
} from '@/types/relatorioFinanceiro';
import { soma } from '../../formato';
import { useFormato } from '../../FormatoProvider';
import type { PropsSaudeReal } from '../../tipos';
import { Tag } from '../../ui/Tag';
import { ROTULO_STATUS, dataBr } from '../apoio';

/** Nome e linha de apoio de cada indicador (textos do Pedro). */
const INDICADOR: Record<ChaveIndicadorSaude, [string, string]> = {
  poupanca: ['Índice de poupança', 'quanto da receita sobra'],
  reserva: ['Reserva de emergência', 'meses de gastos guardados'],
  comprometimento: ['Comprometimento da renda', 'parcelas ÷ receita'],
  endividamento: ['Endividamento', 'dívidas ÷ bens'],
  independencia: ['Independência financeira', 'renda passiva ÷ gastos'],
  rotativo: ['Uso do rotativo', 'dívida mais cara do mercado'],
};

const BASE: Record<BaseIndicadorSaude, string> = {
  fechados3m: 'média dos 3 últimos meses fechados',
  mesAnterior: 'mês anterior fechado',
  periodo: 'meses fechados do período',
};

const corStatus = (s: StatusSemaforo | null) => (s ? `var(--${s})` : 'var(--muted)');

/**
 * Corpo REAL da seção 7 (rótulos do Pedro). Só entra por next/dynamic quando temAcesso.
 * Export default (next/dynamic).
 */
export default function SaudeReal({ relatorio, saude }: PropsSaudeReal) {
  const { fR0 } = useFormato();
  const n = relatorio.periodo.meses;
  const at = soma(saude.bens.map((b) => b.valor));
  const dv = soma(saude.dividas.map((d) => d.valor));
  const bases = saude.indicadores.map(
    (i) => `${INDICADOR[i.chave][0].toLowerCase()}: ${BASE[i.base]}`,
  );
  return (
    <>
      <div className="score">
        <div>
          <div className="big">
            {saude.nota == null ? '—' : Math.round(saude.nota)}
            <small>/100</small>
          </div>
          {saude.status ? (
            <Tag tom={saude.status}>{ROTULO_STATUS[saude.status]}</Tag>
          ) : (
            <Tag>Sem dados</Tag>
          )}
        </div>
        <div className="block">
          <p style={{ margin: 0, fontSize: 13.5 }}>{saude.frase}</p>
          {n > 1 ? (
            <span className="fine">O histórico da nota começa a ser registrado em breve.</span>
          ) : null}
        </div>
      </div>
      <div className="block">
        <h3>Indicadores</h3>
        <div className="ind">
          {saude.indicadores.map((i) => (
            <div className="ind-row" key={i.chave}>
              <span>
                {INDICADOR[i.chave][0]}
                <span className="d">{INDICADOR[i.chave][1]}</span>
              </span>
              <span className="v" style={{ color: corStatus(i.status) }}>
                {i.valor == null ? '—' : i.valorFmt}
              </span>
              <span className="m">meta {i.meta}</span>
              <span className="st">
                {i.status ? (
                  <Tag tom={i.status}>{ROTULO_STATUS[i.status]}</Tag>
                ) : (
                  <Tag>Sem dados</Tag>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="fine">
          Bases: {bases.join('; ')}. Nota provisória: média dos indicadores disponíveis. As metas
          podem diferir das da tela Saúde Financeira.
        </p>
      </div>
      <div className="block">
        <h3>
          Balanço patrimonial <small>em {dataBr(saude.asOf)}</small>
        </h3>
        <div className="bp">
          <div>
            <b style={{ fontFamily: 'var(--f-display)', color: 'var(--navy9)' }}>Bens e direitos</b>
            {saude.bens.map((b, k) => (
              <div className="r" key={k}>
                <span>{b.nome}</span>
                <span>{fR0(b.valor)}</span>
              </div>
            ))}
            <div className="r t">
              <span>Total</span>
              <span>{fR0(at)}</span>
            </div>
          </div>
          <div>
            <b style={{ fontFamily: 'var(--f-display)', color: 'var(--navy9)' }}>Dívidas</b>
            {saude.dividas.map((d, k) => (
              <div className="r" key={k}>
                <span>{d.nome}</span>
                <span>{fR0(d.valor)}</span>
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
