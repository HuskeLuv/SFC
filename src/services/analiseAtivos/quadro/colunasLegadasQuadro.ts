/**
 * Colunas do Quadro que vinham do AssetScore e ainda têm leitor (A3 / D6-a, fatia F1). Função PURA
 * sobre o que o gerarQuadro já carrega (múltiplos atuais, resumo de cotação, informe mensal do FII,
 * lucro FY e emissores): o Quadro deixa de ler asset_scores e grava os MESMOS valores que o job
 * 'scores' gravava nessas colunas.
 *
 * Quem "teria score" (temScoreLegado), como no recalcularScores:
 * - ação: a empresa tem >= 1 ticker com AssetQuoteResumo; todos os tickers da empresa (inclusive o
 *   sem resumo, como a unit sem score próprio) recebem as colunas da empresa, calculadas no ticker de
 *   referência = o de maior volumeMedio21 com resumo (empate pelo symbol; decisão 13);
 * - FII: tem resumo e (conferido || !params.fii.exigirTickerConferido).
 *
 * Colunas:
 * - regua: ação 'acao_financeira' | 'acao' (EmissorInfo.ehFinanceira); FII = a régua do informe mais
 *   recente (reguaDoFii: PL <= 0, FoF ou reguaVigente 'fora_do_indice' => 'fora_do_indice';
 *   reguaVigente tijolo/papel => ela; senão params.fii.indefinido.regua). Sem score => null.
 * - fiiTipo: FII com score = tipoVigente do informe SEM a máscara do ticker não conferido (era o
 *   AssetScore.fiiTipo); os demais ficam com o fallback do montarLinhasQuadro (informe mascarado).
 * - tickerReferencia: o ticker de referência da empresa (ação); FII = null.
 * - motivosIncompleto: só os 2 códigos legados de proventos que os leitores usam
 *   (proventosEmConferencia/regraLegadaProventos): 'div:em_conferencia' e 'div:fonte_defasada'. Os
 *   outros motivos do Índice ('div:sem_dado_fonte', 'lucro:...', 'regua:sem_informe'...) não têm
 *   leitor e deixam de ser gravados. Regra do componente de DY (C_div) do Índice, com as flags da
 *   referência em asset_multiples_current (gravadas pelo MESMO job):
 *     DY n/a => nenhum código;
 *     'conf:' de GRUPOS_QUE_TIRAM_DY na referência (escopo ticker: só ela contamina) => em_conferencia;
 *     DY ok e QUALQUER ticker da empresa com resumo com 'proventos_em_conferencia_*' => em_conferencia;
 *     DY ausente e a referência com 'proventos_defasados_*' => fonte_defasada.
 *   FII: a mesma regra com as próprias flags, só com régua tijolo/papel (fora do Índice => n/a).
 * - componentesZeroRegra: ação com score e lucro do último FY (sem o individual da controladora_zero)
 *   <= 0 => ['lucro:prejuizo', 'preco:prejuizo'] (o leitor só olha ':prejuizo'); senão [].
 * - paramsVersion: asset_multiples_current.paramsVersion da referência (ação) / do próprio FII.
 *
 * O componente C_div está ativo com a métrica dy12mPct em todas as versões do ScoringParams (teste).
 */
