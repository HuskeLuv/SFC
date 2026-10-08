/**
 * Meus cenários (Bloco D, fatia B) — monta as linhas da tela a partir dos campos. PURO e
 * isomórfico (a calculadora roda no cliente; o teste roda no Node).
 *
 * FONTE ÚNICA das fórmulas: metodos.ts e metaRenda.ts. Este módulo só compõe: escolhe o valor de
 * cada campo (o do ativo ou o digitado), dá o motivo do "—" e arredonda como a tela mostra.
 *
 * - A conta usa o valor VISÍVEL no campo: os dados do ativo entram arredondados como o campo os
 *   mostra (R$ com 2 casas; rendimento/cota de FII com 3 — sem isso a Meta de renda erra ~40 cotas
 *   no MXRF11; P/L alvo padrão com 1). O que o usuário digita entra como digitado.
 * - Nenhum caso inválido lança exceção: o método vira "—" com o motivo (LPA ≤ 0, VPA ≤ 0, DPA 0,
 *   k ≤ g, premissa fora do limite, campo vazio, dado em conferência sem valor).
 * - Dado em conferência (decisão 6): 'selo' ⇒ o valor entra e o método diz "usa <dado> em
 *   conferência" enquanto o usuário não digitar outro; 'ocultar' ⇒ o campo vem vazio e o método é
 *   "—" até o usuário digitar.
 * - "vs. cotação" inteiro com sinal; "Com sua margem" = resultado × (1 − margem). Sem cotação, os
 *   dois ficam "—" e as barras sem a linha da cotação.
 */
import {
  arredondar,
  formatarNumeroBR,
} from '@/services/analiseAtivos/regras/valuation/arredondamento';
import {
  validarPremissa,
  type NomePremissa,
} from '@/services/analiseAtivos/regras/valuation/cenario';
import { metaDeRenda } from '@/services/analiseAtivos/regras/valuation/metaRenda';
import {
  bazin,
  comMargem,
  gordon,
  graham,
  multiploAlvo,
  pvpAlvo,
  rendaDesejada,
  suaPosicao,
  vsCotacaoPct,
} from '@/services/analiseAtivos/regras/valuation/metodos';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type {
  CampoDadoCenarioAcao,
  CampoDadoCenarioFii,
  MetodoCenario,
} from '@/types/analiseAtivosBlocoD';
import type { ExibicaoConferenciaTela } from '@/types/analiseAtivosApi';

const T = TEXTOS_CENARIOS;

export type CampoDadoCenario = CampoDadoCenarioAcao | CampoDadoCenarioFii;
export type ClasseCenario = 'acao' | 'fii';

/** Casas do valor VISÍVEL de cada campo (a conta usa o valor como a tela mostra). */
export const CASAS_CAMPO: Readonly<Record<CampoDadoCenario | NomePremissa | 'cotacao', number>> = {
  lpa: 2,
  vpa: 2,
  dpa: 2,
  rend12m: 3,
  vpCota: 2,
  cotacao: 2,
  yieldPct: 1,
  gPct: 1,
  kPct: 1,
  margemPct: 0,
  plAlvo: 1,
  pvpAlvo: 2,
  rendaMensal: 2,
};

export const CAMPOS_DADO: Readonly<Record<ClasseCenario, readonly CampoDadoCenario[]>> = {
  acao: ['lpa', 'vpa', 'dpa'],
  fii: ['rend12m', 'vpCota'],
};

export const PREMISSAS_CLASSE: Readonly<Record<ClasseCenario, readonly NomePremissa[]>> = {
  acao: ['yieldPct', 'plAlvo', 'gPct', 'kPct'],
  fii: ['yieldPct', 'pvpAlvo', 'rendaMensal'],
};

export const METODOS_CLASSE: Readonly<Record<ClasseCenario, readonly MetodoCenario[]>> = {
  acao: ['bazin', 'graham', 'multiplo', 'gordon'],
  fii: ['rendaDesejada', 'pvpAlvo'],
};

