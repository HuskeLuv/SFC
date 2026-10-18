/**
 * Saneamento da vacância física trimestral da CVM (FiiQuarterly.vacanciaFisicaCvmPct). Função pura.
 *
 * Problema (backtest 18/10/2026, item A4): alguns gestores passam a informar a OCUPAÇÃO no campo de
 * vacância do Informe Trimestral. HSML11 a partir do 4T25: 2,7% → 91,4% / 90,1% / 90,6% com a receita
 * de aluguel estável (R$ 55 mi → 56 mi → 70 mi → 55 mi) — o critério "Vacância ≤ 10%" virava "não
 * atende" nas janelas de 3 e 5 anos. Mesmo padrão em XPML11 1T26 (4,0% → 91,8%), AJFI11 4T24
 * (6,7% → 93,6%), APXM11, LASC11, CPOF11 (0–3% ↔ 100%) e BROF11 1T26 (9,6% → 72,6%).
 *
 * Regra: percorre a série em ordem; a REFERÊNCIA é o último valor aceito. Um trimestre a mais de
 * `vacanciaSaltoPp` (30 p.p.) da referência abre um EPISÓDIO de conferência:
 *  - 'vacancia_ocupacao' quando o valor é ~ o complemento da referência (|v + ref − 100| ≤
 *    `vacanciaComplementarTolPp`, 15 p.p.): o gestor trocou vacância por ocupação;
 *  - 'vacancia_salto' nos demais saltos bruscos.
 * O episódio é aceito (a vacância mudou de verdade, a referência passa a ser o valor novo e os
 * trimestres do episódio deixam de ficar em conferência) quando:
 *  - SUBIDA confirmada pela receita de aluguel: receita do trimestre ≤ mediana da receita dos
 *    últimos 4 trimestres aceitos × (1 − `vacanciaReceitaFator` × salto/100) — imóvel que esvazia
 *    perde aluguel (CTXT11 2021, FAMB11, PRSV11, RBOP11 2023: receita cai a < 30%);
 *  - ou o novo patamar dura `vacanciaPersistenciaTrimestres` (3) trimestres seguidos, MENOS numa
 *    subida de 'vacancia_ocupacao' (a troca persiste enquanto o gestor mantiver o formato: HSML11
 *    está há 3 trimestres em ~91%). Descida (FII que locou) e salto não complementar aceitam pela
 *    persistência (JSRE11, BTLG11 2019, FTCE11);
 *  - ou a curadoria liberou o episódio (regra + chave = mês do 1º trimestre do episódio).
 * Volta para perto da referência = fim do episódio (os trimestres do meio continuam em conferência).
 *
 * Quem usa: o critério de vacância dos Filtros (seriesFii.vacanciaTrimestralFii: trimestre em
 * conferência = sem dado, nunca "não atende"), o motor de sanidade (regras/calculo/sanidade/fii:
 * grupo 'fii_vacancia' no trimestre mais recente ⇒ Quadro/página '—' + chip e caso de curadoria) e o
 * Essencial (linha do ano com o 4º trimestre em conferência).
 */
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

export const REGRAS_VACANCIA = ['vacancia_ocupacao', 'vacancia_salto'] as const;
export type RegraVacancia = (typeof REGRAS_VACANCIA)[number];

export type ParamsVacancia = Pick<
  ScoringParams['sanidade']['fii'],
  | 'vacanciaSaltoPp'
  | 'vacanciaComplementarTolPp'
  | 'vacanciaReceitaFator'
  | 'vacanciaPersistenciaTrimestres'
>;

export interface TrimestreVacancia {
  /** último dia do trimestre (AAAA-MM-DD) */
  refQuarter: string;
  /** vacância física em p.p.; null/ausente = sem dado (papel, sem imóvel) — fica fora da série */
  vacanciaPct: number | null | undefined;
  /** receita de aluguel do trimestre (R$); confirma uma subida real */
  receitaAluguel?: number | null;
}

export interface VacanciaEmConferencia {
  refQuarter: string;
  regra: RegraVacancia;
  /** chave do episódio = mês (AAAA-MM) do 1º trimestre em conferência; chaveia caso e liberação */
  chave: string;
  referenciaPct: number;
  valorPct: number;
}

/** Liberação da curadoria por (regra, chave) do episódio. */
export type VacanciaLiberada = (regra: RegraVacancia, chave: string) => boolean;

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

function mediana(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface ItemEpisodio {
  refQuarter: string;
  regra: RegraVacancia;
  subida: boolean;
  valor: number;
  receita: number | null;
}

/**
 * Trimestres com a vacância em conferência (chave = refQuarter). Série vazia ou de 1 ponto = nada.
 */
export function conferirVacancia(
  trimestres: readonly TrimestreVacancia[],
  p: ParamsVacancia,
  liberada?: VacanciaLiberada,
): Map<string, VacanciaEmConferencia> {
  const out = new Map<string, VacanciaEmConferencia>();
  const serie = trimestres
    .filter((t) => finito(t.vacanciaPct))
    .sort((a, b) => a.refQuarter.localeCompare(b.refQuarter));
  let ref: number | null = null;
  const receitasAceitas: Array<number | null> = [];
  let episodio: ItemEpisodio[] = [];

  const aceitar = (valor: number, receitas: Array<number | null>) => {
    ref = valor;
    receitasAceitas.push(...receitas);
    episodio = [];
  };

  for (const t of serie) {
    const v = t.vacanciaPct as number;
    const receita = finito(t.receitaAluguel) ? t.receitaAluguel : null;
    if (ref === null) {
      aceitar(v, [receita]);
      continue;
    }
    const salto: number = v - ref;
    if (Math.abs(salto) < p.vacanciaSaltoPp) {
      aceitar(v, [receita]);
      continue;
    }
    const regra: RegraVacancia =
      Math.abs(v + ref - 100) <= p.vacanciaComplementarTolPp
        ? 'vacancia_ocupacao'
        : 'vacancia_salto';
    episodio.push({ refQuarter: t.refQuarter, regra, subida: salto > 0, valor: v, receita });
    const inicio = episodio[0];
    const chave = inicio.refQuarter.slice(0, 7);

    const recRef = mediana(receitasAceitas.slice(-4).filter(finito));
    const confirmadoPelaReceita =
      salto > 0 &&
      receita !== null &&
      recRef !== null &&
      recRef > 0 &&
      receita <= recRef * (1 - (p.vacanciaReceitaFator * salto) / 100);
    const confirmadoPelaPersistencia =
      episodio.length >= p.vacanciaPersistenciaTrimestres &&
      episodio.every((e) => !e.subida || e.regra === 'vacancia_salto');
    if (
      confirmadoPelaReceita ||
      confirmadoPelaPersistencia ||
      (liberada?.(inicio.regra, chave) ?? false)
    ) {
      for (const e of episodio) out.delete(e.refQuarter);
      aceitar(
        v,
        episodio.map((e) => e.receita),
      );
      continue;
    }
    out.set(t.refQuarter, {
      refQuarter: t.refQuarter,
      regra: inicio.regra,
      chave,
      referenciaPct: ref,
      valorPct: v,
    });
  }
  return out;
}

/** Liberações 'regra|chave' (sem o símbolo) → função de consulta para conferirVacancia. */
export function liberadaPor(chaves: Iterable<string> | undefined): VacanciaLiberada | undefined {
  if (!chaves) return undefined;
  const set = new Set(chaves);
  if (set.size === 0) return undefined;
  return (regra, chave) => set.has(`${regra}|${chave}`);
}
