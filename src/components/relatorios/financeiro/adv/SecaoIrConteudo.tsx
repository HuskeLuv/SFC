import Link from 'next/link';
import type { CondicaoIrRelatorio, DeducaoIrRelatorio } from '@/types/relatorioFinanceiro';
import { fP, soma } from '../formato';
import { useFormato } from '../FormatoProvider';
import type { PropsIrConteudo } from '../tipos';
import { Callout } from '../ui/Callout';
import { Kpi } from '../ui/Kpi';
import { Pagina } from '../ui/Pagina';
import { Progresso } from '../ui/Progresso';
import { Tag, type TomTag } from '../ui/Tag';

/** Aba PGBL (Carteira > Análises > Imposto de Renda > PGBL). */
export const LINK_ABA_PGBL = '/carteira?aba=analise';

/** Textos fixos do Pedro para a tabela de gastos dedutíveis: [nome, limite, tom, entra, não entra]. */
const DEDUCAO: Record<DeducaoIrRelatorio['chave'], [string, string, TomTag | '', string, string]> =
  {
    saude: [
      'Saúde',
      'Sem limite',
      'good',
      'Plano de saúde, consultas, dentista, psicólogo, fisioterapia, exames, internações e próteses',
      'Remédios, vacinas, óculos e lentes (salvo em nota de hospital)',
    ],
    educacao: [
      'Educação',
      'R$ 3.561,50 / pessoa',
      '',
      'Creche, ensino infantil, fundamental, médio, técnico, graduação e pós',
      'Idiomas, cursinho, material escolar, transporte e uniforme',
    ],
    dependentes: [
      'Dependentes',
      'R$ 2.275,08 / dependente',
      '',
      'Filhos até 21 anos (24 se universitários), cônjuge, pais e avós dentro do limite de isenção',
      'A renda do dependente passa a somar à sua',
    ],
    previdencia: [
      'Previdência',
      'INSS integral · PGBL 12%',
      '',
      'INSS ou regime próprio sem limite; PGBL, FAPI e previdência fechada até 12% da renda tributável',
      'VGBL',
    ],
    pensao: [
      'Pensão alimentícia',
      'Sem limite',
      'good',
      'Fixada por decisão judicial, acordo homologado ou escritura pública',
      'Pensão voluntária, sem decisão ou escritura',
    ],
    livroCaixa: [
      'Livro-caixa (autônomos)',
      'Até a receita',
      'good',
      'Despesas operacionais, material consumido, taxas, salários e encargos, publicidade e comissões',
      'Equipamentos, depreciação, despesas financeiras e gastos pessoais',
    ],
    doacoes: [
      'Doações incentivadas',
      'Até 6% do imposto',
      '',
      'Fundos da Criança e do Idoso, Rouanet, audiovisual, esporte, PRONAS/PCD e PRONON (abatem o imposto, não a base)',
      'Outras ONGs e igrejas',
    ],
  };

const ICONE: Record<CondicaoIrRelatorio['status'], [string, string]> = {
  good: ['good', '✓'],
  warn: ['warn', '!'],
  info: ['', 'i'],
};

/** Linha de apoio do título da seção 8 (só Advanced). */
export function leadIr(ano: number, encerrado: boolean): string {
  return encerrado
    ? `Quanto o PGBL reduz o seu IR. Ano-calendário ${ano} encerrado.`
    : `Quanto o PGBL reduz o seu IR e o que falta fazer até 31/12. Ano-calendário ${ano}.`;
}

/**
 * Seção 8 completa do Advanced (página inteira, com a linha de apoio do título): porte de irBody
 * do protótipo com o BlocoIr. Só entra por next/dynamic quando o plano é adv (os textos não podem
 * ir para os chunks do Basic/Pro). Export default (next/dynamic).
 */
