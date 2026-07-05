/**
 * Parsers das respostas da Cedro Crystal (GP / GCH / SQT / MQC).
 * Cada parser recebe o texto cru coletado pelo CedroClient e devolve estruturas tipadas.
 * Os campos seguem a especificação dos PDFs BASIC + Premium (rev. 25/02/2025).
 */

/* ───────────────────────── GP — Get Proventos ───────────────────────── */

export interface CedroProvento {
  ativo: string;
  /** Data de início de pagamento (YYYY-MM-DD) ou null. */
  dataPagamento: string | null;
  horaPagamento: string | null;
  /** Tipo: Dividendo, Rendimento, JCP, Amortização, Desdobramento De Ações, Grupamento, Incorporação… */
  tipo: string;
  /**
   * Caixa (Dividendo/JCP/Rendimento/Amortização): valor em R$ por cota/ação.
   * Eventos (Desdobramento/Grupamento/Bonificação): PERCENTUAL de variação de
   * quantidade — verificado ao vivo: HFOF11 desdobramento `valor=900` ⇒ +900%
   * (split 1:10); ITSA4 bonificação `valor=2` ⇒ +2% de cotas bonificadas.
   */
  valor: number | null;
  dataDeliberacao: string | null;
  /** Data-ex (negócios já EX a partir desta data). */
  dataEx: string | null;
  /** Data-com (última data com direito). */
  dataCom: string | null;
  relativoA: string | null;
  /** Preço de subscrição (presente em SUBSCRICAO). */
  precoSubscricao: number | null;
  /**
   * Proporção antes/depois de split/grupamento (campo bruto da Cedro). Observado:
   * desdobramento HFOF11 = 1:0; vazio nos demais tipos. Para o FATOR efetivo
   * prefira `valor` (percentual) — ver nota acima.
   */
  proporcaoAntes: number | null;
  proporcaoDepois: number | null;
  /** Presente só em INCORPORAÇÃO. */
  novoTicker: string | null;
  descricao: string | null;
  raw: string;
}

const fmtDate = (d?: string): string | null =>
  d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
const fmtTime = (t?: string): string | null =>
  t && /^\d{6}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}` : null;
const num = (s?: string): number | null => {
  if (s == null || s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Layout do corpo GP, após remover o cabeçalho "GP:<freq>:<reqId>:".
 * Posições VERIFICADAS ao vivo (HFOF11/ITSA4, 2026-06-30):
 *   p0 ativo · p1 dtPag · p2 hrPag · p3 tipo · p4 valor · p5 dtDelib · p6 hrDelib
 *   · p7 dtEx · p8 hrEx · p9 relativoA(vazio) · p10 descrição(emissor)
 *   · p11 idEvento(hash) · p12 precoSubscrição · p13 (vazio) · p14 propAntes
 *   · p15 propDepois · p16 dtCom · p17 hrCom · p18 novoTicker
 */
export function parseProventos(raw: string): CedroProvento[] {
  const out: CedroProvento[] = [];
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || /(?:^|:)END$/.test(line)) continue;
    // remove cabeçalho funcional "GP:<freq>:<reqId>:" se presente
    const body = line.replace(/^GP:[^:]*:[^:]*:/, '');
    const p = body.split(':');
    if (p.length < 5) continue;
    out.push({
      ativo: p[0],
      dataPagamento: fmtDate(p[1]),
      horaPagamento: fmtTime(p[2]),
      tipo: p[3] ?? '',
      valor: num(p[4]),
      dataDeliberacao: fmtDate(p[5]),
      dataEx: fmtDate(p[7]),
      dataCom: fmtDate(p[16]),
      relativoA: p[9] || null,
      precoSubscricao: num(p[12]),
      proporcaoAntes: num(p[14]),
      proporcaoDepois: num(p[15]),
      novoTicker: p[18] && /[A-Z]{4}\d/.test(p[18]) ? p[18] : null,
      descricao: p[10] ?? null,
      raw: line,
    });
  }
  return out;
}

/* ───────────────────────── GCH — Get Candles History ───────────────────────── */

export interface CedroCandle {
  /** YYYY-MM-DD (ou com hora p/ intradiário). */
  data: string;
  /** Campo "preço" = fechamento. */
  close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  trades: number | null;
  volumeQty: number | null;
  volumeFin: number | null;
  afterMarket: boolean;
}

/** Corpo GCH: "H:<sym>:<id>:<close>:<open>:<high>:<low>:<prev>:<trades>:<volQty>:<volFin>:<YYYYMMDDHHMM>:<after>" */
export function parseCandles(raw: string): CedroCandle[] {
  const out: CedroCandle[] = [];
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const body = line.replace(/^H:[^:]*:[^:]*:/, '');
    if (body === 'E' || body.endsWith(':E')) continue; // terminador
    const p = body.split(':');
    if (p.length < 9) continue;
    const dt = p[8];
    const data =
      dt && dt.length >= 8
        ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}${dt.length >= 12 ? ` ${dt.slice(8, 10)}:${dt.slice(10, 12)}` : ''}`
        : dt;
    out.push({
      data,
      close: num(p[0]),
      open: num(p[1]),
      high: num(p[2]),
      low: num(p[3]),
      prevClose: num(p[4]),
      trades: num(p[5]),
      volumeQty: num(p[6]),
      volumeFin: num(p[7]),
      afterMarket: p[9] === '1',
    });
  }
  return out;
}