/** Valores do ativo (null = ausente/oculto) e a política de conferência de cada um. */
export interface BaseNumericaCenario {
  valores: Partial<Record<CampoDadoCenario, number | null>>;
  conferencias: Partial<Record<CampoDadoCenario, ExibicaoConferenciaTela>>;
}

export interface EntradaMontarCenarios {
  classe: ClasseCenario;
  base: BaseNumericaCenario;
  /** premissas como digitadas: número (pode estar fora do limite), null = vazio, NaN = não é número */
  premissas: Partial<Record<NomePremissa, number | null>>;
  /** dados do ativo DIGITADOS (campo presente = editado; null vazio, NaN inválido) */
  dadosEditados: Partial<Record<CampoDadoCenario, number | null>>;
  margemPct: number;
  cotacao: number | null;
  /** posição do usuário (ou do cliente, com o consultor); null = não tem o ativo */
  posicao: { pm: number | null; quantidade: number } | null;
}

export interface LinhaCenario {
  metodo: MetodoCenario;
  rotulo: string;
  premissasTexto: string;
  /** R$ com 2 casas; null = "—" */
  resultado: number | null;
  /** inteiro com sinal; null sem resultado ou sem cotação */
  vsCotacaoPct: number | null;
  /** R$ com 2 casas */
  comMargem: number | null;
  motivoSemResultado: string | null;
  /** 'usa DPA em conferência' (texto pronto) ou null */
  usaDadoEmConferencia: string | null;
}

export interface BarrasCenario {
  /** fim da escala (mesma para todas as barras, a partir de zero); 0 sem nenhum resultado */
  escalaMax: number;
  cotacao: number | null;
  itens: Array<
    Pick<LinhaCenario, 'metodo' | 'rotulo' | 'resultado' | 'comMargem'> & {
      motivo: string | null;
    }
  >;
}

export interface SuaPosicaoCenario {
  classe: ClasseCenario;
  quantidade: number;
  pm: number | null;
  /** P/L sobre custo (1 casa) na ação; P/VP sobre custo (2 casas) no FII */
  multiploSobreCusto: number | null;
  /** yield/rendimento sobre custo, % com 1 casa */
  yieldSobreCustoPct: number | null;
  /** o provento usado está em conferência (selo) */
  proventoEmConferencia: boolean;
}

export interface MetaRendaCenario {
  rendaMensal: number;
  rend12m: number;
  cotas: number;
  custo: number;
  faltam: number;
  quantidade: number;
  /** objetivo do Planejamento: cotas × cotação (sempre > 0) */
  target: number;
  /** já disponível: min(posição, cotas) × cotação */
  available: number;
  cotacao: number;
}

export interface SaidaCenarios {
  linhas: LinhaCenario[];
  barras: BarrasCenario;
  suaPosicao: SuaPosicaoCenario | null;
  /** só FII; null sem rendimento, sem renda válida ou sem cotação */
  metaRenda: MetaRendaCenario | null;
  nenhumResultado: boolean;
  /** valores efetivos usados (para a tela e o salvar) */
  efetivos: Partial<Record<CampoDadoCenario, number | null>>;
}

function finito(x: number | null | undefined): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function fmt(x: number | null | undefined, casas: number): string {
  return finito(x) ? formatarNumeroBR(x, casas) : '—';
}

function rotuloCurto(campo: keyof typeof T.rotulosCurtos): string {
  return T.rotulosCurtos[campo];
}

interface Dado {
  valor: number | null;
  editado: boolean;
  exibicao: ExibicaoConferenciaTela | null;
}

