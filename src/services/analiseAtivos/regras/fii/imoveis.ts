/**
 * Agregação dos imóveis do Informe Trimestral de FII (regra 24) e prazo médio aproximado dos
 * contratos. Funções puras.
 *
 * - Só a classe "Imóveis para renda acabados" conta como imóvel de renda.
 * - Vacância FÍSICA ponderada pela área (a CVM informa fração; aqui já chega em p.p.). Rótulo
 *   "fonte CVM · pode diferir do relatório do gestor" (decisão 6): fora de critério até validação.
 * - Inadimplência ponderada pelo % da receita; Σ %receita > somaPctReceitaMax (105) ⇒ escala
 *   errada no fundo todo ⇒ inadimplência AUSENTE (CXCO11 Σ = 1.000%).
 * - Área de um imóvel > areaMaxAblM2 (500 mil m²) ⇒ flag area_nao_abl (é terreno, não ABL).
 * - FII de papel: vacância "não se aplica" (RECR11 tem 1 imóvel retomado 100% vago).
 */
import { ausente, naoSeAplica, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { FiiTipo, ScoringParams, Valor } from '@/services/analiseAtivos/tipos';

/** Linha do CSV `imovel` já convertida: percentuais em p.p. (fração da CVM × 100). */
export interface ImovelTrimestral {
  classe: string;
  area: number | null;
  vacanciaPct: number | null;
  inadimplenciaPct: number | null;
  receitaPct: number | null;
}

export interface AgregadoImoveis {
  nImoveisRenda: number;
  nImoveisOutros: number;
  areaM2: number | null;
  areaMaiorImovelM2: number | null;
  vacanciaFisicaCvmPct: Valor<number>;
  inadimplenciaCvmPct: Valor<number>;
  somaPctReceita: number | null;
  flags: string[];
}

const RE_RENDA_ACABADO = /renda\s+acabados?/i;
const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export function agregarImoveis(
  linhas: ImovelTrimestral[],
  p: ScoringParams,
  ctx: { tipoVigente?: FiiTipo | null } = {},
): AgregadoImoveis {
  const s = p.sanidade.fii;
  const flags: string[] = [];
  let nRenda = 0;
  let nOutros = 0;
  let area = 0;
  let maiorArea: number | null = null;
  let areaComVac = 0;
  let areaVaga = 0;
  let pesoInad = 0;
  let inadPond = 0;
  let somaReceita: number | null = null;
  let vacForaDeEscala = false;

  for (const l of linhas) {
    if (finito(l.receitaPct)) somaReceita = (somaReceita ?? 0) + l.receitaPct;
    if (!RE_RENDA_ACABADO.test(l.classe)) {
      nOutros++;
      continue;
    }
    nRenda++;
    const a = finito(l.area) && l.area > 0 ? l.area : 0;
    if (a > 0) {
      area += a;
      maiorArea = Math.max(maiorArea ?? 0, a);
    }
    if (finito(l.vacanciaPct)) {
      if (l.vacanciaPct > 100 || l.vacanciaPct < 0) vacForaDeEscala = true;
      else if (a > 0) {
        areaComVac += a;
        areaVaga += a * l.vacanciaPct;
      }
    }
    if (
      finito(l.receitaPct) &&
      l.receitaPct > 0 &&
      finito(l.inadimplenciaPct) &&
      l.inadimplenciaPct >= 0 &&
      l.inadimplenciaPct <= 100
    ) {
      pesoInad += l.receitaPct;
      inadPond += l.receitaPct * l.inadimplenciaPct;
    }
  }

  if (vacForaDeEscala) flags.push('vacancia_fora_de_escala');
  if (maiorArea !== null && maiorArea > s.areaMaxAblM2) flags.push('area_nao_abl');

  let vacancia: Valor<number>;
  if (ctx.tipoVigente === 'papel') {
    vacancia = naoSeAplica('papel_sem_imoveis', 'vacância não entra em FII de papel');
  } else if (areaComVac > 0) {
    vacancia = ok(areaVaga / areaComVac);
  } else {
    vacancia = ausente('sem_dado_fonte', nRenda === 0 ? 'sem imóvel de renda' : 'sem área');
  }

  let inadimplencia: Valor<number>;
  if (somaReceita !== null && somaReceita > s.somaPctReceitaMax) {
    flags.push('soma_pct_receita_invalida');
    inadimplencia = ausente('outro', `Σ %receita = ${somaReceita.toFixed(1)}`);
  } else if (pesoInad > 0) {
    inadimplencia = ok(inadPond / pesoInad);
  } else {
    inadimplencia = ausente('sem_dado_fonte');
  }

  return {
    nImoveisRenda: nRenda,
    nImoveisOutros: nOutros,
    areaM2: area > 0 ? area : null,
    areaMaiorImovelM2: maiorArea,
    vacanciaFisicaCvmPct: vacancia,
    inadimplenciaCvmPct: inadimplencia,
    somaPctReceita: somaReceita,
    flags,
  };
}

/** Faixas de vencimento da receita (trimestral `complemento`) → prazo médio em anos. */
export const FAIXAS_VENCIMENTO: ReadonlyArray<readonly [string, number]> = [
  ['Ate_3Meses', 0.125],
  ['3a6Meses', 0.375],
  ['6a9Meses', 0.625],
  ['9a12Meses', 0.875],
  ['12a15Meses', 1.125],
  ['15a18Meses', 1.375],
  ['18a21Meses', 1.625],
  ['21a24Meses', 1.875],
  ['24a27Meses', 2.125],
  ['27a30Meses', 2.375],
  ['30a33Meses', 2.625],
  ['33a36Meses', 2.875],
  ['Acima_36Meses', 5], // premissa: 5 anos (balde aberto; é só aproximação)
];
const FAIXAS_ATE_12M = ['Ate_3Meses', '3a6Meses', '6a9Meses', '9a12Meses'];

/**
 * Prazo médio aproximado dos contratos, ponderado pelo % da receita em cada faixa (a faixa
 * "Indeterminado" fica fora). Soma das faixas ≈ 0 ⇒ tudo null. Percentuais em p.p. da soma.
 */
export function prazoMedioAproximado(faixas: Record<string, number | null>): {
  prazoMedioAnos: number | null;
  vencAte12mPct: number | null;
  vencAcima36mPct: number | null;
} {
  let soma = 0;
  let pond = 0;
  for (const [fx, anos] of FAIXAS_VENCIMENTO) {
    const v = faixas[fx];
    if (!finito(v) || v < 0) continue;
    soma += v;
    pond += v * anos;
  }
  if (soma <= 1e-9) return { prazoMedioAnos: null, vencAte12mPct: null, vencAcima36mPct: null };
  const ate12 = FAIXAS_ATE_12M.reduce((a, fx) => a + (finito(faixas[fx]) ? faixas[fx]! : 0), 0);
  const acima36 = finito(faixas.Acima_36Meses) ? faixas.Acima_36Meses : 0;
  return {
    prazoMedioAnos: pond / soma,
    vencAte12mPct: (ate12 / soma) * 100,
    vencAcima36mPct: (acima36 / soma) * 100,
  };
}
