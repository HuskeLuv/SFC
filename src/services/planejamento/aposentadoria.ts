/**
 * Simulador de Aposentadoria — helpers puros de cálculo.
 *
 * Portado do protótipo "Planejamento completo" (HTML), preservando a
 * matemática original. Duas dimensões coexistem:
 *
 *  1. PROJEÇÃO (termos reais, R$ de hoje) — `calc()`. Acumula patrimônio até a
 *     aposentadoria com a taxa real de acumulação, depois projeta 3 cenários de
 *     saque (preservando herança / consumindo até a expectativa de vida /
 *     renda desejada) com a taxa real de aposentadoria (mais conservadora).
 *
 *  2. TRAJETÓRIA (termos nominais) — `planTraj()` / `revisedTraj()`. Usada nas
 *     abas de Acompanhamento e Evolução pra comparar planejado vs realizado em
 *     valores nominais (aporte cresce com a inflação).
 *
 * Sem I/O. Todas as funções recebem o estado explicitamente.
 */

export type EventoTipo = 'aporte' | 'resgate';

export interface AposentadoriaEvento {
  tipo: EventoTipo;
  idade: number;
  valor: number; // R$ de hoje
}

/** Parâmetros do plano (espelha o estado único do protótipo). */
export interface AposentadoriaPlanoInput {
  idade: number;
  apos: number;
  vida: number;
  rentNom: number; // rentabilidade nominal a.a. (%)
  inflacao: number; // inflação esperada a.a. (%)
  rentNomRetiro: number | null; // taxa nominal na aposentadoria (null = igual à acumulação)
  patrimonio: number;
  aporteM: number;
  renda: number;
  trackStartMonth: number; // 1-12
  trackStartYear: number;
  eventos: AposentadoriaEvento[];
}

/** Registro mensal de acompanhamento. */
export interface AposentadoriaEntry {
  off: number; // mês do plano (1 = primeiro mês após o início)
  year: number;
  month: number; // 1-12
  aporteReal: number;
  patFinal: number;
}

// ── Taxas ───────────────────────────────────────────────────────────────

/** Taxa real a.a. de acumulação (Fisher): (1+nom)/(1+inf) - 1. */
export function getRealAA(s: AposentadoriaPlanoInput): number {
  return (1 + s.rentNom / 100) / (1 + s.inflacao / 100) - 1;
}

/** Taxa real mensal de acumulação. */
export function getRealM(s: AposentadoriaPlanoInput): number {
  return Math.pow(1 + getRealAA(s), 1 / 12) - 1;
}

/** Taxa nominal a.a. usada na fase de saque (cai pra acumulação se não definida). */
export function getRetiroNom(s: AposentadoriaPlanoInput): number {
  return s.rentNomRetiro !== null ? s.rentNomRetiro : s.rentNom;
}

/** Taxa real a.a. na aposentadoria. */
export function getRetiroRealAA(s: AposentadoriaPlanoInput): number {
  return (1 + getRetiroNom(s) / 100) / (1 + s.inflacao / 100) - 1;
}

/** Taxa real mensal na aposentadoria. */
export function getRetiroRealM(s: AposentadoriaPlanoInput): number {
  return Math.pow(1 + getRetiroRealAA(s), 1 / 12) - 1;
}

/** Taxa nominal mensal de acumulação (pra tracking). */
export function nomM(s: AposentadoriaPlanoInput): number {
  return Math.pow(1 + s.rentNom / 100, 1 / 12) - 1;
}

/** Inflação mensal. */
export function infM(s: AposentadoriaPlanoInput): number {
  return Math.pow(1 + s.inflacao / 100, 1 / 12) - 1;
}

/**
 * Sugere a taxa nominal de aposentadoria como 80% da taxa real de acumulação,
 * re-expressa em nominal (padrão conservador estilo Nord). Arredonda pra 0,5.
 */
export function conservadora80(s: AposentadoriaPlanoInput): number {
  const rRealAcc = (1 + s.rentNom / 100) / (1 + s.inflacao / 100) - 1;
  const rReal80 = rRealAcc * 0.8;
  const rNom80 = ((1 + rReal80) * (1 + s.inflacao / 100) - 1) * 100;
  return Math.round(rNom80 * 2) / 2;
}

