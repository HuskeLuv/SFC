/**
 * Semáforo e Índice MF da página do ativo (fatia B). Funções puras: recebem o AssetScore gravado
 * pela Fase 0 (códigos + números) e a linha do Quadro (estado do Índice, fonte única) e montam as
 * frases da tela com TEXTOS_ANALISE/TEXTOS_TELA. Nada de frase com '{' sobrando nem palavra
 * proibida (o teste varre).
 *
 * - Critério desligado (ativo=false nos params) continua visível: 'Não se aplica · critério
 *   desligado até a validação da fonte' e desligado=true.
 * - Variantes com frase própria: caixa líquido, EBITDA ≤ 0, PL ≤ 0 e P/L ≤ 0 (prejuízo) — status
 *   'nao_atende' ou 'atende' com frase factual, NUNCA 'sem dado'.
 * - Sem dado: 'Sem dado: <motivo legível>'.
 */
import { TEXTOS_ANALISE, formatarNumeroBR, formatarTexto } from '@/services/analiseAtivos/textos';
import {
  TEXTOS_TELA,
  motivoTela,
  motivosEstadoIndice,
  textoMotivo,
  textoNaoSeAplica,
  textoZeroRegra,
} from '@/services/analiseAtivos/textosTela';
import type {
  ComponenteIndiceTela,
  CriterioSemaforoTela,
  EstadoIndice,
  IndiceTopo,
  MotivoTela,
  StatusCriterioTela,
} from '@/types/analiseAtivosApi';

/** Check compacto gravado em AssetScore.checks (Fase 0). */
export interface CheckGravado {
  codigo: string;
  status: StatusCriterioTela;
  valor: number | null;
  referencia: number | [number, number] | null;
  provisorio?: boolean;
  motivo?: string;
}

/** Componente gravado em AssetScore.componentes (Fase 0, EstadoComponente). */
export interface ComponenteGravado {
  estado: 'calculado' | 'zero_regra' | 'ausente' | 'nao_se_aplica';
  nota?: number;
  metrica?: number;
  motivo?: string;
}

/** O que a página precisa do AssetScore mais recente. */
export interface ScoreTopo {
  regua: string;
  indiceMf: number | null;
  componentes: Record<string, ComponenteGravado>;
  pesosEfetivos: Record<string, number>;
  checks: CheckGravado[];
  criteriosAplicaveis: number;
  criteriosAtendidos: number;
  motivosIncompleto: string[];
}

/** Estado do Índice e motivos vindos da linha do Quadro (fonte única dos 5 estados). */
export interface LinhaIndiceTopo {
  estadoIndice: EstadoIndice;
  indiceMf: number | null;
  regua: string | null;
  motivosIncompleto: string[];
  componentesZeroRegra: string[];
  criteriosAtendidos: number | null;
  criteriosAplicaveis: number | null;
}

export const ORDEM_COMPONENTES = ['lucro', 'divida', 'rent', 'div', 'preco'] as const;
type NomeComp = (typeof ORDEM_COMPONENTES)[number];

/** Casas decimais do valor na frase de cada critério. */
const CASAS_CRITERIO: Record<string, number> = {
  lucros_consecutivos: 0,
  endividamento: 1,
  rentabilidade: 1,
  preco_historico: 0,
  dividendos: 2,
  renda_recorrente: 2,
  vacancia: 1,
  diversificacao_imoveis: 0,
  obrigacoes_pl: 1,
  preco_vp: 2,
  concentracao_cri: 1,
  inadimplencia: 1,
  diversificacao_cri: 0,
};

function casasDe(codigo: string): number {
  return CASAS_CRITERIO[codigo] ?? 1;
}

function fmtReferencia(ref: CheckGravado['referencia'], casas: number): string {
  if (ref === null || ref === undefined) return '—';
  if (Array.isArray(ref)) {
    return `${formatarNumeroBR(ref[0], casas)} a ${formatarNumeroBR(ref[1], casas)}`;
  }
  return formatarNumeroBR(ref, Number.isInteger(ref) ? 0 : casas);
}

/**
 * Valor da frase: com o número de casas do critério, mas com uma casa a mais quando o
 * arredondamento empataria com a referência (3,98% vs. referência 4% → '3,98', não '4,0').
 */
function fmtValor(c: CheckGravado): string {
  const v = c.valor as number;
  let casas = casasDe(c.codigo);
  const ref = typeof c.referencia === 'number' ? c.referencia : null;
  while (ref !== null && casas < 3 && v !== ref && fmtNum(v, casas) === fmtNum(ref, casas)) {
    casas += 1;
  }
  return c.codigo === 'preco_historico' ? formatarComSinal(v, casas) : formatarNumeroBR(v, casas);
}

function fmtNum(x: number, casas: number): string {
  return formatarNumeroBR(x, casas);
}

function formatarComSinal(x: number, casas: number): string {
  const base = formatarNumeroBR(Math.abs(x), casas);
  if (Number(base.replace(/\./g, '').replace(',', '.')) === 0) return base;
  return x > 0 ? `+${base}` : x < 0 ? `−${base}` : base;
}

