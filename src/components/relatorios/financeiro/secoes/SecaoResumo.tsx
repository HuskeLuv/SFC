'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { temAcesso } from '@/lib/planos';
import type { BlocoSaude, SonhoRelatorio } from '@/types/relatorioFinanceiro';
import { fP } from '../formato';
import { useFormato } from '../FormatoProvider';
import { Kpi } from '../ui/Kpi';
import { KpiLock } from '../ui/KpiLock';
import { Pagina } from '../ui/Pagina';
import type { PropsSecao } from '../tipos';
import { agregarOrcamento, maiorEstouro } from './SecaoOrcamento';
import { resumirDividas, rotuloContratos, taxaMensal } from './SecaoDividas';

// Corpos que só entram quando o plano libera (os textos e os nomes de campo não podem ir para os
// chunks do Basic/Pro).
const DestaqueCarteira = dynamic(() => import('./real/DestaqueCarteira'), { ssr: false });
const DestaquePgbl = dynamic(() => import('../adv/DestaquePgbl'), { ssr: false });

const ROTULO_SAUDE = { good: 'Saudável', warn: 'Atenção', bad: 'Alerta' } as const;

function subSaude(saude: BlocoSaude): string {
  const alertas = saude.indicadores.filter((i) => i.status === 'bad').length;
  const rotulo = saude.status ? ROTULO_SAUDE[saude.status] : 'Sem nota';
  const txt = alertas === 0 ? 'nenhum alerta' : alertas === 1 ? '1 alerta' : `${alertas} alertas`;
  return `${rotulo}, ${txt}`;
}

function kpiSonhos(sonhos: SonhoRelatorio[]): [string, string] {
  if (sonhos.length === 0) return ['—', 'nenhum sonho com meta'];
  const bons = sonhos.filter((s) => s.status === 'good').length;
  const atrasados = sonhos.filter((s) => s.status === 'bad').length;
  return [
    `${bons} de ${sonhos.length}`,
    atrasados === 0 ? 'nenhum atrasado' : atrasados === 1 ? '1 atrasado' : `${atrasados} atrasados`,
  ];
}

