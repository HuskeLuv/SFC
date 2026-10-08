/**
 * ★ do Comparador (Bloco D, fatia C) — PURO. "Valor numericamente mais favorável" no critério,
 * nunca "melhor" (regras_comparador da spec + decisões 9–11).
 *
 * Candidatos: estado 'ok', número finito, SEM conferência (nem 'ocultar' nem 'selo') e aplicável.
 * A comparação é feita sobre o valor ARREDONDADO COMO EXIBIDO (formato da linha): dois valores que
 * aparecem iguais na tela empatam.
 *
 * Sem ★ quando: direção neutra ('neutro'); linha sem validação CVM ('sem_validacao_cvm', decisão
 * 10); tipos de FII misturados numa linha que depende do tipo ('tipos_diferentes'); menos de 2
 * candidatos ('menos_de_2'); empate no melhor valor ('empate').
 *
 * 'menor_positivo' (P/L): valores ≤ 0 ficam fora da disputa. 'perto_de_1' (P/VP de papel): menor
 * |v − 1|.
 */
import type { DirecaoDestaque, MotivoSemDestaque } from '@/types/analiseAtivosBlocoD';
import type { Estado, ExibicaoConferenciaTela, FormatoAnalise } from '@/types/analiseAtivosApi';

/** Casas decimais com que cada formato aparece na tela (formatarAnalise). */
export const CASAS_EXIBIDAS: Record<FormatoAnalise, number> = {
  numero: 1,
  numero2: 2,
  inteiro: 0,
  pct: 2,
  pctSinal: 1,
  pp: 1,
  multiplo: 1,
  moeda: 2,
  moedaCompacta: 2,
  moedaMi: 0,
};

/** Valor arredondado como a tela mostra (mesmas casas de formatarAnalise). */
export function arredondarComoExibido(valor: number, formato: FormatoAnalise): number {
  const f = 10 ** CASAS_EXIBIDAS[formato];
  const r = Math.round(valor * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export interface CandidatoDestaque {
  ticker: string;
  valor: Estado<number>;
  /** conferência da célula ('ocultar' ou 'selo'); qualquer uma tira do ★ */
  conferencia: ExibicaoConferenciaTela | null;
}

export interface OpcoesDestaque {
  /** decisão 10: dados de imóveis da CVM sem ★ até a validação */
  semValidacaoCvm?: boolean;
  /** P/VP com tijolo e papel juntos */
  tiposDiferentes?: boolean;
}

export interface ResultadoDestaque {
  destaque: string | null;
  motivoSemDestaque: MotivoSemDestaque | null;
}

function chave(v: number, direcao: DirecaoDestaque): number {
  if (direcao === 'perto_de_1') return Math.round(Math.abs(v - 1) * 1e9) / 1e9;
  return v;
}

export function calcularDestaque(
  candidatos: readonly CandidatoDestaque[],
  direcao: DirecaoDestaque,
  formato: FormatoAnalise,
  opts: OpcoesDestaque = {},
): ResultadoDestaque {
  const sem = (motivo: MotivoSemDestaque): ResultadoDestaque => ({
    destaque: null,
    motivoSemDestaque: motivo,
  });
  if (opts.semValidacaoCvm) return sem('sem_validacao_cvm');
  if (direcao === 'neutro') return sem('neutro');
  if (opts.tiposDiferentes) return sem('tipos_diferentes');

  const validos: Array<{ ticker: string; k: number }> = [];
  for (const c of candidatos) {
    if (c.conferencia) continue;
    if (c.valor.estado !== 'ok' || !Number.isFinite(c.valor.valor)) continue;
    const v = arredondarComoExibido(c.valor.valor, formato);
    if (direcao === 'menor_positivo' && v <= 0) continue;
    validos.push({ ticker: c.ticker, k: chave(v, direcao) });
  }
  if (validos.length < 2) return sem('menos_de_2');

  const maior = direcao === 'maior';
  const alvo = validos.reduce(
    (acc, x) => (maior ? Math.max(acc, x.k) : Math.min(acc, x.k)),
    maior ? -Infinity : Infinity,
  );
  const escolhidos = validos.filter((x) => x.k === alvo);
  if (escolhidos.length !== 1) return sem('empate');
  return { destaque: escolhidos[0].ticker, motivoSemDestaque: null };
}
