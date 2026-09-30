/**
 * Data estimada de divulgação de resultado (ITR/DFP) — decisão 17: "estimada" até sair a oficial.
 *
 * O IPE não traz a data de divulgação estruturada; a Fase A mediu que a entrega do mesmo período no
 * ano anterior + 1 ano acerta com mediana de 1 dia no ITR (86% ≤ 7 dias; n = 914) e 4 dias no DFP.
 * Ex.: WEGE3 2T25 entregue em 23/07/2025 ⇒ 2T26 estimado em 23/07/2026 (real: 22/07/2026).
 * A data cai no próximo pregão quando o aniversário é fim de semana/feriado. Sem entrega do ano
 * anterior ⇒ sem estimativa (nunca chutar).
 *
 * Funções puras; datas 'AAAA-MM-DD' (UTC).
 */
import { proximoPregaoOuMesmo } from '@/services/analiseAtivos/regras/comum/pregoes';
import type { EntregaDocumento } from '@/services/analiseAtivos/tipos';

/**
 * Estimativa vencida há mais que isto (documento não entregue) deixa de gerar evento: emissor que
 * parou de entregar (cancelado, em recuperação) não fica com "resultado estimado" eterno.
 */
export const TOLERANCIA_ESTIMATIVA_VENCIDA_DIAS = 45;

export type SubtipoResultado = 'ITR1' | 'ITR2' | 'ITR3' | 'DFP';

export interface AlvoResultado {
  cnpj: string;
  docTipo: 'DFP' | 'ITR';
  anoFiscal: number;
  /** 1–3 no ITR; null no DFP */
  trimestreFiscal: number | null;
}

export interface EstimativaResultado {
  data: string;
  estimado: true;
  /** ex.: 'ITR 2T25 entregue em 2025-07-23' */
  base: string;
  /** a data estimada já passou e o documento ainda não chegou */
  atrasado: boolean;
}

const DIA_MS = 86_400_000;

/** Trimestre do ITR (1–3). Sem trimestreFiscal gravado, cai para o mês do dtFim (ano civil). */
export function trimestreDaEntrega(e: EntregaDocumento): number | null {
  if (e.docTipo === 'DFP') return null;
  if (e.trimestreFiscal !== null && e.trimestreFiscal >= 1 && e.trimestreFiscal <= 4) {
    return e.trimestreFiscal;
  }
  return Math.ceil(Number(e.dtFim.slice(5, 7)) / 3);
}

/** '2026-3T' | '2026-FY' — chave de AssetEvento de resultado. */
export function periodoRef(alvo: Pick<AlvoResultado, 'docTipo' | 'anoFiscal' | 'trimestreFiscal'>) {
  return alvo.docTipo === 'DFP'
    ? `${alvo.anoFiscal}-FY`
    : `${alvo.anoFiscal}-${alvo.trimestreFiscal}T`;
}

export function subtipoResultado(
  alvo: Pick<AlvoResultado, 'docTipo' | 'trimestreFiscal'>,
): SubtipoResultado {
  if (alvo.docTipo === 'DFP') return 'DFP';
  const t = alvo.trimestreFiscal;
  if (t === 1 || t === 2 || t === 3) return `ITR${t}`;
  throw new Error(`Trimestre de ITR inválido: ${t}`);
}

/** Rótulo curto do período: '2T25' | 'FY25'. */
export function rotuloPeriodo(
  alvo: Pick<AlvoResultado, 'docTipo' | 'anoFiscal' | 'trimestreFiscal'>,
): string {
  const aa = String(alvo.anoFiscal % 100).padStart(2, '0');
  return alvo.docTipo === 'DFP' ? `FY${aa}` : `${alvo.trimestreFiscal}T${aa}`;
}

/** Mesmo dia e mês do ano seguinte; 29/02 ⇒ 28/02. */
export function somarUmAno(data: string): string {
  const ano = Number(data.slice(0, 4)) + 1;
  const mmdd = data.slice(5);
  if (mmdd === '02-29') return `${ano}-02-28`;
  return `${ano}-${mmdd}`;
}

function mesmoSlot(e: EntregaDocumento, alvo: AlvoResultado): boolean {
  return (
    e.cnpj === alvo.cnpj &&
    e.docTipo === alvo.docTipo &&
    (alvo.docTipo === 'DFP' || trimestreDaEntrega(e) === alvo.trimestreFiscal)
  );
}

export function estimarDataResultado(
  entregas: EntregaDocumento[],
  alvo: AlvoResultado,
  hoje: string,
): EstimativaResultado | null {
  const base = entregas.find((e) => mesmoSlot(e, alvo) && e.anoFiscal === alvo.anoFiscal - 1);
  if (!base) return null;
  const data = proximoPregaoOuMesmo(somarUmAno(base.dtEntregaOriginal));
  const rotuloBase = rotuloPeriodo({
    docTipo: base.docTipo,
    anoFiscal: base.anoFiscal,
    trimestreFiscal: trimestreDaEntrega(base),
  });
  return {
    data,
    estimado: true,
    base: `${base.docTipo} ${rotuloBase} entregue em ${base.dtEntregaOriginal}`,
    atrasado: data < hoje,
  };
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}

/**
 * Próximos documentos esperados do emissor: para cada "vaga" (DFP, ITR1, ITR2, ITR3) já entregue, o
 * período seguinte à última entrega (ano fiscal + 1), se ainda não chegou e se a estimativa não
 * venceu há mais de TOLERANCIA_ESTIMATIVA_VENCIDA_DIAS. Ordenado pela data estimada.
 */
export function proximoPeriodoEsperado(
  entregas: EntregaDocumento[],
  cnpj: string,
  hoje: string,
): Array<Pick<AlvoResultado, 'docTipo' | 'anoFiscal' | 'trimestreFiscal'>> {
  const doEmissor = entregas.filter((e) => e.cnpj === cnpj);
  const ultimaPorVaga = new Map<string, EntregaDocumento>();
  for (const e of doEmissor) {
    const t = trimestreDaEntrega(e);
    if (e.docTipo === 'ITR' && (t === null || t > 3)) continue;
    const k = `${e.docTipo}|${t ?? ''}`;
    const atual = ultimaPorVaga.get(k);
    if (!atual || e.anoFiscal > atual.anoFiscal) ultimaPorVaga.set(k, e);
  }
  const out: Array<{ alvo: AlvoResultado; data: string }> = [];
  for (const ultima of ultimaPorVaga.values()) {
    const alvo: AlvoResultado = {
      cnpj,
      docTipo: ultima.docTipo,
      anoFiscal: ultima.anoFiscal + 1,
      trimestreFiscal: trimestreDaEntrega(ultima),
    };
    const est = estimarDataResultado(doEmissor, alvo, hoje);
    if (!est) continue;
    if (diasEntre(est.data, hoje) > TOLERANCIA_ESTIMATIVA_VENCIDA_DIAS) continue;
    out.push({ alvo, data: est.data });
  }
  return out
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(({ alvo }) => ({
      docTipo: alvo.docTipo,
      anoFiscal: alvo.anoFiscal,
      trimestreFiscal: alvo.trimestreFiscal,
    }));
}
