'use client';

import dynamic from 'next/dynamic';
import { temAcesso } from '@/lib/planos';
import { Pagina } from '../ui/Pagina';
import type { PropsSecao } from '../tipos';

// Parágrafo de IR só no Advanced (o texto não pode ir para os chunks do Basic/Pro).
const ParagrafoPgbl = dynamic(() => import('../adv/ParagrafoPgbl'), { ssr: false });

const P = { margin: 0 } as const;

/**
 * Seção 9: textos do Pedro (fontes, período, métodos e aviso) + uma linha por divergência com as
 * telas do app e pelos blocos que chegam "em breve". Em todos os planos a rentabilidade é descrita
 * "sem o efeito de entradas e saídas de dinheiro" (decisão 6: o texto é estático e vai no mesmo
 * chunk do Basic).
 */
export function SecaoComoLer({ relatorio }: PropsSecao) {
  const n = relatorio.periodo.meses;
  const plano = relatorio.plano;
  const pro = temAcesso(plano, 'pro');
  const adv = temAcesso(plano, 'adv');

  const emBreve: string[] = [];
  if (n > 1) emBreve.push('a evolução das dívidas mês a mês');
  if (adv) emBreve.push('a cobertura do FGC', 'o IR mensal de ações e FIIs');
  const listaEmBreve =
    emBreve.length > 1
      ? `${emBreve.slice(0, -1).join(', ')} e ${emBreve[emBreve.length - 1]}`
      : emBreve[0];

  return (
    <Pagina
      numero={9}
      titulo="Como ler este relatório"
      lead="Fontes, métodos e avisos."
      relatorio={relatorio}
    >
      <div className="block fine" style={{ fontSize: '11.5px', gap: 6 }}>
        <p style={P}>
          <b>Fontes.</b> Lançamentos manuais e conexões Open Finance do seu plano. Cotações e
          índices do fechamento do dia anterior à geração.
        </p>
        <p style={P}>
          <b>Período.</b>{' '}
          {n === 1
            ? 'O mês atual é parcial: inclui o que foi lançado até a data de geração, incluindo contas agendadas.'
            : 'Em períodos de vários meses, os valores de orçamento são somas e as médias são por mês. O mês atual entra parcial.'}
        </p>
        <p style={P}>
          <b>Orçamento.</b> A sobra é a receita menos os gastos lançados (o realizado), sem o
          Planejamento Financeiro; por isso difere da sobra prevista da tela Orçamento.
        </p>
        <p style={P}>
          <b>Rentabilidade.</b> TWR (time-weighted return) mede o desempenho dos ativos sem o efeito
          de entradas e saídas de dinheiro. MWR considera o momento dessas movimentações.
          {pro
            ? ' A rentabilidade mensal do Planejamento usa o TWR e pode diferir da aba Acompanhamento.'
            : ''}
        </p>
        <p style={P}>
          <b>Dívidas.</b> CET informado pelo usuário ou pela instituição. Juros até quitar
          consideram as parcelas atuais, sem antecipação. O saldo é corrigido pelo índice de cada
          contrato, como na Carteira e na Saúde Financeira, e pode diferir da tela Dívidas; a
          parcela do mês segue o cronograma do app (no rotativo, o mínimo de 15%).
        </p>
        {adv ? (
          <p style={P}>
            <b>Saúde financeira.</b> A nota de 0 a 100 é provisória: média dos indicadores
            disponíveis (bom = 100, atenção = 50, alerta = 0). Os indicadores usam os 3 últimos
            meses fechados (ou o mês anterior fechado) e as metas podem diferir das da tela Saúde
            Financeira. Proventos são os valores líquidos pagos até a geração e podem diferir da aba
            Proventos.
          </p>
        ) : null}
        {listaEmBreve ? (
          <p style={P}>
            <b>Em breve.</b> Chegam ao relatório {listaEmBreve}. Até lá, veja nas telas do app.
          </p>
        ) : null}
        {adv ? <ParagrafoPgbl /> : null}
        <p style={P}>
          <b>Aviso.</b> Este relatório é informativo e não é recomendação de investimento, nos
          termos da Resolução CVM 20/2021. O cálculo de IR é uma estimativa e não substitui a
          apuração oficial.
        </p>
      </div>
    </Pagina>
  );
}
