/**
 * Textos dos eventos da Análise de Ativos na Agenda (arquivo PRÓPRIO da fatia E — não depende dos
 * textos da fatia D). Linguagem neutra: descreve a data e a fonte, nunca recomenda nem adjetiva
 * (compliance, spec §9; testado com regras/comum/linguagem.encontrarPalavrasProibidas).
 */
import type { SubtipoAssembleia } from '@/services/analiseAtivos/regras/eventos/ipe';
import {
  rotuloPeriodo,
  type AlvoResultado,
} from '@/services/analiseAtivos/regras/eventos/estimativaResultado';

export type TipoAssetEvento = 'resultado_estimado' | 'resultado' | 'assembleia';

const NOME_ASSEMBLEIA: Record<SubtipoAssembleia, string> = {
  AGO: 'assembleia geral ordinária',
  AGE: 'assembleia geral extraordinária',
  'AGO/AGE': 'assembleia geral ordinária e extraordinária',
};

/** '2026-3T' → '3T26'; '2026-FY' → 'resultado anual de 2026' (para o título). */
function descreverPeriodo(periodoRef: string): { curto: string; titulo: string } {
  const m = /^(\d{4})-(FY|[1-4]T)$/.exec(periodoRef);
  if (!m) return { curto: periodoRef, titulo: `resultado de ${periodoRef}` };
  const ano = Number(m[1]);
  if (m[2] === 'FY') {
    const curto = rotuloPeriodo({ docTipo: 'DFP', anoFiscal: ano, trimestreFiscal: null });
    return { curto, titulo: `resultado anual de ${ano}` };
  }
  const t = Number(m[2][0]);
  const curto = rotuloPeriodo({ docTipo: 'ITR', anoFiscal: ano, trimestreFiscal: t });
  return { curto, titulo: `resultado do ${curto}` };
}

export function tituloResultado(symbol: string, periodoRef: string, estimado: boolean): string {
  const { titulo } = descreverPeriodo(periodoRef);
  return `${symbol} · ${titulo}${estimado ? ' (data estimada)' : ''}`;
}

export function descricaoResultado(estimado: boolean, periodoRef: string): string {
  const { curto } = descreverPeriodo(periodoRef);
  if (estimado) {
    return (
      `Data estimada a partir da entrega do mesmo período no ano anterior à CVM (${curto}). ` +
      'A data oficial substitui esta quando o documento for entregue.'
    );
  }
  return `Documento do período ${curto} entregue à CVM nesta data.`;
}

export function tituloAssembleia(symbol: string, subtipo: string): string {
  return `${symbol} · assembleia (${subtipo})`;
}

/**
 * A pauta (IPE Assunto) fica só no banco: é texto livre da companhia e pode conter termos que a
 * linguagem da área não usa ("venda de ações em tesouraria"); a Fase 1 decide como exibir.
 */
export function descricaoAssembleia(subtipo: string): string {
  const nome = NOME_ASSEMBLEIA[subtipo as SubtipoAssembleia] ?? 'assembleia de acionistas';
  return `${nome[0].toUpperCase()}${nome.slice(1)} informada pela companhia à CVM.`;
}

/** Todos os textos fixos (para a varredura de palavras proibidas nos testes). */
export function amostraTextosFixos(): string[] {
  const alvo: Pick<AlvoResultado, 'docTipo' | 'anoFiscal' | 'trimestreFiscal'> = {
    docTipo: 'ITR',
    anoFiscal: 2026,
    trimestreFiscal: 3,
  };
  const ref = `${alvo.anoFiscal}-${alvo.trimestreFiscal}T`;
  return [
    tituloResultado('WEGE3', ref, true),
    tituloResultado('WEGE3', ref, false),
    tituloResultado('WEGE3', '2026-FY', true),
    descricaoResultado(true, ref),
    descricaoResultado(false, '2026-FY'),
    ...(Object.keys(NOME_ASSEMBLEIA) as SubtipoAssembleia[]).flatMap((s) => [
      tituloAssembleia('WEGE3', s),
      descricaoAssembleia(s),
    ]),
  ];
}