function tituloCriterio(codigo: string): string {
  const mapa: Record<string, string> = TEXTOS_ANALISE.criterios;
  return mapa[codigo] ?? codigo;
}

/** Componente do Índice ao qual o critério pertence (para achar o motivo legível). */
const COMPONENTE_DO_CRITERIO: Record<string, NomeComp> = {
  lucros_consecutivos: 'lucro',
  endividamento: 'divida',
  rentabilidade: 'rent',
  preco_historico: 'preco',
  dividendos: 'div',
  renda_recorrente: 'div',
  obrigacoes_pl: 'divida',
  vacancia: 'rent',
  preco_vp: 'preco',
  concentracao_cri: 'divida',
  diversificacao_cri: 'rent',
};

function fraseCriterio(c: CheckGravado): { frase: string; desligado: boolean } {
  const f = TEXTOS_ANALISE.frases;
  const frases: Record<string, string> = f;
  const motivo = c.motivo;

  if (c.status === 'nao_se_aplica') {
    if (motivo === 'criterio_desligado' || motivo === 'sem_fonte_estruturada') {
      return { frase: TEXTOS_TELA.indice.criterioDesligado, desligado: true };
    }
    return { frase: motivo ? textoNaoSeAplica(motivo) : f.nao_se_aplica, desligado: false };
  }

  // Variantes com frase própria (nunca 'sem dado')
  if (c.codigo === 'endividamento' && motivo === 'caixa_liquido') {
    return { frase: f.endividamento_caixa_liquido, desligado: false };
  }
  if (c.codigo === 'endividamento' && motivo === 'ebitda_nao_positivo') {
    return { frase: f.endividamento_ebitda_negativo, desligado: false };
  }
  if (c.codigo === 'rentabilidade' && motivo === 'pl_nao_positivo') {
    return { frase: f.rentabilidade_pl_negativo, desligado: false };
  }
  if (
    c.codigo === 'preco_historico' &&
    (motivo === 'pl_negativo' || motivo === 'base_nao_positiva' || motivo === 'prejuizo')
  ) {
    return { frase: f.preco_historico_prejuizo, desligado: false };
  }

  if (c.status === 'sem_dado' || c.valor === null) {
    if (!motivo) return { frase: f.sem_dado, desligado: false };
    const comp = COMPONENTE_DO_CRITERIO[c.codigo];
    const texto = textoMotivo(comp ? `${comp}:${motivo}` : motivo);
    return {
      frase: formatarTexto(TEXTOS_TELA.ativo.semDadoComMotivo, { motivo: texto }),
      desligado: false,
    };
  }

  // Endividamento com dívida líquida ≤ 0 (valor negativo) é caixa líquido
  if (c.codigo === 'endividamento' && c.valor <= 0) {
    return { frase: f.endividamento_caixa_liquido, desligado: false };
  }

  const modelo = frases[c.codigo];
  if (!modelo) return { frase: f.sem_dado, desligado: false };
  return {
    frase: formatarTexto(modelo, {
      valor: fmtValor(c),
      referencia: fmtReferencia(c.referencia, casasDe(c.codigo)),
    }),
    desligado: false,
  };
}

/** Semáforo da tela, na ordem gravada (= ordem dos params). */
export function montarSemaforoTela(checks: readonly CheckGravado[]): CriterioSemaforoTela[] {
  return checks.map((c) => {
    const { frase, desligado } = fraseCriterio(c);
    return {
      codigo: c.codigo,
      titulo: tituloCriterio(c.codigo),
      status: c.status,
      frase,
      provisorio: c.provisorio === true,
      desligado,
    };
  });
}

function reguaTexto(regua: string | null): 'acao' | 'fii_tijolo' | 'fii_papel' {
  if (regua === 'fii_papel') return 'fii_papel';
  if (regua === 'fii_tijolo') return 'fii_tijolo';
  return 'acao';
}

function textoComponenteCalculado(
  nome: NomeComp,
  metrica: number | undefined,
  regua: string | null,
): string {
  const r = reguaTexto(regua);
  const frases: Record<string, string> = TEXTOS_TELA.ativo.frasesComponentes[r];
  if (typeof metrica !== 'number' || !Number.isFinite(metrica)) return '';
  if (r === 'acao' && nome === 'divida' && metrica <= 0) return frases.dividaCaixa;
  let valor: string;
  if (nome === 'lucro' || (r === 'fii_papel' && nome === 'rent')) valor = fmtNum(metrica, 0);
  else if (r === 'acao' && nome === 'preco') valor = formatarComSinal(metrica, 0);
  else if (nome === 'preco' || (r === 'acao' && nome === 'divida')) valor = fmtNum(metrica, 2);
  else valor = fmtNum(metrica, nome === 'div' ? 2 : 1);
  return formatarTexto(frases[nome], { valor });
}