function lerDado(e: EntradaMontarCenarios, campo: CampoDadoCenario): Dado {
  const exib = e.base.conferencias[campo] ?? null;
  if (Object.prototype.hasOwnProperty.call(e.dadosEditados, campo)) {
    const v = e.dadosEditados[campo];
    return { valor: finito(v) ? v : null, editado: true, exibicao: exib };
  }
  const b = e.base.valores[campo];
  return {
    valor: finito(b) ? arredondar(b, CASAS_CAMPO[campo]) : null,
    editado: false,
    exibicao: exib,
  };
}

/** Motivo de um dado do ativo que impede a conta; null = ok. */
function motivoDado(
  campo: CampoDadoCenario,
  d: Dado,
  naoPositivo: string,
  semValorConferencia?: string,
): string | null {
  if (d.valor === null) {
    if (!d.editado && d.exibicao === 'ocultar') {
      return (
        semValorConferencia ?? formatarTexto(T.motivos.emConferencia, { campo: rotuloCurto(campo) })
      );
    }
    return formatarTexto(T.motivos.faltaDado, { campo: rotuloCurto(campo) });
  }
  if (d.valor <= 0) return naoPositivo;
  return null;
}

interface Premissa {
  valor: number | null;
  motivo: string | null;
}

function lerPremissa(
  e: EntradaMontarCenarios,
  nome: NomePremissa,
  vazio: string = formatarTexto(T.motivos.faltaDado, { campo: rotuloCurto(nome) }),
): Premissa {
  const bruto = e.premissas[nome];
  if (bruto === null || bruto === undefined) return { valor: null, motivo: vazio };
  const v = validarPremissa(nome, bruto);
  if (v === null) {
    return {
      valor: null,
      motivo: formatarTexto(T.motivos.premissaForaDoLimite, { campo: rotuloCurto(nome) }),
    };
  }
  return { valor: v, motivo: null };
}

function usaConferencia(campos: Array<[CampoDadoCenario, Dado]>): string | null {
  const c = campos.find(([, d]) => !d.editado && d.exibicao === 'selo' && d.valor !== null);
  return c ? formatarTexto(T.motivos.usaConferencia, { campo: rotuloCurto(c[0]) }) : null;
}

interface Calculo {
  metodo: MetodoCenario;
  premissasTexto: string;
  bruto: number | null;
  motivo: string | null;
  usaDadoEmConferencia: string | null;
}

function primeiro(...motivos: Array<string | null>): string | null {
  return motivos.find((m) => m !== null) ?? null;
}

function calcularAcao(e: EntradaMontarCenarios): Calculo[] {
  const lpa = lerDado(e, 'lpa');
  const vpa = lerDado(e, 'vpa');
  const dpa = lerDado(e, 'dpa');
  const y = lerPremissa(e, 'yieldPct');
  const pl = lerPremissa(e, 'plAlvo', T.motivos.plVazio);
  const g = lerPremissa(e, 'gPct');
  const k = lerPremissa(e, 'kPct');
  const mLpa = motivoDado('lpa', lpa, T.motivos.lpaNaoPositivo);
  const mVpa = motivoDado('vpa', vpa, T.motivos.vpaNaoPositivo);
  const mDpa = motivoDado('dpa', dpa, T.motivos.dpaZero);
  const kg =
    g.valor !== null && k.valor !== null && k.valor <= g.valor ? T.motivos.kMenorOuIgualG : null;

  const mBazin = primeiro(mDpa, y.motivo);
  const mGraham = primeiro(mLpa, mVpa);
  const mMult = primeiro(mLpa, pl.motivo);
  const mGordon = primeiro(mDpa, g.motivo, k.motivo, kg);
  return [
    {
      metodo: 'bazin',
      premissasTexto: formatarTexto(T.premissasTexto.bazin, {
        valor: fmt(dpa.valor, 2),
        premissa: fmt(y.valor ?? e.premissas.yieldPct, 1),
      }),
      bruto: mBazin ? null : bazin(dpa.valor, y.valor as number),
      motivo: mBazin,
      usaDadoEmConferencia: usaConferencia([['dpa', dpa]]),
    },
    {
      metodo: 'graham',
      premissasTexto: formatarTexto(T.premissasTexto.graham, {
        valor: fmt(lpa.valor, 2),
        premissa: fmt(vpa.valor, 2),
      }),
      bruto: mGraham ? null : graham(lpa.valor, vpa.valor),
      motivo: mGraham,
      usaDadoEmConferencia: usaConferencia([
        ['lpa', lpa],
        ['vpa', vpa],
      ]),
    },
    {
      metodo: 'multiplo',
      premissasTexto: formatarTexto(T.premissasTexto.multiplo, {
        premissa: fmt(pl.valor ?? e.premissas.plAlvo, 1),
        valor: fmt(lpa.valor, 2),
      }),
      bruto: mMult ? null : multiploAlvo(pl.valor, lpa.valor),
      motivo: mMult,
      usaDadoEmConferencia: usaConferencia([['lpa', lpa]]),
    },
    {
      metodo: 'gordon',
      premissasTexto: formatarTexto(T.premissasTexto.gordon, {
        valor: fmt(dpa.valor, 2),
        premissa: fmt(g.valor ?? e.premissas.gPct, 1),
        n: fmt(k.valor ?? e.premissas.kPct, 1),
      }),
      bruto: mGordon ? null : gordon(dpa.valor, g.valor as number, k.valor as number),
      motivo: mGordon,
      usaDadoEmConferencia: usaConferencia([['dpa', dpa]]),
    },
  ];
}

