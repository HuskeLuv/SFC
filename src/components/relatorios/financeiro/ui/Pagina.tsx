import type { ReactNode } from 'react';
import { NOME_PLANO } from '@/lib/planos';
import type { RelatorioFinanceiro } from '@/types/relatorioFinanceiro';

/** O que o cabeçalho e o rodapé da página leem do relatório. */
export type MetaPagina = Pick<
  RelatorioFinanceiro,
  'cliente' | 'consultor' | 'plano' | 'periodo' | 'geradoEm'
>;

/** 'dd/mm/aaaa' e 'hh:mm' do geradoEm (ISO com -03:00), sem conversão de fuso no cliente. */
export function partesGeradoEm(geradoEm: string): { data: string; hora: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(geradoEm);
  if (!m) return { data: '', hora: '' };
  return { data: `${m[3]}/${m[2]}/${m[1]}`, hora: `${m[4]}:${m[5]}` };
}

export interface PaginaProps {
  /** Número da seção (1–9), no quadrado azul. */
  numero: number;
  titulo: ReactNode;
  /** Linha de apoio do título. */
  lead?: ReactNode;
  relatorio: MetaPagina;
  /** "Página N" (padrão = número da seção, como no protótipo). */
  pagina?: number;
  children?: ReactNode;
}

/**
 * Folha A4 do relatório: porte de page(num, title, lead, body) do protótipo — cabeçalho .ph,
 * .sec-head numerado, corpo e rodapé '{Cliente} · Plano {Plano} · gerado em dd/mm/aaaa às hh:mm'
 * ('· gerado pelo consultor {nome}' só com consultor) + 'Página N'.
 */
export function Pagina({ numero, titulo, lead, relatorio, pagina, children }: PaginaProps) {
  const { data, hora } = partesGeradoEm(relatorio.geradoEm);
  return (
    <section className="page">
      <div className="ph">
        <b>My Finance</b>
        <span>Relatório financeiro · {relatorio.periodo.rotulo}</span>
      </div>
      <div className="sec-head">
        <span className="sec-num">{numero}</span>
        <h2>{titulo}</h2>
        {lead ? <p>{lead}</p> : null}
      </div>
      {children}
      <div className="pf">
        <span>
          {relatorio.cliente} · Plano {NOME_PLANO[relatorio.plano]} · gerado em {data} às {hora}
          {relatorio.consultor ? ` · gerado pelo consultor ${relatorio.consultor}` : ''}
        </span>
        <span className="pg">Página {pagina ?? numero}</span>
      </div>
    </section>
  );
}