import type { EntradaQuadro } from '@/services/analiseAtivos/quadro/montarLinhasQuadro';
import {
  parseFlagConf,
  PREFIXO_FLAG_EM_CONFERENCIA,
  type GrupoConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

/** Grupos 'conf:' (fora 'proventos', que é o legado) que tiram o DY do Índice: ver o teste. */
export const GRUPOS_QUE_TIRAM_DY: readonly GrupoConferencia[] = ['preco_base', 'preco_esporadico'];

export const MOTIVO_DIV_EM_CONFERENCIA = 'div:em_conferencia';
export const MOTIVO_DIV_FONTE_DEFASADA = 'div:fonte_defasada';
const PREFIXO_DEFASADOS = 'proventos_defasados_';
const ZERO_REGRA_PREJUIZO = ['lucro:prejuizo', 'preco:prejuizo'];

export interface ColunasLegadas {
  /** a linha teria AssetScore (só interno: a coluna temScore passa a false) */
  temScoreLegado: boolean;
  regua: string | null;
  tickerReferencia: string | null;
  /** só FII com score; undefined = o montarLinhasQuadro usa o informe mascarado */
  fiiTipo?: string | null;
  motivosIncompleto: string[];
  componentesZeroRegra: string[];
  paramsVersion: number | null;
}

type Multiplos = EntradaQuadro['multiplos'][number];

const SEM_SCORE: ColunasLegadas = {
  temScoreLegado: false,
  regua: null,
  tickerReferencia: null,
  motivosIncompleto: [],
  componentesZeroRegra: [],
  paramsVersion: null,
};

function motivoDoDy(
  ref: Multiplos | undefined,
  flagsDaEmpresa: readonly (readonly string[])[],
): string[] {
  const naoSeAplica = ref?.naoSeAplica ?? [];
  if (naoSeAplica.includes('dy12mPct')) return [];
  const flagsRef = ref?.flags ?? [];
  const confNaRef = flagsRef.some((f) => {
    const c = parseFlagConf(f);
    return c !== null && GRUPOS_QUE_TIRAM_DY.includes(c.grupo);
  });
  if (confNaRef) return [MOTIVO_DIV_EM_CONFERENCIA];
  const dyOk = typeof ref?.dy12mPct === 'number' && Number.isFinite(ref.dy12mPct);
  if (dyOk) {
    const emConf = flagsDaEmpresa.some((fs) =>
      fs.some((f) => f.startsWith(PREFIXO_FLAG_EM_CONFERENCIA)),
    );
    return emConf ? [MOTIVO_DIV_EM_CONFERENCIA] : [];
  }
  return flagsRef.some((f) => f.startsWith(PREFIXO_DEFASADOS)) ? [MOTIVO_DIV_FONTE_DEFASADA] : [];
}

/** reguaDoFii do recalcularScores, sobre a linha mais recente de fii_monthly. */
export function reguaLegadaDoFii(
  mes: { pl: number | null; tipoVigente: string | null; reguaVigente?: string | null } | undefined,
  p: ScoringParams,
): string {
  if (mes?.pl !== null && mes?.pl !== undefined && mes.pl <= 0) return 'fora_do_indice';
  if (mes?.tipoVigente === 'fof' || mes?.reguaVigente === 'fora_do_indice') return 'fora_do_indice';
  if (mes?.reguaVigente === 'fii_tijolo' || mes?.reguaVigente === 'fii_papel') {
    return mes.reguaVigente;
  }
  return p.fii.indefinido.regua;
}

export function colunasLegadasPorSimbolo(
  e: EntradaQuadro,
  p: ScoringParams,
): Map<string, ColunasLegadas> {
  const out = new Map<string, ColunasLegadas>();
  const resumoPor = new Map(e.resumos.map((r) => [r.symbol, r]));
  const multPor = new Map(e.multiplos.map((m) => [m.symbol, m]));
  const financeira = new Map((e.emissores ?? []).map((x) => [x.cnpj, x.ehFinanceira]));

  // último FY por emissor (umFyPorAno: maior anoFiscal)
  const ultimoFy = new Map<string, EntradaQuadro['lucrosFy'][number]>();
  for (const l of e.lucrosFy) {
    const atual = ultimoFy.get(l.cnpj);
    if (!atual || l.anoFiscal > atual.anoFiscal) ultimoFy.set(l.cnpj, l);
  }

  const porCnpj = new Map<string, string[]>();
  for (const a of e.acoes) porCnpj.set(a.cnpj, [...(porCnpj.get(a.cnpj) ?? []), a.symbol]);
  for (const [cnpj, symbols] of porCnpj) {
    const comResumo = symbols.filter((s) => resumoPor.has(s));
    if (comResumo.length === 0) {
      for (const s of symbols) out.set(s, SEM_SCORE);
      continue;
    }
    const ref = [...comResumo].sort(
      (a, b) =>
        resumoPor.get(b)!.volumeMedio21 - resumoPor.get(a)!.volumeMedio21 || a.localeCompare(b),
    )[0];
    const multRef = multPor.get(ref);
    const fy = ultimoFy.get(cnpj);
    const lucroFy = fy
      ? fy.lucroSemIndividual !== undefined
        ? fy.lucroSemIndividual
        : fy.lucro
      : null;
    const colunas: ColunasLegadas = {
      temScoreLegado: true,
      regua: financeira.get(cnpj) ? 'acao_financeira' : 'acao',
      tickerReferencia: ref,
      motivosIncompleto: motivoDoDy(
        multRef,
        comResumo.map((s) => multPor.get(s)?.flags ?? []),
      ),
      componentesZeroRegra: lucroFy !== null && lucroFy <= 0 ? [...ZERO_REGRA_PREJUIZO] : [],
      paramsVersion: multRef?.paramsVersion ?? null,
    };
    for (const s of symbols) out.set(s, colunas);
  }

  const mensalPor = new Map(e.fiiMensal.map((m) => [m.cnpj, m]));
  for (const f of e.fiis) {
    const conferido = f.conferido !== false;
    if (!resumoPor.has(f.symbol) || (!conferido && p.fii.exigirTickerConferido)) {
      out.set(f.symbol, SEM_SCORE);
      continue;
    }
    const mes = mensalPor.get(f.cnpj);
    const regua = reguaLegadaDoFii(mes, p);
    const mult = multPor.get(f.symbol);
    out.set(f.symbol, {
      temScoreLegado: true,
      regua,
      tickerReferencia: null,
      fiiTipo: mes?.tipoVigente ?? null,
      motivosIncompleto:
        regua === 'fii_tijolo' || regua === 'fii_papel'
          ? motivoDoDy(mult, [mult?.flags ?? []])
          : [],
      componentesZeroRegra: [],
      paramsVersion: mult?.paramsVersion ?? null,
    });
  }
  return out;
}
