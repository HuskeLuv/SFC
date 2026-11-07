/**
 * Relatório de exemplo (Ana Ribeiro, gerado em 03/11/2026 às 09:42): porte dos geradores de dados
 * do protótipo do Pedro (relatorio-pedro.html), com o mesmo PRNG e a mesma ordem de sorteios, para
 * o modo demonstração (?fixture=exemplo) bater lado a lado com o HTML dele nos 3 planos × 4
 * períodos.
 *
 * ATENÇÃO (palavras proibidas): o bloco Advanced tem textos de IR. O modo demonstração deve
 * carregar este módulo por import() dinâmico, nunca estático, para não ir aos chunks do Basic/Pro.
 */
import { aplicarCadeado, type Plano } from '@/lib/planos';
import type {
  BlocoCarteira,
  BlocoCarteiraAvancada,
  BlocoDividas,
  BlocoIr,
  BlocoOrcamento,
  BlocoPlanejamento,
  BlocoSaude,
  IndicadorSaudeRelatorio,
  IrGancho,
  ItemDividaRelatorio,
  MesesRelatorio,
  RelatorioFinanceiro,
  SonhoRelatorio,
  StatusSemaforo,
} from '@/types/relatorioFinanceiro';
import type { BlocoFgcRelatorio } from '@/types/relatorioFinanceiroFgc';
import type { PontoSerieDividas } from '@/types/relatorioFinanceiroDividas';
import { CORES } from '../cores';
import { fP } from '../formato';

// ── utilidades do protótipo ─────────────────────────────────────────────────────

