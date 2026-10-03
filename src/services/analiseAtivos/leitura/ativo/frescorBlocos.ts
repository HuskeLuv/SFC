/**
 * Frescor POR BLOCO da página do ativo (bloco C, fatia B): selo no rodapé de cada card e item
 * "Fonte e atualização" do menu ⋯. Função pura (o topo passa as datas já lidas).
 *
 * Regras de atraso (spec fatia B item 4):
 *  - cotação: último pregão do ativo MAIS de 3 pregões atrás do último pregão do mercado;
 *  - fundamentos (ações): trimestre encerrado há 75 dias ou mais sem o ITR/DFP correspondente;
 *  - proventos: a regra de defasagem existente (flags 'proventos_defasados*' / motivo
 *    'div:fonte_defasada' gravados pelo motor);
 *  - FII: informe mensal com mais de 2 meses.
 * Só é enviado com params v2 (o topo decide): com a v1 a página fica idêntica.
 */
import { distanciaEmPregoes, pregaoAnterior } from '@/services/analiseAtivos/regras/comum/pregoes';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { BlocoReporte } from '@/services/analiseAtivos/curadoria/contrato';
import type { ClasseQuadro, FrescorBloco } from '@/types/analiseAtivosApi';

export const PREGOES_ATRASO_COTACAO = 3;
export const DIAS_ATRASO_ITR = 75;
export const MESES_ATRASO_INFORME_FII = 2;

const T = TEXTOS_TELA.telaConferencia;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface EntradaFrescorBlocos {
  classe: ClasseQuadro;
  /** AAAA-MM-DD de hoje (São Paulo) */
  hoje: string;
  /** último pregão do ativo (AAAA-MM-DD) */
  precoData: string | null;
  /** último ano fiscal com DFP */
  dfpAno: number | null;
  /** último ITR posterior à DFP */
  itr: { ano: number; trimestre: number } | null;
  /** último informe mensal do FII (AAAA-MM-DD) */
  fiiMes: string | null;
  /** proventos defasados pela regra existente (flags/motivos da linha) */
  proventosDefasados: boolean;
  /** versão do Quadro (ISO de geradoEm) = quando o Índice foi calculado */
  versao: string | null;
  /** data de referência do cálculo (AAAA-MM-DD) */
  dataRef?: string | null;
}

