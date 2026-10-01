/**
 * Tipo do FII pela composição do ativo (regra 23, decisão 9) e régua do Índice MF (decisão 8,
 * regra 22). Funções puras, sem I/O.
 *
 * Parcelas sobre o PL (em pontos percentuais):
 * - tijolo = imóveis (Direitos_Bens_Imoveis) + SPE (ações/cotas de sociedades de atividade de FII);
 * - papel  = CRI (CRI + CRI_CRA). LCI/LCA/LH/LIG são CAIXA, não recebível (KNCR11 carrega LCI);
 * - fof    = cotas de FII.
 *
 * Parcela ausente (coluna não informada) conta como 0 da composição; PL ausente/≤ 0 ou nenhuma
 * parcela informada ⇒ 'indefinido' (nunca decidir com dado faltando como se fosse zero no PL).
 */
import { ausente, deNumero, naoSeAplica, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { FiiTipo, Regua, ScoringParams, Valor } from '@/services/analiseAtivos/tipos';

export interface ComposicaoFii {
  pl: number | null;
  imoveis: number | null;
  spe: number | null;
  cri: number | null;
  cotasFii: number | null;
}

export interface ParcelasFii {
  tijoloPct: number;
  papelPct: number;
  fofPct: number;
}

const finito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/** Parcelas sobre o PL em p.p.; null se PL ausente/≤ 0 ou se nenhuma parcela foi informada. */
export function parcelasSobrePl(m: ComposicaoFii): ParcelasFii | null {
  if (!finito(m.pl) || m.pl <= 0) return null;
  const partes = [m.imoveis, m.spe, m.cri, m.cotasFii];
  if (!partes.some(finito)) return null;
  const v = (n: number | null) => (finito(n) ? n : 0);
  return {
    tijoloPct: ((v(m.imoveis) + v(m.spe)) / m.pl) * 100,
    papelPct: (v(m.cri) / m.pl) * 100,
    fofPct: (v(m.cotasFii) / m.pl) * 100,
  };
}

/**
 * Se ALGUMA parcela ≥ limiar ⇒ vence a MAIOR delas (fundo alavancado pode ter duas ≥ 50%: nunca
 * decidir pela ordem dos ifs). Nenhuma ≥ limiar e soma das três ≥ limiar ⇒ híbrido; senão
 * indefinido. PL ≤ 0/ausente ⇒ indefinido.
 */
export function tipoPorComposicao(m: ComposicaoFii, p: ScoringParams): FiiTipo {
  const parcelas = parcelasSobrePl(m);
  if (!parcelas) return 'indefinido';
  const limiar = p.fiiTipo.limiarComposicaoPct;
  const candidatos: Array<[FiiTipo, number]> = [
    ['tijolo', parcelas.tijoloPct],
    ['papel', parcelas.papelPct],
    ['fof', parcelas.fofPct],
  ];
  const acima = candidatos.filter(([, v]) => v >= limiar);
  if (acima.length > 0) {
    // maior parcela vence; empate exato mantém a ordem tijolo > papel > fof (estável)
    return acima.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }
  const soma = parcelas.tijoloPct + parcelas.papelPct + parcelas.fofPct;
  return soma >= limiar ? 'hibrido' : 'indefinido';
}

/**
 * Régua do Índice MF a partir do tipo vigente. Híbrido corrigido: imóveis+SPE ≥ CRI ⇒ fii_tijolo,
 * senão fii_papel (empate pelo params). FoF ⇒ fora_do_indice (decisão 8). Indefinido ⇒ régua do
 * params (tijolo) + incompleto. PL ≤ 0 ⇒ fora_do_indice (regra 22).
 */
export function reguaFii(
  tipo: FiiTipo,
  m: { imoveis: number | null; spe: number | null; cri: number | null; pl: number | null },
  p: ScoringParams,
): { regua: Regua; incompleto: boolean } {
  // PL ≤ 0 ⇒ fora do Índice; PL ausente não é PL ≤ 0: fica na régua do tipo, mas incompleto
  if (finito(m.pl) && m.pl <= 0) return { regua: 'fora_do_indice', incompleto: true };
  const incompleto = !finito(m.pl);
  switch (tipo) {
    case 'tijolo':
      return { regua: 'fii_tijolo', incompleto };
    case 'papel':
      return { regua: 'fii_papel', incompleto };
    case 'fof':
      return { regua: 'fora_do_indice', incompleto: false };
    case 'hibrido': {
      const tijolo = (finito(m.imoveis) ? m.imoveis : 0) + (finito(m.spe) ? m.spe : 0);
      const cri = finito(m.cri) ? m.cri : 0;
      if (tijolo > cri) return { regua: 'fii_tijolo', incompleto };
      if (cri > tijolo) return { regua: 'fii_papel', incompleto };
      return { regua: p.fii.hibrido.empate, incompleto };
    }
    case 'indefinido':
      return { regua: p.fii.indefinido.regua, incompleto: p.fii.indefinido.marcarIncompleto };
  }
}

/**
 * "Obrigações/PL" (decisão 7 — nunca "LTV" nem "alavancagem"): (passivo total − rendimentos a
 * distribuir) ÷ PL × 100. PL ≤ 0 ⇒ não se aplica (base não positiva); passivo ou PL ausente ⇒
 * ausente. Rendimentos a distribuir ausente conta 0 (é uma dedução).
 */
export function obrigacoesSobrePl(m: {
  passivoTotal: number | null;
  rendDistribuir: number | null;
  pl: number | null;
}): Valor<number> {
  const pl = deNumero(m.pl);
  const passivo = deNumero(m.passivoTotal);
  if (pl.estado !== 'ok') return pl;
  if (pl.valor <= 0) return naoSeAplica('base_nao_positiva', 'PL ≤ 0');
  if (passivo.estado !== 'ok') return passivo;
  const rend = finito(m.rendDistribuir) ? m.rendDistribuir : 0;
  const pct = ((passivo.valor - rend) / pl.valor) * 100;
  return Number.isFinite(pct) ? ok(pct) : ausente('sem_dado_fonte');
}