// ── Eventos pontuais → mapa offset(mês) → delta(R$) ──────────────────────

function buildEventMap(s: AposentadoriaPlanoInput): Record<number, number> {
  const eMap: Record<number, number> = {};
  s.eventos.forEach((e) => {
    const m = Math.round((e.idade - s.idade) * 12);
    if (m >= 0) eMap[m] = (eMap[m] || 0) + (e.tipo === 'aporte' ? e.valor : -e.valor);
  });
  return eMap;
}

// ── Projeção (termos reais) ──────────────────────────────────────────────

export interface ProjecaoResult {
  accAges: number[];
  accVals: number[];
  postAges: number[];
  presVals: number[];
  consVals: number[];
  desVals: number[];
  Pr: number; // patrimônio na aposentadoria (R$ de hoje)
  sacPres: number; // saque mensal preservando o patrimônio
  sacCons: number; // saque mensal consumindo até a expectativa de vida
  idadeAcaba: number; // idade em que a renda desejada esgota o patrimônio (Infinity = nunca)
  rM: number; // taxa real mensal de acumulação
  rMR: number; // taxa real mensal de aposentadoria
  isNow: boolean; // já está aposentado (apos <= idade)
}

/**
 * Projeção completa em termos reais. Retorna `null` quando a expectativa de
 * vida não é maior que a idade de aposentadoria (cenário inválido).
 */
export function calc(s: AposentadoriaPlanoInput): ProjecaoResult | null {
  if (s.vida <= s.apos) return null;
  const rM = getRealM(s);
  const retM = Math.max(0, Math.round((s.apos - s.idade) * 12));
  const lifeM = (s.vida - s.apos) * 12;
  const isNow = s.apos <= s.idade;
  const eMap = buildEventMap(s);

  let p = s.patrimonio;
  const accAges = [isNow ? s.apos : s.idade];
  const accVals = [p];
  for (let m = 1; m <= retM; m++) {
    if (eMap[m]) p = Math.max(0, p + eMap[m]);
    p = p * (1 + rM) + s.aporteM;
    p = Math.max(0, p);
    if (m % 12 === 0) {
      accAges.push(s.idade + m / 12);
      accVals.push(p);
    }
  }
  const Pr = p;

  // Fase de saque usa a taxa de aposentadoria (separada, mais conservadora).
  const rMR = getRetiroRealM(s);
  const sacPres = rMR > 1e-12 ? Pr * rMR : 0;
  let sacCons = 0;
  if (lifeM > 0 && Pr > 0) {
    sacCons = rMR > 1e-12 ? (Pr * rMR) / (1 - Math.pow(1 + rMR, -lifeM)) : Pr / lifeM;
  }

  const rdM = s.renda;
  let idadeAcaba = Infinity;
  if (rdM > 0 && Pr > 0) {
    if (rdM <= sacPres + 0.005) {
      idadeAcaba = Infinity;
    } else if (rMR > 1e-12) {
      const ratio = (Pr * rMR) / rdM;
      if (ratio >= 1) {
        idadeAcaba = Infinity;
      } else {
        const n = -Math.log(1 - ratio) / Math.log(1 + rMR);
        idadeAcaba = isFinite(n) && n > 0 ? s.apos + n / 12 : s.apos;
      }
    } else {
      idadeAcaba = s.apos + Pr / rdM / 12;
    }
  }

  const maxAge = Math.min(
    105,
    Math.max(
      s.vida + 3,
      isFinite(idadeAcaba) ? Math.ceil(idadeAcaba) + 3 : s.vida + 3,
      s.apos + 10,
    ),
  );

  const postAges = [s.apos];
  const presVals = [Pr];
  const consVals = [Pr];
  const desVals = [Pr];
  let pP = Pr;
  let pC = Pr;
  let pD = Pr;
  for (let age = s.apos + 1; age <= maxAge; age++) {
    for (let m = 0; m < 12; m++) {
      pP = pP * (1 + rMR) - sacPres;
      pC = pC * (1 + rMR) - sacCons;
      pD = pD * (1 + rMR) - rdM;
    }
    pP = Math.max(0, pP);
    pC = Math.max(0, pC);
    pD = Math.max(0, pD);
    const am = Math.round((age - s.idade) * 12);
    if (eMap[am]) {
      pP = Math.max(0, pP + eMap[am]);
      pC = Math.max(0, pC + eMap[am]);
      pD = Math.max(0, pD + eMap[am]);
    }
    postAges.push(age);
    presVals.push(pP);
    consVals.push(pC);
    desVals.push(pD);
  }

  return {
    accAges,
    accVals,
    postAges,
    presVals,
    consVals,
    desVals,
    Pr,
    sacPres,
    sacCons,
    idadeAcaba,
    rM,
    rMR,
    isNow,
  };
}