function calcularFii(e: EntradaMontarCenarios): Calculo[] {
  const rend = lerDado(e, 'rend12m');
  const vp = lerDado(e, 'vpCota');
  const y = lerPremissa(e, 'yieldPct');
  const pvp = lerPremissa(e, 'pvpAlvo');
  const mRend = motivoDado('rend12m', rend, T.motivos.rendimentoNaoPositivo);
  const mVp = motivoDado('vpCota', vp, T.motivos.vpNaoPositivo, T.motivos.vpConferencia);
  const mRenda = primeiro(mRend, y.motivo);
  const mPvp = primeiro(mVp, pvp.motivo);
  return [
    {
      metodo: 'rendaDesejada',
      premissasTexto: formatarTexto(T.premissasTexto.rendaDesejada, {
        valor: fmt(rend.valor, 3),
        premissa: fmt(y.valor ?? e.premissas.yieldPct, 1),
      }),
      bruto: mRenda ? null : rendaDesejada(rend.valor, y.valor as number),
      motivo: mRenda,
      usaDadoEmConferencia: usaConferencia([['rend12m', rend]]),
    },
    {
      metodo: 'pvpAlvo',
      premissasTexto: formatarTexto(T.premissasTexto.pvpAlvo, {
        premissa: fmt(pvp.valor ?? e.premissas.pvpAlvo, 2),
        valor: fmt(vp.valor, 2),
      }),
      bruto: mPvp ? null : pvpAlvo(pvp.valor, vp.valor),
      motivo: mPvp,
      usaDadoEmConferencia: usaConferencia([['vpCota', vp]]),
    },
  ];
}

function posicaoDe(
  e: EntradaMontarCenarios,
  efetivos: Partial<Record<CampoDadoCenario, number | null>>,
): SuaPosicaoCenario | null {
  const p = e.posicao;
  if (!p || !(p.quantidade > 0)) return null;
  const pm = finito(p.pm) && p.pm > 0 ? arredondar(p.pm, 2) : null;
  const fii = e.classe === 'fii';
  const campoProvento: CampoDadoCenario = fii ? 'rend12m' : 'dpa';
  const s = pm
    ? fii
      ? suaPosicao({ pm, vpCota: efetivos.vpCota ?? null, rend12m: efetivos.rend12m ?? null })
      : suaPosicao({ pm, lpa: efetivos.lpa ?? null, dpa: efetivos.dpa ?? null })
    : { multiploSobreCusto: null, yieldSobreCustoPct: null };
  const provento = lerDado(e, campoProvento);
  return {
    classe: e.classe,
    quantidade: p.quantidade,
    pm,
    multiploSobreCusto: finito(s.multiploSobreCusto)
      ? arredondar(s.multiploSobreCusto, fii ? 2 : 1)
      : null,
    yieldSobreCustoPct:
      finito(s.yieldSobreCustoPct) && (efetivos[campoProvento] ?? 0) > 0
        ? arredondar(s.yieldSobreCustoPct, 1)
        : null,
    proventoEmConferencia: !provento.editado && provento.exibicao === 'selo',
  };
}