/** mulberry32, idêntico ao rng(s) do protótipo. */
function rng(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** MLAB[0] = Dez/25 … MLAB[11] = Nov/26. */
const MLAB = [
  'Dez/25',
  'Jan/26',
  'Fev/26',
  'Mar/26',
  'Abr/26',
  'Mai/26',
  'Jun/26',
  'Jul/26',
  'Ago/26',
  'Set/26',
  'Out/26',
  'Nov/26',
];
/** 'YYYY-MM' do índice de MLAB. */
const mesDe = (idx: number) => {
  const t = 2025 * 12 + 11 + idx;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
/** 'YYYY-MM' de k meses depois de Nov/26 (addM(11, k) do protótipo). */
const mesDepois = (k: number) => {
  const t = 2026 * 12 + 10 + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

// ── dados de exemplo (mesma ordem de sorteios do protótipo) ─────────────────────

const R = rng(11);

const CATS: [string, number, number][] = [
  ['Habitação', 7701.5, 3701.34],
  ['Transporte', 3850, 2169.8],
  ['Saúde', 4579, 6530.61],
  ['Educação', 1200, 1924.76],
  ['Pets', 269.9, 219.9],
  ['Pessoais', 3643.9, 3101.74],
  ['Lazer', 2800, 3017.48],
  ['Impostos', 0, 0],
  ['Dependentes', 0, 0],
  ['Empresa', 2000, 967.91],
  ['Financeiras', 200, 100],
  ['Planejamento', 0, 0],
  ['Variáveis', 3970, 685.51],
];

interface MesBud {
  receita: number;
  cats: { name: string; orc: number; real: number }[];
}
const BUD: MesBud[] = MLAB.map((_, m) => {
  const cur = m === 11;
  const receita = cur ? 50000 : Math.round(50000 + (R() - 0.5) * 3000 + (m === 0 ? 14000 : 0));
  const cats = CATS.map(([name, orc, real]) => {
    if (cur) return { name, orc, real };
    let f = 0.8 + R() * 0.3;
    if (name === 'Saúde') f = 0.95 + R() * 0.4;
    if (name === 'Lazer') f = 0.85 + R() * 0.35;
    if (name === 'Habitação') f = 0.93 + R() * 0.1;
    if (name === 'Variáveis') f = 0.45 + R() * 0.55;
    if (m === 0 && (name === 'Lazer' || name === 'Pessoais')) f += 0.45;
    return { name, orc, real: orc ? Math.round(orc * f * 100) / 100 : 0 };
  });
  return { receita, cats };
});

function budAgg(n: number) {
  const ms = BUD.slice(12 - n);
  const cats = CATS.map((c, i) => {
    const orc = sum(ms.map((x) => x.cats[i].orc));
    const real = sum(ms.map((x) => x.cats[i].real));
    return { name: c[0], orc, real };
  });
  const receita = sum(ms.map((x) => x.receita));
  const real = sum(cats.map((c) => c.real));
  return { receita, real, sobra: receita - real, poup: ((receita - real) / receita) * 100 };
}

interface DividaEx {
  nome: string;
  inst: string;
  sist: ItemDividaRelatorio['sistema'];
  saldo: number;
  cet: number;
  rest: number | null;
  i: number;
  parcela: number;
  jurosMes: number;
  jr: number | null;
}
const DEBTS: DividaEx[] = (
  [
    {
      nome: 'Financiamento imobiliário',
      inst: 'Caixa',
      sist: 'SAC',
      saldo: 312400,
      cet: 10.9,
      rest: 214,
    },
    {
      nome: 'Financiamento do carro',
      inst: 'Banco do Brasil',
      sist: 'PRICE',
      saldo: 38600,
      cet: 21.4,
      rest: 31,
    },
    {
      nome: 'Compras parceladas',
      inst: 'Cartão Nubank',
      sist: 'Cartão parcelado',
      saldo: 4850,
      cet: 0,
      rest: 3,
    },
    {
      nome: 'Rotativo do cartão',
      inst: 'Cartão Inter',
      sist: 'Rotativo',
      saldo: 2300,
      cet: 431.5,
      rest: null,
    },
  ] as const
).map((d) => {
  const i = Math.pow(1 + d.cet / 100, 1 / 12) - 1;
  let parcela: number;
  let jr: number | null;
  if (d.sist === 'SAC') {
    const A = d.saldo / d.rest;
    parcela = A + d.saldo * i;
    jr = (i * A * d.rest * (d.rest + 1)) / 2;
  } else if (d.sist === 'PRICE') {
    parcela = (d.saldo * i) / (1 - Math.pow(1 + i, -d.rest));
    jr = parcela * d.rest - d.saldo;
  } else if (d.sist === 'Cartão parcelado') {
    parcela = d.saldo / d.rest;
    jr = 0;
  } else {
    parcela = d.saldo * 0.15;
    jr = null;
  }
  return { ...d, i, parcela, jurosMes: d.saldo * i, jr };
});

/** DEBT_M do protótipo: saldo no fim de cada mês e parcela juros × amortização. */
const DEBT_M: PontoSerieDividas[] = MLAB.map((_, m) => {
  const back = 11 - m;
  const imob = 312400 + 1459.8 * back;
  const car = 38600 + 985 * back;
  const parc = m === 11 ? 4850 : Math.round(2600 + R() * 3400);
  const rot = m >= 9 ? (2300 * (m - 8)) / 3 : 0;
  const juros = imob * DEBTS[0].i + car * DEBTS[1].i + rot * DEBTS[3].i;
  return { mes: mesDe(m), saldo: imob + car + parc + rot, juros, amortizacao: 1459.8 + 985 };
});

const CLASSES: [ItemCarteira['chave'], string, number, string][] = [
  ['rendaFixa', 'Renda fixa', 470751.92, CORES.blue],
  ['tesouro', 'Tesouro Direto', 112000, CORES.b6],
  ['acoes', 'Ações', 268000, CORES.navy],
  ['fiis', 'FIIs', 154000, CORES.gold],
  ['exterior', 'Stocks', 131000, CORES.b4],
  ['reits', 'REITs', 38000, CORES.b2],
];
type ItemCarteira = BlocoCarteira['classes'][number];
const PAT_TOTAL = sum(CLASSES.map((c) => c[2]));
const DPM = 21;
const ND = 12 * DPM;
const DAILY = {
  cart: [] as number[],
  ibov: [] as number[],
  cdi: [] as number[],
  ipca: [] as number[],
};
for (let d = 0; d < ND; d++) {
  const mk = R() - 0.5;
  DAILY.ibov.push(0.0005 + mk * 0.022 + (R() - 0.5) * 0.006);
  DAILY.cart.push(0.00062 + mk * 0.009 + (R() - 0.5) * 0.003);
  DAILY.cdi.push(0.000551);
  DAILY.ipca.push(0.00018);
}
const MRET = MLAB.map(
  (_, m) => DAILY.cart.slice(m * DPM, (m + 1) * DPM).reduce((a, r) => a * (1 + r), 1) - 1,
);
const APORTE = MLAB.map((_, m) => Math.round(3480 + m * 14 + (R() - 0.4) * 260));
const PAT: number[] = new Array(12);
PAT[11] = PAT_TOTAL;
for (let m = 11; m > 0; m--) PAT[m - 1] = (PAT[m] - APORTE[m]) / (1 + MRET[m]);
const PROV = MLAB.map((_, m) => {
  const f = 1 + (m % 3 === 2 ? 0.35 : 0);
  const fii = Math.round(1180 + R() * 120);
  const acao = Math.round((420 + R() * 900) * f);
  const ext = Math.round(260 + R() * 160);
  const jcp = m % 3 === 2 ? Math.round(380 + R() * 200) : 0;
  return { fii, acao, ext, jcp };
});

const META_M = 1.061;
const PLAN_P: number[] = new Array(12);
PLAN_P[0] = PAT[0] * 1.004;
const APORTE_P = MLAB.map((_, m) => Math.round(3500 * Math.pow(1.004, m)));
for (let m = 1; m < 12; m++) PLAN_P[m] = PLAN_P[m - 1] * (1 + META_M / 100) + APORTE_P[m];

// IR mensal de renda variável (IRM do protótipo): sorteado logo depois dos proventos.
const IRM = MLAB.map(() => {
  const va = Math.round(6000 + R() * 22000);
  const la = Math.round((R() - 0.3) * 3200);
  const lf = Math.round((R() - 0.2) * 1400);
  return {
    vendasAcoes: va,
    lucroAcoes: la,
    isento: va <= 20000,
    irAcoes: va > 20000 && la > 0 ? la * 0.15 : 0,
    lucroFii: lf,
    irFii: lf > 0 ? lf * 0.2 : 0,
  };
});

const DREAMS = [
  {
    nome: 'Reserva de emergência',
    meta: 180000,
    atual: 162300,
    aporte: 1500,
    fim: '2027-04',
    prazo: 'Curto',
    prio: 'Alta',
    hist: [118, 124, 128, 132, 136, 140, 144, 148, 152, 155, 159, 162.3],
    status: 'good' as StatusSemaforo,
  },
  {
    nome: 'Viagem Europa',
    meta: 70000,
    atual: 12255.77,
    aporte: 2000,
    fim: '2029-02',
    prazo: 'Médio',
    prio: 'Alta',
    hist: [0, 0, 1.2, 2.9, 4.8, 6.6, 8.6, 12.26, 12.26, 12.26, 12.26, 12.26],
    status: 'bad' as StatusSemaforo,
  },
  {
    nome: 'Troca do carro',
    meta: 120000,
    atual: 45800,
    aporte: 1800,
    fim: '2028-12',
    prazo: 'Médio',
    prio: 'Média',
    hist: [27, 28.6, 30.2, 31.9, 33.5, 35.2, 36.9, 38.6, 40.4, 42.1, 44, 45.8],
    status: 'good' as StatusSemaforo,
  },
  {
    nome: 'Casa na praia',
    meta: 600000,
    atual: 38400,
    aporte: 2500,
    fim: '2038-01',
    prazo: 'Longo',
    prio: 'Baixa',
    hist: [12, 14.3, 16.6, 19, 21.4, 23.8, 26.2, 28.6, 31, 33.4, 35.9, 38.4],
    status: 'warn' as StatusSemaforo,
  },
];
const ROTULO_SONHO: Record<StatusSemaforo, string> = {
  good: 'No ritmo',
  warn: 'Abaixo do ritmo',
  bad: 'Sem aporte há 4 meses',
};

const ATIVOS: [string, number][] = [
  ['Investimentos', PAT_TOTAL],
  ['Imóvel (residência)', 850000],
  ['Veículo', 92000],
  ['Saldo em contas', 18400],
];

// ── blocos do contrato ──────────────────────────────────────────────────────────

function orcamentoExemplo(n: number): BlocoOrcamento {
  const statusCat = (orc: number, real: number) =>
    orc > 0 && real > orc * 1.005 ? ('bad' as const) : ('ok' as const);
  const meses = BUD.slice(12 - n).map((b, k) => {
    const idx = 12 - n + k;
    return {
      mes: mesDe(idx),
      rotulo: MLAB[idx],
      fechado: idx !== 11,
      receita: b.receita,
      receitaOrigem: 'fluxo' as const,
      categorias: b.cats.map((c) => ({
        chave: c.name.toLowerCase(),
        nome: c.name,
        orcado: c.orc,
        realizado: c.real,
        status: statusCat(c.orc, c.real),
      })),
    };
  });
  const atual = BUD[11];
  const orcAtual = sum(atual.cats.map((c) => c.orc));
  const realAtual = sum(atual.cats.map((c) => c.real));
  const fechados = BUD.slice(8, 11);
  return {
    temOrcamento: true,
    meses,
    ritmo: { dia: 3, diasNoMes: 30, pctMes: 10, pctOrcadoLancado: (realAtual / orcAtual) * 100 },
    referenciaFechada: {
      receitaMedia3m: sum(fechados.map((b) => b.receita)) / 3,
      gastoMedio3m: sum(fechados.map((b) => sum(b.cats.map((c) => c.real)))) / 3,
      sobraMesAnterior: BUD[10].receita - sum(BUD[10].cats.map((c) => c.real)),
    },
  };
}

function dividasExemplo(n: number): BlocoDividas {
  return {
    itens: DEBTS.map((d, k) => ({
      id: `divida-${k + 1}`,
      nome: d.nome,
      instituicao: d.inst,
      sistema: d.sist,
      imobiliario: k === 0,
      status: 'ativa',
      saldo: d.saldo,
      cetAA: d.cet,
      parcelaMes: d.parcela,
      jurosMes: d.jurosMes,
      jurosAteQuitar: d.jr,
      parcelasRestantes: d.rest,
      quitacao: d.rest ? mesDepois(d.rest) : null,
    })),
    semDividasForaImovel: { mes: mesDepois(DEBTS[1].rest ?? 0), motivo: 'com_rotativo' },
    avisos: { semCet: 0, parcelasVencidasSemPagamento: 0 },
    serie: DEBT_M.slice(12 - n),
  };
}

function carteiraExemplo(n: number): BlocoCarteira {
  const ini = n === 12 ? (PAT[0] - APORTE[0]) / (1 + MRET[0]) : PAT[11 - n];
  const desde = n === 1 ? 6 : 12 - n;
  return {
    asOf: '2026-10-30',
    patrimonio: PAT_TOTAL,
    classes: CLASSES.map(([chave, nome, valor]) => ({ chave, nome, valor })),
    nAtivos: 37,
    nClasses: 6,
    historico: PAT.slice(desde).map((valor, k) => ({ mes: mesDe(desde + k), valor })),
    variacaoPeriodo: PAT_TOTAL - ini,
    aportesPeriodo: sum(APORTE.slice(12 - n)),
    aportes: APORTE.slice(12 - n).map((valor, k) => ({ mes: mesDe(12 - n + k), valor })),
    historicoStatus: 'ok',
  };
}

function carteiraAvancadaExemplo(n: number): BlocoCarteiraAvancada {
  const days = n * DPM;
  const s = ND - days;
  const comp = (a: number[]) => {
    let v = 1;
    return [0].concat(a.slice(s).map((r) => ((v *= 1 + r), (v - 1) * 100)));
  };
  const cart = comp(DAILY.cart);
  const ibov = comp(DAILY.ibov);
  const cdi = comp(DAILY.cdi);
  const ipca = comp(DAILY.ipca);
  const datas: string[] = [];
  for (let i = 0; i <= days; i++) {
    if (i === 0) {
      const [a, m] = mesDe(12 - n - 1)
        .split('-')
        .map(Number);
      datas.push(`${mesDe(12 - n - 1)}-${new Date(Date.UTC(a, m, 0)).getUTCDate()}`);
      continue;
    }
    const idx = 12 - n + Math.floor((i - 1) / DPM);
    const k = (i - 1) % DPM;
    const [a, m] = mesDe(idx).split('-').map(Number);
    const dim = new Date(Date.UTC(a, m, 0)).getUTCDate();
    datas.push(
      `${mesDe(idx)}-${String(1 + Math.round((k * (dim - 1)) / (DPM - 1))).padStart(2, '0')}`,
    );
  }
  return {
    retornoDiario: { datas, carteira: cart, ibov, cdi, ipca },
    twr: cart[cart.length - 1],
    cdi: cdi[cdi.length - 1],
    ipca: ipca[ipca.length - 1],
    ibov: ibov[ibov.length - 1],
    proventos: PROV.slice(12 - n).map((p, k) => ({
      mes: mesDe(12 - n + k),
      fii: p.fii,
      acao: p.acao,
      jcp: p.jcp,
      exterior: p.ext,
    })),
    fgc: fgcExemplo(),
    irRendaVariavel: {
      meses: IRM.slice(12 - n).map((r, k) => {
        const t = r.irAcoes + r.irFii;
        return {
          mes: mesDe(12 - n + k),
          vendasAcoes: r.vendasAcoes,
          vendasEtf: 0,
          isentoAcoes: r.isento,
          lucroAcoes: r.lucroAcoes,
          prejuizoCompensadoAcoes: 0,
          irAcoes: r.irAcoes,
          vendasFii: 0,
          lucroFii: r.lucroFii,
          prejuizoCompensadoFii: 0,
          irFii: r.irFii,
          irMes: t,
          acumuladoAnterior: 0,
          darf:
            t >= 10
              ? { status: 'pagar' as const, valor: t }
              : t > 0
                ? { status: 'acumula' as const, valor: t }
                : { status: 'sem' as const, valor: 0 },
        };
      }),
    },
  };
}

/** FGC do protótipo: [emissor, valor coberto, nº de títulos]. */
const FGC: [string, number, number][] = [
  ['Banco BMG S.A.', 168478.56, 2],
  ['BTG Pactual', 119135.56, 1],
  ['XP Investimentos', 93731.15, 1],
  ['Banco Inter S.A.', 89406.65, 1],
];

function fgcExemplo(): BlocoFgcRelatorio {
  const total = Math.round(FGC.reduce((a, f) => a + f[1], 0) * 100) / 100;
  return {
    limitePorEmissor: 250_000,
    tetoGlobal: 1_000_000,
    emissores: FGC.map(([nome, valorCoberto, nTitulos], i) => ({
      chave: `emissor-${i + 1}`,
      nome,
      valorCoberto,
      nTitulos,
      pctLimite: Math.round((valorCoberto / 250_000) * 10000) / 100,
      excedente: 0,
      status: 'dentro',
      usaCorretora: false,
    })),
    totalCoberto: total,
    pctTetoGlobal: Math.round((total / 1_000_000) * 10000) / 100,
    totalExcedente: 0,
    rendaFixaSemCobertura: 0,
    avisos: [],
  };
}

function planejamentoExemplo(n: number): BlocoPlanejamento {
  const desde = 12 - Math.max(n, 6);
  return {
    temPlano: true,
    patrimonioRealizado: PAT_TOTAL,
    patrimonioPlanejadoHoje: PLAN_P[11],
    metaIndependencia: { valor: 5_000_000, mes: '2034-10' },
    metaMensal: META_M,
    serie: MLAB.slice(desde).map((_, k) => {
      const idx = desde + k;
      return {
        mes: mesDe(idx),
        planejado: PLAN_P[idx],
        realizado: PAT[idx],
        aporteProjetado: APORTE_P[idx],
        aporteRealizado: APORTE[idx],
        rentabilidade: MRET[idx] * 100,
      };
    }),
  };
}

function sonhosExemplo(n: number): SonhoRelatorio[] {
  const desde = n === 1 ? 6 : 12 - n;
  return DREAMS.map((d, k) => {
    const apd = (d.hist[11] - (n === 12 ? d.hist[0] * 0.92 : d.hist[11 - n])) * 1000;
    return {
      id: `sonho-${k + 1}`,
      nome: d.nome,
      prioridade: d.prio,
      prazo: d.prazo,
      meta: d.meta,
      acumulado: d.atual,
      aporteMensal: d.aporte,
      aportadoPeriodo: Math.max(0, apd),
      conclusao: d.fim,
      status: d.status,
      rotuloStatus: ROTULO_SONHO[d.status],
      mesesSemAporte: d.status === 'bad' ? 4 : 0,
      historico: d.hist.slice(desde).map((v, j) => ({ mes: mesDe(desde + j), valor: v * 1000 })),
    };
  });
}

function saudeExemplo(n: number): BlocoSaude {
  const b = budAgg(n);
  const dv = sum(DEBTS.map((d) => d.saldo));
  const at = sum(ATIVOS.map((a) => a[1]));
  const parc = sum(DEBTS.map((d) => d.parcela));
  const gastoM = b.real / n;
  const provM = sum(PROV.slice(12 - n).map((p) => p.fii + p.acao + p.ext + p.jcp)) / n;
  const ind = (
    chave: IndicadorSaudeRelatorio['chave'],
    valor: number | null,
    valorFmt: string,
    meta: string,
    status: StatusSemaforo,
  ): IndicadorSaudeRelatorio => ({ chave, valor, valorFmt, meta, status, base: 'periodo' });
  return {
    nota: 78,
    status: 'good',
    frase: `Sua saúde financeira está boa: você poupa ${fP(b.poup, 0)} da renda e tem 7 meses de reserva. O ponto de alerta é o rotativo do cartão.`,
    indicadores: [
      ind('poupanca', b.poup, fP(b.poup), '≥ 20%', b.poup >= 20 ? 'good' : 'warn'),
      ind('reserva', 7, '7,0 meses', '≥ 6 meses', 'good'),
      ind(
        'comprometimento',
        (parc / 50000) * 100,
        fP((parc / 50000) * 100),
        '≤ 30%',
        parc / 50000 <= 0.3 ? 'good' : 'bad',
      ),
      ind(
        'endividamento',
        (dv / at) * 100,
        fP((dv / at) * 100),
        '≤ 30%',
        dv / at <= 0.3 ? 'good' : 'bad',
      ),
      ind('independencia', (provM / gastoM) * 100, fP((provM / gastoM) * 100), '100%', 'warn'),
      ind('rotativo', 1, 'Sim', 'Não usar', 'bad'),
    ],
    bens: ATIVOS.map(([nome, valor]) => ({ nome, valor })),
    dividas: DEBTS.map((d) => ({ nome: d.nome, valor: d.saldo })),
    asOf: '2026-10-30',
    historicoNota: [],
  };
}

/** Bloco da seção 8 com os números do protótipo (PG). */
const IR_EXEMPLO: BlocoIr = {
  ano: 2026,
  encerrado: false,
  rendaTributavel: 186400,
  rendaPartes: [
    { nome: 'Salário', valor: 158400 },
    { nome: 'Aluguéis', valor: 28000 },
  ],
  rendaOrigem: 'simulacao',
  limite12: 22368,
  aportado: 14200,
  nAportes: 11,
  economia: 3905,
  economiaMaxima: 6151.2,
  faltaNoLimite: 8168,
  economiaFalta: 2246.2,
  diasAte3112: 58,
  simulacao: {
    completo: {
      deducoes: 40045.86,
      baseCalculo: 146354.14,
      impostoTabela: 29342.63,
      redutor: 0,
      doacoes: 500,
      irDevido: 28842.63,
      aliquotaMarginal: 0.275,
      aliquotaEfetiva: 28842.63 / 186400,
    },
    simplificado: {
      deducoes: 16754.34,
      baseCalculo: 169645.66,
      impostoTabela: 35747.8,
      redutor: 0,
      doacoes: 0,
      irDevido: 35747.8,
      aliquotaMarginal: 0.275,
      aliquotaEfetiva: 35747.8 / 186400,
    },
    deducoesCompleto: {
      inss: 10934.2,
      pgbl: 14200,
      dependentes: 4550.16,
      saude: 6800,
      educacao: 3561.5,
      pensaoJudicial: 0,
      livroCaixa: 0,
      total: 40045.86,
    },
    descontoSimplificado: 16754.34,
    melhorModelo: 'completo',
    irDevido: 28842.63,
    economiaCompletoVsSimplificado: 6905.17,
    saldoAjuste: 2437.37,
    limiteDoacoes: 1760.56,
    avisos: { redutorAplicado: false, irpfmPossivel: false },
  },
  retidoNaFonte: 31280,
  restituicaoProjetada: 2437.37,
  condicoes: [
    {
      chave: 'modeloCompleto',
      status: 'good',
      titulo: 'Declaração pelo modelo completo',
      descricao:
        'Suas deduções somam R$ 40.045,86, acima do desconto simplificado de R$ 16.754,34.',
    },
    {
      chave: 'inss',
      status: 'good',
      titulo: 'Contribuição ao INSS no ano',
      descricao:
        'R$ 10.934,20 no fluxo de caixa (desconto em folha). Exigência para deduzir o PGBL.',
    },
    {
      chave: 'tipoPlano',
      status: 'good',
      titulo: 'Plano é PGBL, não VGBL',
      descricao: '2 planos cadastrados como PGBL. VGBL não é dedutível e entra em Bens e Direitos.',
    },
    {
      chave: 'prazo',
      status: 'warn',
      titulo: 'Aportes até 31/12/2026',
      descricao: 'Ainda há R$ 8.168 de espaço no limite de 12%.',
    },
    {
      chave: 'regime',
      status: 'info',
      titulo: 'Regime de tributação: regressivo',
      descricao:
        'Alíquota cai de 35% para 10% após 10 anos. A opção pode ser feita até o primeiro resgate.',
    },
  ],
  planos: [
    {
      id: 'plano-1',
      nome: 'PGBL Renda Futura 2045',
      seguradora: null,
      cnpj: null,
      regime: 'Regressivo',
      tipo: 'pgbl',
      nAportes: 10,
      totalAno: 12000,
      saldoAtual: 61480.33,
    },
    {
      id: 'plano-2',
      nome: 'PGBL Multimercado Prev',
      seguradora: null,
      cnpj: null,
      regime: 'Regressivo',
      tipo: 'pgbl',
      nAportes: 1,
      totalAno: 2200,
      saldoAtual: 9874.1,
    },
  ],
  deducoes: [
    { chave: 'saude', valor: 6800, nota: null },
    { chave: 'educacao', valor: 3561.5, nota: 'teto atingido' },
    { chave: 'dependentes', valor: 4550.16, nota: '2 cadastrados' },
    { chave: 'previdencia', valor: 25134.2, nota: null },
    { chave: 'pensao', valor: 0, nota: null },
    { chave: 'livroCaixa', valor: 0, nota: null },
    { chave: 'doacoes', valor: 500, nota: 'limite est. R$ 1.760,56' },
  ],
};

const IR_GANCHO_EXEMPLO: IrGancho = {
  ano: 2026,
  encerrado: false,
  rendaTributavel: 186400,
  rendaOrigem: 'simulacao',
  economiaMaxima: 6151.2,
  diasAte3112: 58,
};

/** Data fixa do exemplo (03/11/2026 09:42 em SP). */
export const GERADO_EM_EXEMPLO = '2026-11-03T09:42:00-03:00';

function rotuloPeriodo(n: MesesRelatorio): string {
  return n === 1
    ? 'Novembro de 2026 (parcial, lançado até 03/11)'
    : `${MLAB[12 - n]} a ${MLAB[11]} · ${n} meses`;
}

/**
 * Relatório de exemplo no plano e período pedidos, já com o cadeado aplicado (o que o servidor
 * mandaria para esse plano).
 */
export function relatorioExemplo(meses: MesesRelatorio, plano: Plano): RelatorioFinanceiro {
  const completo: RelatorioFinanceiro = {
    versao: 1,
    cliente: 'Ana Ribeiro',
    consultor: null,
    plano,
    periodo: {
      meses,
      rotulo: rotuloPeriodo(meses),
      inicio: mesDe(12 - meses),
      fim: mesDe(11),
      parcial: true,
      lancadoAte: '03/11',
    },
    geradoEm: GERADO_EM_EXEMPLO,
    orcamento: orcamentoExemplo(meses),
    dividas: dividasExemplo(meses),
    carteira: carteiraExemplo(meses),
    carteiraAvancada: carteiraAvancadaExemplo(meses),
    planejamento: planejamentoExemplo(meses),
    sonhos: sonhosExemplo(meses),
    saude: saudeExemplo(meses),
    ir: IR_EXEMPLO,
    irGancho: IR_GANCHO_EXEMPLO,
  };
  return aplicarCadeado(completo, plano);
}
