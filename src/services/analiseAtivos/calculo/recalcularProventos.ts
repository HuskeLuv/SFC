/**
 * Etapa "proventos" do job scores: auditoria COMPLETA de asset_dividend_history a cada run (lida só
 * pelo repositório; ~30 mil linhas no dev, ~100 mil em prod, < 30 MB) e reescrita apenas dos símbolos
 * cuja impressão digital mudou, apagando os órfãos. Nada de incremental por createdAt: o Yahoo apaga e
 * reinsere (ids novos) e o upsert da BRAPI muda valor sem mexer em createdAt.
 */
import {
  gravarProventosAuditados,
  lerProventosGravados,
  lerSimbolosProventosGravados,
} from '@/services/analiseAtivos/calculo/gravarDerivados';
import type { EventoComCnpj } from '@/services/analiseAtivos/calculo/recalcularEventos';
import {
  agrupar,
  simbolosDoUniverso,
  type DadosBase,
} from '@/services/analiseAtivos/calculo/universo';
import {
  auditarProventos,
  planejarReescritaProventos,
  type ProventoAuditadoCompleto,
} from '@/services/analiseAtivos/regras/calculo/proventos';
import {
  coberturaProventos,
  proventosBrutos,
} from '@/services/analiseAtivos/repositorio/proventos';
import type {
  CoberturaProventos,
  JobContexto,
  ProventoBruto,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

export interface ResultadoProventos {
  porSimbolo: Map<string, ProventoAuditadoCompleto[]>;
  cobertura: Map<string, CoberturaProventos>;
  /** lastCheckedAt por símbolo (frescor da base de proventos) */
  verificadoEm: Map<string, string | null>;
  reescritos: string[];
  orfaos: string[];
  gravadas: number;
  contagem: Record<string, number>;
  flags: Record<string, number>;
}

/** Função pura: audita os proventos de todos os símbolos (classe define RENDIMENTO só em FII). */
export function auditarUniverso(
  brutos: ProventoBruto[],
  eventos: Map<string, EventoComCnpj[]>,
  classe: Map<string, 'acao' | 'fii'>,
  p: ScoringParams,
): Map<string, ProventoAuditadoCompleto[]> {
  const out = new Map<string, ProventoAuditadoCompleto[]>();
  for (const [symbol, lista] of agrupar(brutos, (b) => b.symbol)) {
    out.set(
      symbol,
      auditarProventos(lista, eventos.get(symbol) ?? [], p, { classe: classe.get(symbol) }),
    );
  }
  return out;
}

/** Símbolos por lote: limita o pico de memória (brutos + gravados de um lote por vez). */
const LOTE_SIMBOLOS = 200;

export async function recalcularProventos(
  ctx: JobContexto,
  dados: DadosBase,
  eventos: Map<string, EventoComCnpj[]>,
  opts: { gravar: boolean },
): Promise<ResultadoProventos> {
  const simbolos = simbolosDoUniverso(dados.universo);
  const cobertura = await coberturaProventos(ctx.prisma, simbolos);
  const porSimbolo = new Map<string, ProventoAuditadoCompleto[]>();
  const contagem: Record<string, number> = {};
  const flags: Record<string, number> = {};
  const reescritos: string[] = [];
  let gravadas = 0;

  for (let i = 0; i < simbolos.length; i += LOTE_SIMBOLOS) {
    const lote = simbolos.slice(i, i + LOTE_SIMBOLOS);
    const brutos = await proventosBrutos(ctx.prisma, lote, undefined, ctx.params);
    ctx.contar('linhasLidas', brutos.length);
    const auditados = auditarUniverso(brutos, eventos, dados.universo.classe, ctx.params);
    const doLote = [...auditados.values()].flat();
    for (const [s, l] of auditados) porSimbolo.set(s, l);
    for (const a of doLote) {
      contagem[a.status] = (contagem[a.status] ?? 0) + 1;
      for (const f of a.flags) flags[f] = (flags[f] ?? 0) + 1;
    }
    const gravados = await lerProventosGravados(ctx.prisma, lote);
    const plano = planejarReescritaProventos(doLote, gravados, lote);
    reescritos.push(...plano.reescrever);
    if (opts.gravar && ctx.aplicar && plano.reescrever.length > 0) {
      const linhas = plano.reescrever.flatMap((s) => auditados.get(s) ?? []);
      gravadas += await gravarProventosAuditados(ctx.prisma, plano.reescrever, linhas, []);
    }
  }

  const universo = new Set(simbolos);
  const orfaos = (await lerSimbolosProventosGravados(ctx.prisma))
    .filter((s) => !universo.has(s))
    .sort();
  if (opts.gravar && ctx.aplicar && orfaos.length > 0) {
    await gravarProventosAuditados(ctx.prisma, [], [], orfaos);
  }
  if (gravadas > 0) ctx.contar('linhasGravadas', gravadas);

  if ((flags.possivel_soma_duplicada ?? 0) > 0) {
    ctx.alertar({
      codigo: 'proventos_possivel_soma_duplicada',
      nivel: 'info',
      mensagem: `${flags.possivel_soma_duplicada} provento(s) com valor ≈ 2× outro do mesmo tipo no ano`,
    });
  }
  if ((flags.tipo_desconhecido ?? 0) > 0) {
    ctx.alertar({
      codigo: 'proventos_tipo_desconhecido',
      nivel: 'aviso',
      mensagem: `${flags.tipo_desconhecido} provento(s) com tipo fora do mapa de params (tratados como OUTRO)`,
    });
  }
  return {
    porSimbolo,
    cobertura,
    verificadoEm: cobertura.verificadoEm,
    reescritos: reescritos.sort(),
    orfaos,
    gravadas,
    contagem,
    flags,
  };
}