function metaDe(
  e: EntradaMontarCenarios,
  rend12m: number | null,
  cotacao: number | null,
): MetaRendaCenario | null {
  if (e.classe !== 'fii') return null;
  const renda = lerPremissa(e, 'rendaMensal').valor;
  if (renda === null || !finito(rend12m) || rend12m <= 0 || !finito(cotacao) || cotacao <= 0) {
    return null;
  }
  const quantidade = e.posicao && e.posicao.quantidade > 0 ? e.posicao.quantidade : 0;
  const m = metaDeRenda(renda, rend12m, cotacao, quantidade);
  if (!m) return null;
  return {
    rendaMensal: renda,
    rend12m,
    cotas: m.cotas,
    custo: m.custo,
    faltam: m.faltam,
    quantidade,
    target: m.custo,
    available: arredondar(Math.min(quantidade, m.cotas) * cotacao, 2),
    cotacao,
  };
}

/** Monta as linhas, as barras, "Sua posição" e a Meta de renda. Nunca lança. */
export function montarCenarios(e: EntradaMontarCenarios): SaidaCenarios {
  const cotacao = finito(e.cotacao) && e.cotacao > 0 ? arredondar(e.cotacao, 2) : null;
  const margemOk = validarPremissa('margemPct', e.margemPct) !== null;
  const calculos = e.classe === 'fii' ? calcularFii(e) : calcularAcao(e);

  const linhas: LinhaCenario[] = calculos.map((c) => {
    const bruto = finito(c.bruto) ? c.bruto : null;
    const motivo = bruto === null ? (c.motivo ?? T.motivos.semResultado) : null;
    const resultado = bruto === null ? null : arredondar(bruto, 2);
    const vs = bruto !== null && cotacao !== null ? vsCotacaoPct(bruto, cotacao) : null;
    const margem = bruto !== null && margemOk ? comMargem(bruto, e.margemPct) : null;
    return {
      metodo: c.metodo,
      rotulo: T.metodos[c.metodo],
      premissasTexto: c.premissasTexto,
      resultado,
      vsCotacaoPct: finito(vs) ? arredondar(vs, 0) : null,
      comMargem: finito(margem) ? arredondar(margem, 2) : null,
      motivoSemResultado: motivo,
      usaDadoEmConferencia: bruto === null ? null : c.usaDadoEmConferencia,
    };
  });

  const efetivos: Partial<Record<CampoDadoCenario, number | null>> = {};
  for (const campo of CAMPOS_DADO[e.classe]) efetivos[campo] = lerDado(e, campo).valor;

  const resultados = linhas.map((l) => l.resultado).filter(finito);
  const escalaMax = resultados.length === 0 ? 0 : Math.max(cotacao ?? 0, ...resultados) * 1.08;

  return {
    linhas,
    barras: {
      escalaMax,
      cotacao,
      itens: linhas.map((l) => ({
        metodo: l.metodo,
        rotulo: l.rotulo,
        resultado: l.resultado,
        comMargem: l.comMargem,
        motivo: l.motivoSemResultado,
      })),
    },
    suaPosicao: posicaoDe(e, efetivos),
    metaRenda: metaDe(e, efetivos.rend12m ?? null, cotacao),
    nenhumResultado: resultados.length === 0,
    efetivos,
  };
}