export function SecaoResumo({ relatorio }: PropsSecao) {
  const { fR0 } = useFormato();
  const n = relatorio.periodo.meses;
  const plano = relatorio.plano;
  const b = agregarOrcamento(relatorio.orcamento);
  const temOrc = relatorio.orcamento.temOrcamento;
  const dv = resumirDividas(relatorio.dividas);
  const pior = maiorEstouro(b.cats);
  const rotativoCaro = [...dv.rotativas]
    .filter((d) => d.cetAA != null)
    .sort((x, y) => (y.cetAA ?? 0) - (x.cetAA ?? 0))[0];

  const { carteira, carteiraAvancada: av, saude, sonhos, ir } = relatorio;
  const twr = av?.twr ?? null;
  const cdi = av?.cdi ?? null;
  const [sonhosValor, sonhosSub] = kpiSonhos(sonhos ?? []);

  const destaques: ReactNode[] = [];
  destaques.push(
    temOrc && b.orc > 0 ? (
      <li key="gasto">
        Você gastou {fR0(b.real)} de {fR0(b.orc)} orçados e ficou com {fR0(b.sobra)}
        {b.poup != null ? ` (${fP(b.poup)} da receita)` : ''}.
      </li>
    ) : (
      <li key="gasto">
        Você gastou {fR0(b.real)} e ficou com {fR0(b.sobra)}
        {b.poup != null ? ` (${fP(b.poup)} da receita)` : ''}.
      </li>
    ),
  );
  if (temOrc) {
    destaques.push(
      pior ? (
        <li key="estouro">
          {pior.nome} foi a categoria que mais passou do orçado: {fR0(pior.real - pior.orc)} acima
          {n > 1 ? `, em ${pior.over} de ${n} meses` : ''}.
        </li>
      ) : (
        <li key="estouro">Nenhuma categoria passou do orçado.</li>
      ),
    );
  }
  if (rotativoCaro && rotativoCaro.cetAA != null) {
    destaques.push(
      <li key="rotativo">
        O rotativo do cartão custa {fP(rotativoCaro.cetAA, 1)} ao ano. Cada R$ 1.000 nele gera cerca
        de {fR0(1000 * taxaMensal(rotativoCaro.cetAA))} de juros por mês.
      </li>,
    );
  }
  const bloqueados: string[] = [];
  if (temAcesso(plano, 'pro') && carteira) {
    destaques.push(<DestaqueCarteira key="carteira" carteira={carteira} />);
  } else if (!temAcesso(plano, 'pro')) {
    bloqueados.push('Evolução do patrimônio e dos sonhos: disponível no Pro.');
  }
  if (temAcesso(plano, 'adv')) {
    if (twr != null && cdi != null) {
      destaques.push(
        <li key="twr">
          A carteira rendeu {fP(twr, 2)} no período, contra {fP(cdi, 2)} do CDI.
        </li>,
      );
    }
    if (ir) destaques.push(<DestaquePgbl key="ir" ir={ir} />);
  } else {
    bloqueados.push(
      'Rentabilidade, proventos, saúde financeira e quanto do seu IR pode voltar: disponível no Advanced.',
    );
  }

  return (
    <Pagina
      numero={1}
      titulo="Resumo do período"
      lead="Os números principais em uma página."
      relatorio={relatorio}
    >
      <div className="kpis">
        <Kpi
          rotulo="Receita no período"
          valor={fR0(b.receita)}
          sub={n === 1 ? 'prevista para o mês' : `média de ${fR0(b.receita / n)}/mês`}
        />
        <Kpi
          rotulo="Gastos realizados"
          valor={fR0(b.real)}
          sub={
            temOrc && b.orc > 0 ? `${fP((b.real / b.orc) * 100, 0)} do orçado` : 'gastos lançados'
          }
        />
        <Kpi
          rotulo="Sobra"
          valor={fR0(b.sobra)}
          sub={b.poup != null ? `índice de poupança ${fP(b.poup)}` : 'sem receita lançada'}
          destaque
          tom={b.sobra < 0 ? 'bad' : 'good'}
        />
        <Kpi rotulo="Dívidas em aberto" valor={fR0(dv.total)} sub={rotuloContratos(dv.contratos)} />
        {carteira ? (
          <Kpi
            rotulo="Patrimônio investido"
            valor={fR0(carteira.patrimonio)}
            sub={
              carteira.variacaoPeriodo != null
                ? `${carteira.variacaoPeriodo >= 0 ? '+' : ''}${fR0(carteira.variacaoPeriodo)} no período`
                : 'histórico em processamento'
            }
          />
        ) : (
          <KpiLock rotulo="Patrimônio investido" plano="pro" />
        )}
        {av ? (
          <Kpi
            rotulo="Rentabilidade (TWR)"
            valor={twr != null ? fP(twr, 2) : '—'}
            sub={
              twr != null && cdi != null && cdi !== 0
                ? `${fP((twr / cdi) * 100, 0)} do CDI`
                : 'rentabilidade em processamento'
            }
          />
        ) : (
          <KpiLock rotulo="Rentabilidade da carteira" plano="adv" />
        )}
        {saude ? (
          <Kpi
            rotulo="Saúde financeira"
            valor={saude.nota != null ? `${Math.round(saude.nota)}/100` : '—'}
            sub={subSaude(saude)}
          />
        ) : (
          <KpiLock rotulo="Saúde financeira" plano="adv" />
        )}
        {sonhos ? (
          <Kpi rotulo="Sonhos no ritmo" valor={sonhosValor} sub={sonhosSub} />
        ) : (
          <KpiLock rotulo="Sonhos" plano="pro" />
        )}
      </div>
      <div className="block">
        <h3>Destaques</h3>
        <ul className="insights">
          {destaques}
          {bloqueados.map((t) => (
            <li key={t} className="lk">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </Pagina>
  );
}