/* ───────────────────────── SQT — Subscribe Quote (snapshot) ───────────────────────── */

export interface CedroQuote {
  ativo: string;
  indices: Record<number, string>;
  // atalhos dos índices mais usados
  ultimoPreco: number | null;
  fechamentoAnterior: number | null;
  abertura: number | null;
  maximaDia: number | null;
  minimaDia: number | null;
  variacao: number | null;
  dataUltModif: string | null;
  descricao: string | null;
  // Tesouro Direto (200-215)
  tesouro?: {
    pu: number | null;
    taxa: number | null;
    indexador: string | null;
    nomeTitulo: string | null;
    taxaCompra: number | null;
    taxaVenda: number | null;
  };
}

export function parseQuote(raw: string): CedroQuote | null {
  // formato: T:<ativo>:<hora>:<idx>:<val>:<idx>:<val>...!
  const msg = raw.split('!')[0].trim();
  const p = msg.split(':');
  if (p[0] !== 'T' || p.length < 4) return null;
  const ativo = p[1];
  const indices: Record<number, string> = {};
  for (let i = 3; i + 1 < p.length; i += 2) {
    const idx = Number(p[i]);
    if (Number.isInteger(idx)) indices[idx] = p[i + 1];
  }
  const g = (i: number) => num(indices[i]);
  const hasTesouro = indices[200] != null || indices[215] != null;
  return {
    ativo,
    indices,
    ultimoPreco: g(2),
    fechamentoAnterior: g(13),
    abertura: g(14),
    maximaDia: g(11),
    minimaDia: g(12),
    variacao: g(21),
    dataUltModif: fmtDate(indices[1]),
    descricao: indices[47] ?? null,
    ...(hasTesouro
      ? {
          tesouro: {
            pu: g(200),
            taxa: g(201),
            indexador: indices[214] ?? null,
            nomeTitulo: indices[215] ?? null,
            taxaCompra: g(211),
            taxaVenda: g(212),
          },
        }
      : {}),
  };
}

/* ───────────────────────── MQC — Market Quote Composition ───────────────────────── */

/** Corpo MQC: linhas "C:<mercado>:<ativo>" terminadas por "C:<mercado>:E". */
export function parseMqc(raw: string): string[] {
  const out: string[] = [];
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || !line.startsWith('C:')) continue;
    const p = line.split(':');
    const ativo = p[2];
    if (!ativo || ativo === 'E') continue;
    out.push(ativo);
  }
  return out;
}