function dataBr(iso: string | null): string | null {
  if (!iso) return null;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function mesCurto(iso: string): string {
  return `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
}

function isoMeioDia(iso: string | null): string | null {
  return iso ? `${iso}T12:00:00.000Z` : null;
}

/** Cotação: atrasada quando o último pregão do ativo está > 3 pregões atrás do mercado. */
export function frescorCotacao(precoData: string | null, hoje: string): FrescorBloco {
  const fonte = T.fontes.cotacao;
  if (!precoData) return { fonte, referencia: null, atualizadoEm: null, status: 'sem_dado' };
  const mercado = pregaoAnterior(hoje);
  const atraso = precoData < mercado ? distanciaEmPregoes(precoData, mercado) : 0;
  const base: FrescorBloco = {
    fonte,
    referencia: dataBr(precoData),
    atualizadoEm: isoMeioDia(precoData),
    status: atraso > PREGOES_ATRASO_COTACAO ? 'atrasado' : 'em_dia',
  };
  if (base.status === 'atrasado') {
    base.documentoEsperado = formatarTexto(T.documentos.pregao, { data: dataBr(mercado) ?? '' });
  }
  return base;
}

/** Fim do trimestre t (1–4) do ano (AAAA-MM-DD). */
function fimTrimestre(ano: number, t: number): string {
  const mes = t * 3;
  const dia = mes === 3 || mes === 12 ? 31 : 30;
  return `${ano}-${String(mes).padStart(2, '0')}-${dia}`;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Último trimestre cujo prazo (fim + 75 dias) já venceu em `hoje`. */
export function trimestreDevido(hoje: string): { ano: number; trimestre: number } {
  let ano = Number(hoje.slice(0, 4));
  let t = Math.ceil(Number(hoje.slice(5, 7)) / 3);
  for (let i = 0; i < 8; i++) {
    if (somarDias(fimTrimestre(ano, t), DIAS_ATRASO_ITR) <= hoje) return { ano, trimestre: t };
    t -= 1;
    if (t === 0) {
      t = 4;
      ano -= 1;
    }
  }
  return { ano, trimestre: t };
}

/** Fundamentos das ações: atrasado sem o ITR (ou a DFP, no 4º trimestre) devido. */
export function frescorFundamentos(
  dfpAno: number | null,
  itr: { ano: number; trimestre: number } | null,
  hoje: string,
): FrescorBloco {
  const fonte = T.fontes.fundamentos;
  if (dfpAno === null && !itr) {
    return { fonte, referencia: null, atualizadoEm: null, status: 'sem_dado' };
  }
  const recebido = Math.max(
    dfpAno !== null ? dfpAno * 10 + 4 : 0,
    itr ? itr.ano * 10 + itr.trimestre : 0,
  );
  const ano = Math.floor(recebido / 10);
  const tri = recebido % 10;
  const referencia =
    tri === 4
      ? formatarTexto(T.documentos.dfp, { ano })
      : formatarTexto(T.documentos.itr, { valor: `${tri}T${String(ano).slice(2)}` });
  const devido = trimestreDevido(hoje);
  const atrasado = recebido < devido.ano * 10 + devido.trimestre;
  const out: FrescorBloco = {
    fonte,
    referencia,
    atualizadoEm: null,
    status: atrasado ? 'atrasado' : 'em_dia',
  };
  if (atrasado) {
    out.documentoEsperado =
      devido.trimestre === 4
        ? formatarTexto(T.documentos.dfp, { ano: devido.ano })
        : formatarTexto(T.documentos.itr, {
            valor: `${devido.trimestre}T${String(devido.ano).slice(2)}`,
          });
  }
  return out;
}

/** Informe mensal do FII: atrasado com mais de 2 meses. */
export function frescorInformeFii(fiiMes: string | null, hoje: string): FrescorBloco {
  const fonte = T.fontes.fii;
  if (!fiiMes) return { fonte, referencia: null, atualizadoEm: null, status: 'sem_dado' };
  const meses =
    (Number(hoje.slice(0, 4)) - Number(fiiMes.slice(0, 4))) * 12 +
    (Number(hoje.slice(5, 7)) - Number(fiiMes.slice(5, 7)));
  const out: FrescorBloco = {
    fonte,
    referencia: mesCurto(fiiMes),
    atualizadoEm: null,
    status: meses > MESES_ATRASO_INFORME_FII ? 'atrasado' : 'em_dia',
  };
  if (out.status === 'atrasado') {
    const ano = Number(hoje.slice(0, 4));
    const mes = Number(hoje.slice(5, 7)) - MESES_ATRASO_INFORME_FII;
    const esperado =
      mes > 0
        ? `${ano}-${String(mes).padStart(2, '0')}-01`
        : `${ano - 1}-${String(12 + mes).padStart(2, '0')}-01`;
    out.documentoEsperado = formatarTexto(T.documentos.informe, { data: mesCurto(esperado) });
  }
  return out;
}

export function frescorProventos(defasados: boolean, precoData: string | null): FrescorBloco {
  return {
    fonte: T.fontes.proventos,
    referencia: dataBr(precoData),
    atualizadoEm: isoMeioDia(precoData),
    status: defasados ? 'atrasado' : precoData ? 'em_dia' : 'sem_dado',
    ...(defasados ? { documentoEsperado: T.documentos.proventos } : {}),
  };
}

export function frescorIndice(versao: string | null, dataRef?: string | null): FrescorBloco {
  const valida = versao && !Number.isNaN(Date.parse(versao)) ? versao : null;
  return {
    fonte: T.fontes.indice,
    referencia: dataBr(dataRef ?? (valida ? valida.slice(0, 10) : null)),
    atualizadoEm: valida,
    status: valida ? 'em_dia' : 'sem_dado',
  };
}

const PESO: Record<FrescorBloco['status'], number> = { atrasado: 2, sem_dado: 1, em_dia: 0 };

/** Junta camadas num selo: fontes unidas por ' · ', situação = a pior. */
export function combinarFrescor(...partes: FrescorBloco[]): FrescorBloco {
  const pior = partes.reduce((a, b) => (PESO[b.status] > PESO[a.status] ? b : a));
  const out: FrescorBloco = {
    fonte: partes.map((p) => p.fonte).join(' · '),
    referencia:
      partes
        .map((p) => p.referencia)
        .filter((r): r is string => !!r)
        .join(' · ') || null,
    atualizadoEm: partes.map((p) => p.atualizadoEm).find((a) => !!a) ?? null,
    status: pior.status,
  };
  if (pior.documentoEsperado) out.documentoEsperado = pior.documentoEsperado;
  return out;
}

/** Frescor por bloco (chave = BlocoReporte). Blocos sem menu (carteira, tese, educação) ficam fora. */
export function montarFrescorBlocos(
  e: EntradaFrescorBlocos,
): Partial<Record<BlocoReporte, FrescorBloco>> {
  const cot = frescorCotacao(e.precoData, e.hoje);
  const prov = frescorProventos(e.proventosDefasados, e.precoData);
  const indice = frescorIndice(e.versao, e.dataRef);
  if (e.classe === 'fii') {
    const inf = frescorInformeFii(e.fiiMes, e.hoje);
    return {
      cabecalho: cot,
      indice,
      criterios: indice,
      kpis: combinarFrescor(cot, inf),
      grafico: combinarFrescor(inf, cot),
      dividendos: prov,
      fundamentos: inf,
      valuation: combinarFrescor(cot, inf),
      historicos: inf,
      pares: indice,
    };
  }
  const fund = frescorFundamentos(e.dfpAno, e.itr, e.hoje);
  return {
    cabecalho: cot,
    indice,
    criterios: indice,
    kpis: combinarFrescor(cot, fund),
    grafico: combinarFrescor(fund, cot),
    dividendos: prov,
    fundamentos: fund,
    valuation: combinarFrescor(cot, fund),
    historicos: fund,
    pares: indice,
  };
}