/** Componentes do Índice (nota técnica 0–10, peso efetivo, estado) na ordem da fórmula. */
export function montarComponentes(score: ScoreTopo): ComponenteIndiceTela[] {
  const rotulos: Record<string, string> =
    TEXTOS_TELA.ativo.rotulosComponentes[reguaTexto(score.regua)];
  return ORDEM_COMPONENTES.filter((n) => score.componentes[n]).map((nome) => {
    const c = score.componentes[nome];
    const peso = score.pesosEfetivos[nome];
    let texto: string;
    if (c.estado === 'zero_regra') texto = textoZeroRegra(`${nome}:${c.motivo ?? ''}`);
    else if (c.estado === 'ausente') texto = textoMotivo(`${nome}:${c.motivo ?? 'outro'}`);
    else if (c.estado === 'nao_se_aplica') {
      texto =
        c.motivo === 'criterio_desligado' || c.motivo?.startsWith('decisao_')
          ? textoNaoSeAplica('criterio_desligado')
          : textoNaoSeAplica(c.motivo ?? 'fora_do_escopo');
    } else texto = textoComponenteCalculado(nome, c.metrica, score.regua);
    return {
      nome,
      rotulo: rotulos[nome] ?? nome,
      nota: c.estado === 'nao_se_aplica' ? null : typeof c.nota === 'number' ? c.nota : 0,
      estado: c.estado,
      peso: typeof peso === 'number' && Number.isFinite(peso) ? peso : null,
      texto,
    };
  });
}

/** Índice + caixa explicativa nos 5 estados. O estado vem da linha do Quadro (fonte única). */
export function montarIndiceTopo(linha: LinhaIndiceTopo, score: ScoreTopo | null): IndiceTopo {
  const estado = linha.estadoIndice;
  const t = TEXTOS_TELA.indice;
  const semNumero = estado === 'sem_score' || estado === 'fora_do_indice';
  const atendidos = linha.criteriosAtendidos ?? score?.criteriosAtendidos ?? null;
  const aplicaveis = linha.criteriosAplicaveis ?? score?.criteriosAplicaveis ?? null;

  let motivos: MotivoTela[];
  let caixa: IndiceTopo['caixaExplicativa'] = null;
  if (estado === 'incompleto') {
    const codigos = linha.motivosIncompleto.length
      ? linha.motivosIncompleto
      : (score?.motivosIncompleto ?? []);
    motivos = codigos.map(motivoTela);
    caixa = { titulo: t.incompletoTitulo, itens: [...new Set(motivos.map((m) => m.texto))] };
  } else if (estado === 'zero_regra') {
    const codigos = linha.componentesZeroRegra.length
      ? linha.componentesZeroRegra
      : ORDEM_COMPONENTES.filter((n) => score?.componentes[n]?.estado === 'zero_regra').map(
          (n) => `${n}:${score?.componentes[n]?.motivo ?? ''}`,
        );
    motivos = codigos.map((c) => ({ codigo: c, texto: textoZeroRegra(c) }));
    caixa = { titulo: t.zeroRegraTitulo, itens: [...new Set(motivos.map((m) => m.texto))] };
  } else {
    motivos = motivosEstadoIndice(estado);
  }

  let leitura: string;
  if (estado === 'sem_score') leitura = t.semScore;
  else if (estado === 'fora_do_indice') leitura = t.foraDoIndice;
  else if (atendidos !== null && aplicaveis !== null) {
    leitura = formatarTexto(t.criteriosAtendidos, { atendidos, aplicaveis });
  } else leitura = t.semScore;

  return {
    valor: semNumero ? null : (linha.indiceMf ?? score?.indiceMf ?? null),
    estado,
    regua: linha.regua ?? score?.regua ?? null,
    motivos,
    caixaExplicativa: caixa,
    leitura,
    componentes: score && !semNumero ? montarComponentes(score) : [],
    formula: TEXTOS_ANALISE.indice.formula,
    criteriosAtendidos: semNumero ? null : atendidos,
    criteriosAplicaveis: semNumero ? null : aplicaveis,
  };
}

/** Lê o JSON gravado de AssetScore (defensivo: o Json do Prisma é unknown). */
export function lerScoreGravado(row: {
  regua: string;
  indiceMf: number | null;
  componentes: unknown;
  pesosEfetivos: unknown;
  checks: unknown;
  criteriosAplicaveis: number;
  criteriosAtendidos: number;
  motivosIncompleto: string[];
}): ScoreTopo {
  const obj = (v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const componentes: Record<string, ComponenteGravado> = {};
  for (const [k, v] of Object.entries(obj(row.componentes))) {
    const c = obj(v);
    if (typeof c.estado === 'string') componentes[k] = c as unknown as ComponenteGravado;
  }
  const pesos: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(row.pesosEfetivos))) {
    if (typeof v === 'number') pesos[k] = v;
  }
  const checks = (Array.isArray(row.checks) ? row.checks : []).filter(
    (c): c is CheckGravado =>
      !!c && typeof c === 'object' && typeof (c as CheckGravado).codigo === 'string',
  );
  return {
    regua: row.regua,
    indiceMf: row.indiceMf,
    componentes,
    pesosEfetivos: pesos,
    checks,
    criteriosAplicaveis: row.criteriosAplicaveis,
    criteriosAtendidos: row.criteriosAtendidos,
    motivosIncompleto: row.motivosIncompleto,
  };
}
