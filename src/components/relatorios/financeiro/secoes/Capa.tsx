import { NOME_PLANO, temAcesso, type Plano } from '@/lib/planos';
import { IconeCadeado } from '../marca/IconeCadeado';
import { Logo } from '../marca/Logo';
import { Simbolo } from '../marca/Simbolo';
import { partesGeradoEm } from '../ui/Pagina';
import type { PropsSecao } from '../tipos';

/**
 * Sumário da capa (fixo no front): títulos sem palavras proibidas, com o cadeado e o nome do plano
 * quando o plano do relatório não libera a seção. Porte de secCover() do protótipo.
 */
export const SUMARIO: [titulo: string, plano: Plano | null][] = [
  ['Resumo do período', null],
  ['Orçamento', 'basic'],
  ['Dívidas', 'basic'],
  ['Carteira de investimentos', 'pro'],
  ['Planejamento financeiro', 'pro'],
  ['Sonhos', 'pro'],
  ['Saúde financeira', 'adv'],
  ['Declaração Imposto de Renda: IR a restituir', 'adv'],
];

export function Capa({ relatorio }: PropsSecao) {
  const { data } = partesGeradoEm(relatorio.geradoEm);
  return (
    <section className="cover">
      <Simbolo />
      <div className="brand">
        <Logo />
      </div>
      <h1>Relatório financeiro</h1>
      <div className="meta">
        <div>
          <span>Cliente</span>
          <b>{relatorio.cliente}</b>
        </div>
        <div>
          <span>Período</span>
          <b>{relatorio.periodo.rotulo}</b>
        </div>
        <div>
          <span>Plano</span>
          <b>{NOME_PLANO[relatorio.plano]}</b>
        </div>
        <div>
          <span>Gerado em</span>
          <b>{data}</b>
        </div>
        {relatorio.consultor ? (
          <div>
            <span>Consultor</span>
            <b>{relatorio.consultor}</b>
          </div>
        ) : null}
      </div>
      <div className="toc">
        {SUMARIO.map(([titulo, need], i) => (
          <div key={titulo}>
            <span className="n">{i + 1}</span>
            {titulo}
            {need && !temAcesso(relatorio.plano, need) ? (
              <span className="lk">
                <IconeCadeado /> {NOME_PLANO[need]}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