// ── Trajetória nominal (acompanhamento / evolução) ───────────────────────

export interface PlanTrajResult {
  /** Patrimônio nominal planejado por mês (índice = offset). */
  T: number[];
  /** Aporte nominal planejado por mês (cresce com a inflação). */
  C: number[];
  /** Meses até a aposentadoria. */
  retM: number;
  /** Mapa de eventos pontuais (offset → delta R$). */
  eMap: Record<number, number>;
}

/**
 * Trajetória planejada em termos nominais. Estende 60 meses além da
 * aposentadoria pra dar folga nos gráficos de evolução.
 */
export function planTraj(s: AposentadoriaPlanoInput): PlanTrajResult {
  const rN = nomM(s);
  const rI = infM(s);
  const retM = Math.max(0, (s.apos - s.idade) * 12);
  const eMap = buildEventMap(s);
  const T = [s.patrimonio];
  const C = [0];
  let P = s.patrimonio;
  for (let m = 1; m <= retM + 60; m++) {
    if (eMap[m]) P = Math.max(0, P + eMap[m]);
    const cN = s.aporteM * Math.pow(1 + rI, m - 1);
    P = P * (1 + rN) + cN;
    P = Math.max(0, P);
    T.push(P);
    C.push(cN);
  }
  return { T, C, retM, eMap };
}

/**
 * Projeção revisada a partir do patrimônio atual (`currPat`) no offset
 * `fromOff`, seguindo o plano nominal pro restante do horizonte.
 */
export function revisedTraj(
  s: AposentadoriaPlanoInput,
  currPat: number,
  fromOff: number,
): number[] {
  const rN = nomM(s);
  const rI = infM(s);
  const retM = Math.max(0, (s.apos - s.idade) * 12);
  const { eMap } = planTraj(s);
  let P = currPat;
  const R = [P];
  for (let i = 1; i <= Math.max(0, retM - fromOff) + 60; i++) {
    const m = fromOff + i;
    if (eMap[m]) P = Math.max(0, P + eMap[m]);
    P = P * (1 + rN) + s.aporteM * Math.pow(1 + rI, m - 1);
    P = Math.max(0, P);
    R.push(P);
  }
  return R;
}

// ── Helpers de datas / entries ───────────────────────────────────────────

/** Converte um offset de meses pra { year, month } a partir do início. */
export function off2date(
  s: Pick<AposentadoriaPlanoInput, 'trackStartMonth' | 'trackStartYear'>,
  off: number,
): { year: number; month: number } {
  let m = s.trackStartMonth - 1 + off;
  const y = s.trackStartYear + Math.floor(m / 12);
  m = (((m % 12) + 12) % 12) + 1;
  return { year: y, month: m };
}

export function entryByOff(entries: AposentadoriaEntry[], off: number): AposentadoriaEntry | null {
  return entries.find((e) => e.off === off) ?? null;
}

/** Patrimônio ao fim do mês anterior (ou patrimônio inicial no offset 1). */
export function prevPat(
  s: AposentadoriaPlanoInput,
  entries: AposentadoriaEntry[],
  off: number,
): number | null {
  const e = entryByOff(entries, off - 1);
  if (e) return e.patFinal;
  return off === 1 ? s.patrimonio : null;
}

/** Rentabilidade do mês (%): ((pat - aporte) / prev - 1) * 100. */
export function calcRent(prev: number | null, ap: number, pat: number): number | null {
  return prev && prev > 0 ? ((pat - ap) / prev - 1) * 100 : null;
}

/** Maior offset registrado (0 quando não há entries). */
export function maxEOff(entries: AposentadoriaEntry[]): number {
  return entries.length ? Math.max(...entries.map((e) => e.off)) : 0;
}