export default function SecaoIrConteudo({ relatorio, ir }: PropsIrConteudo) {
  const { fR, fR0 } = useFormato();
  const sim = ir.simulacao;
  const dc = sim.deducoesCompleto;
  const pct = ir.limite12 > 0 ? (ir.aportado / ir.limite12) * 100 : 0;
  const outras = dc.dependentes + dc.saude + dc.educacao;
  const pensaoLivro = dc.pensaoJudicial + dc.livroCaixa;
  const temRedutor = sim.completo.redutor > 0 || sim.simplificado.redutor > 0;
  const semInss = ir.condicoes.some((c) => c.chave === 'inss' && c.status === 'warn');
  const partes = ir.rendaPartes
    .filter((p) => p.valor > 0)
    .map((p) => `${p.nome.toLowerCase()} ${fR0(p.valor)}`)
    .join(' · ');
  const subRenda =
    ir.rendaOrigem === 'lancado'
      ? `lançado no fluxo até ${relatorio.periodo.lancadoAte}`
      : partes || 'informada na aba PGBL';
  const completaMelhor = sim.melhorModelo === 'completo';
  const pgblDedutiveis = ir.planos.filter((p) => p.tipo !== 'vgbl');
  const ordemDeducoes = Object.keys(DEDUCAO) as DeducaoIrRelatorio['chave'][];
  const deducoes = ordemDeducoes.map(
    (chave) => ir.deducoes.find((d) => d.chave === chave) ?? { chave, valor: 0, nota: null },
  );

  return (
    <Pagina
      numero={8}
      titulo="Declaração Imposto de Renda: IR a restituir"
      lead={leadIr(ir.ano, ir.encerrado)}
      relatorio={relatorio}
    >
      <div className="kpis">
        <Kpi
          rotulo={ir.rendaOrigem === 'lancado' ? 'Renda tributável (lançada)' : 'Renda tributável'}
          valor={fR0(ir.rendaTributavel)}
          sub={subRenda}
          destaque
        />
        <Kpi rotulo="Limite dedutível (12%)" valor={fR0(ir.limite12)} sub="teto de PGBL + FAPI" />
        <Kpi
          rotulo="Aportado em PGBL"
          valor={fR0(ir.aportado)}
          sub={`${fP(pct)} do limite · ${ir.nAportes} ${ir.nAportes === 1 ? 'aporte' : 'aportes'}`}
        />
        <Kpi
          rotulo="Economia estimada de IR"
          valor={fR0(ir.economia)}
          sub={`até ${fR0(ir.economiaMaxima)} com o limite completo`}
          tom="good"
        />
      </div>

      {semInss ? (
        <Callout tom="warn">
          Informe o INSS na <Link href={LINK_ABA_PGBL}>aba PGBL</Link> (Carteira &gt; Análises &gt;
          Imposto de Renda) para calcular a economia: sem contribuição ao INSS o PGBL não deduz.
        </Callout>
      ) : null}

      <div className="chart" style={{ gap: 10, padding: '14px 16px' }}>
        <h3>
          {ir.encerrado ? 'Espaço de dedução' : `Espaço de dedução até 31/12/${ir.ano}`}{' '}
          <small>
            {ir.encerrado
              ? `ano-calendário ${ir.ano} encerrado`
              : `faltam ${fR0(ir.faltaNoLimite)}${ir.diasAte3112 != null ? ` · ${ir.diasAte3112} dias` : ''}`}
          </small>
        </h3>
        {ir.encerrado ? null : <Progresso pct={pct} />}
        <div className="dream" style={{ border: 0, padding: 0 }}>
          <div className="row">
            <span>
              Aportado <b>{fR(ir.aportado)}</b>
            </span>
            <span>
              Limite <b>{fR(ir.limite12)}</b>
            </span>
          </div>
        </div>
        {ir.encerrado ? null : ir.faltaNoLimite > 0 ? (
          <div className="callout">
            Um aporte único de <b>{fR(ir.faltaNoLimite)}</b> ainda em {ir.ano} reduz o IR em cerca
            de <b style={{ color: 'var(--good)' }}>{fR(ir.economiaFalta)}</b>. Vale a data de
            processamento pela seguradora, que costuma fechar em 29 ou 30/12.
          </div>
        ) : (
          <div className="callout">Você já usou todo o limite de 12% em {ir.ano}.</div>
        )}
      </div>

      <div className="two">
        <div className="chart" style={{ padding: '14px 16px', gap: 12 }}>
          <h3>
            Condições para deduzir <small>verificadas com os seus dados</small>
          </h3>
          <div className="chk">
            {ir.condicoes.map((c) => (
              <div key={c.chave}>
                <span className={`ic ${ICONE[c.status][0]}`}>{ICONE[c.status][1]}</span>
                <div>
                  <b>{c.titulo}</b>
                  <span>{c.descricao}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="chart" style={{ padding: '14px 16px', gap: 10 }}>
          <h3>
            Completa x simplificada{' '}
            <small>
              DAA {ir.ano + 1}, ano-calendário {ir.ano}
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
                  <td className="n">{fR(ir.rendaTributavel)}</td>
                  <td className="n">{fR(ir.rendaTributavel)}</td>
                </tr>
                <tr>
                  <td>PGBL</td>
                  <td className="n g">{fR(-dc.pgbl)}</td>
                  <td className="n x">—</td>
                </tr>
                <tr>
                  <td>INSS</td>
                  <td className="n">{fR(-dc.inss)}</td>
                  <td className="n x">—</td>
                </tr>
                <tr>
                  <td>Dependentes, saúde e educação</td>
                  <td className="n">{fR(-outras)}</td>
                  <td className="n x">—</td>
                </tr>
                {pensaoLivro > 0 ? (
                  <tr>
                    <td>Pensão alimentícia e livro-caixa</td>
                    <td className="n">{fR(-pensaoLivro)}</td>
                    <td className="n x">—</td>
                  </tr>
                ) : null}
                <tr>
                  <td>Desconto simplificado (20%, teto)</td>
                  <td className="n x">—</td>
                  <td className="n">{fR(-sim.descontoSimplificado)}</td>
                </tr>
                <tr>
                  <td>Base de cálculo</td>
                  <td className="n">{fR(sim.completo.baseCalculo)}</td>
                  <td className="n">{fR(sim.simplificado.baseCalculo)}</td>
                </tr>
                {temRedutor ? (
                  <tr>
                    <td>Redutor Lei 15.270</td>
                    <td className="n g">{fR(-sim.completo.redutor)}</td>
                    <td className="n g">{fR(-sim.simplificado.redutor)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>IR antes das doações</td>
                  <td className="n">{fR(sim.completo.impostoTabela - sim.completo.redutor)}</td>
                  <td className="n">
                    {fR(sim.simplificado.impostoTabela - sim.simplificado.redutor)}
                  </td>
                </tr>
                <tr>
                  <td>Doações incentivadas</td>
                  <td className="n g">{fR(-sim.completo.doacoes)}</td>
                  <td className="n x">—</td>
                </tr>
                <tr className="tot">
                  <td>IR devido estimado</td>
                  <td className={completaMelhor ? 'n b' : 'n'}>{fR(sim.completo.irDevido)}</td>
                  <td className={completaMelhor ? 'n' : 'n b'}>{fR(sim.simplificado.irDevido)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ margin: 0, fontSize: 12.5 }}>
            {completaMelhor ? (
              <>
                A completa economiza{' '}
                <b style={{ color: 'var(--good)' }}>{fR(sim.economiaCompletoVsSimplificado)}</b>: o
                PGBL responde por {fR(ir.economia)} e as doações por {fR(sim.completo.doacoes)}.
              </>
            ) : (
              <>
                A simplificada sai{' '}
                <b style={{ color: 'var(--good)' }}>
                  {fR(Math.abs(sim.economiaCompletoVsSimplificado))}
                </b>{' '}
                mais barata no seu caso: o PGBL só deduz no modelo completo.
              </>
            )}
          </p>
          {ir.retidoNaFonte != null && ir.restituicaoProjetada != null ? (
            <span className="fine">
              Retido na fonte no ano: {fR(ir.retidoNaFonte)} →{' '}
              {ir.restituicaoProjetada >= 0
                ? `restituição projetada ${fR(ir.restituicaoProjetada)}`
                : `imposto a pagar projetado ${fR(-ir.restituicaoProjetada)}`}
              . Sem o IR de Stocks EUA.
            </span>
          ) : null}
          {sim.avisos.irpfmPossivel ? (
            <span className="fine">
              Renda total acima de R$ 600 mil: o IRPFM (imposto mínimo) pode neutralizar a dedução.
            </span>
          ) : null}
        </div>
      </div>

      <div className="block">
        <h3>
          Aportes em PGBL no ano{' '}
          <small>agrupados por entidade, como entram na ficha de Pagamentos</small>
        </h3>
        {ir.planos.length ? (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Plano / entidade</th>
                  <th>CNPJ</th>
                  <th>Regime</th>
                  <th className="n">Aportes</th>
                  <th className="n">Total no ano</th>
                  <th className="n">Saldo atual</th>
                </tr>
              </thead>
              <tbody>
                {ir.planos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.nome}
                      <span className="sub">
                        {p.seguradora ?? '—'}
                        {p.tipo === 'vgbl' ? ' · VGBL, não dedutível' : ''}
                      </span>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{p.cnpj ?? 'CNPJ do fundo'}</td>
                    <td>{p.regime ?? '—'}</td>
                    <td className="n">{p.nAportes}</td>
                    <td className="n">
                      <b>{fR(p.totalAno)}</b>
                    </td>
                    <td className="n">{fR(p.saldoAtual)}</td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>Total dedutível</td>
                  <td />
                  <td />
                  <td className="n">{soma(pgblDedutiveis.map((p) => p.nAportes))}</td>
                  <td className="n">{fR(soma(pgblDedutiveis.map((p) => p.totalAno)))}</td>
                  <td className="n">{fR(soma(pgblDedutiveis.map((p) => p.saldoAtual)))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="fine">Nenhum plano de previdência com aporte no ano.</p>
        )}
      </div>

      <div className="two">
        <div className="block">
          <h3>Onde lançar na declaração</h3>
          <ul className="insights" style={{ fontSize: 12.5 }}>
            <li>
              <span>
                <b>Pagamentos Efetuados → código 36</b> (previdência complementar, PGBL). Um
                lançamento por entidade, com CNPJ e o total do ano.
              </span>
            </li>
            <li>
              <span>
                <b>Não vai em Bens e Direitos.</b> O saldo do PGBL não é declarado como bem; só o
                VGBL é.
              </span>
            </li>
            <li>
              <span>
                <b>Resgates</b> entram pelo informe da seguradora: tributação exclusiva (regressivo)
                ou rendimento tributável com 15% retido (progressivo).
              </span>
            </li>
            <li>
              <span>
                <b>Confira com o Informe de Contribuições</b> que a seguradora envia até o último
                dia útil de fevereiro. Ele é o documento oficial.
              </span>
            </li>
          </ul>
        </div>
        <div className="callout" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b style={{ fontFamily: 'var(--f-display)', color: 'var(--navy9)' }}>Observações</b>
          <span>
            A dedução é um diferimento: o IR incide no resgate sobre o valor total (aportes +
            rendimentos).
          </span>
          <span>Dividendos, JCP e renda fixa não entram na base dos 12%.</span>
          <span>
            Aportes em nome de dependentes só deduzem se ele também contribuir ao INSS (a partir de
            16 anos).
          </span>
          <span>
            Renda tributável até R$ 88.200 no ano: o redutor da Lei 15.270/2025 pode tornar o
            benefício menor. Renda total acima de R$ 600 mil: o IRPFM pode neutralizar a dedução.
          </span>
        </div>
      </div>

      <div className="block">
        <h3>
          Gastos dedutíveis no modelo completo{' '}
          <small>identificados pelas categorias do fluxo de caixa</small>
        </h3>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Dedução</th>
                <th>Limite</th>
                <th>O que entra</th>
                <th className="n">Identificado no ano</th>
              </tr>
            </thead>
            <tbody>
              {deducoes.map((d) => {
                const [nome, limite, tom, entra, naoEntra] = DEDUCAO[d.chave];
                return (
                  <tr key={d.chave}>
                    <td>
                      <b style={{ fontWeight: 600 }}>{nome}</b>
                    </td>
                    <td>
                      <Tag tom={tom}>{limite}</Tag>
                    </td>
                    <td className="wrap">
                      {entra}
                      <span className="nd">Não entra: {naoEntra}</span>
                    </td>
                    <td className="n">
                      {fR(d.valor)}
                      {d.nota ? <span className="sub">{d.nota}</span> : null}
                    </td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td colSpan={3}>
                  Total: {fR(sim.completo.deducoes)} na base + {fR(sim.completo.doacoes)} no
                  imposto, já aplicados na simulação
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="fine">
          Guarde recibos e notas com CPF/CNPJ do prestador por 5 anos: a Receita pode pedir
          comprovação. Valores estimados pela tabela progressiva vigente; não substituem o cálculo
          da Receita Federal.
        </p>
      </div>
    </Pagina>
  );
}
