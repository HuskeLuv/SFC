/**
 * Etapa "eventos" do job scores: verifica os eventos corporativos de todo o universo (ações pela
 * contagem de ações da CVM; FIIs pelas cotas do Informe Mensal; e, nas janelas curtas de
 * janelasCotacaoEventos, pelo salto da cotação do COTAHIST) e regrava por símbolo só o que mudou.
 * Lê asset_corporate_actions só pelo repositório (leitura).
 */
import {
  dataUltimaContagem,
  deduplicarEventos,
  janelaCotacaoEvento,
  janelaCotacaoMesFii,
  verificarEventosCorporativos,
  type EventoVerificadoCompleto,
  type PregaoEvento,
  type ProventoEvento,
} from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import {
  pregoesEmJanelas,
  type JanelaPregoes,
} from '@/services/analiseAtivos/repositorio/cotacoes';
import {
  eventosCorporativosBrutos,
  rendimentosAuditadosValidos,
} from '@/services/analiseAtivos/repositorio/proventos';
import {
  chaveEvento,
  gravarEventosVerificados,
  lerEventosGravados,
} from '@/services/analiseAtivos/calculo/gravarDerivados';
import {
  agrupar,
  simbolosDoUniverso,
  type DadosBase,
} from '@/services/analiseAtivos/calculo/universo';
import type {
  EventoCorporativoBruto,
  JobContexto,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

export type EventoComCnpj = EventoVerificadoCompleto & { cnpj: string | null };

export interface ResultadoEventos {
  porSimbolo: Map<string, EventoComCnpj[]>;
  alterados: string[];
  descartadosNovos: string[];
  gravadas: number;
  contagem: Record<string, number>;
}

/**
 * Janelas de cotação que a verificação usa (backtest 18/10/2026): FII = mês do informe com
 * desdobramento ± 1 (data ex real do evento 'cvm_cotas'); ação = evento posterior à última contagem
 * de ações (confirmado pelo salto da cotação). Função pura.
 */
export function janelasCotacaoEventos(
  brutos: EventoCorporativoBruto[],
  dados: DadosBase,
  p: ScoringParams,
): JanelaPregoes[] {
  const u = dados.universo;
  const porSimbolo = agrupar(brutos, (b) => b.symbol);
  const out: JanelaPregoes[] = [];
  for (const symbol of simbolosDoUniverso(u)) {
    const cnpj = u.cnpjDoSimbolo.get(symbol) ?? null;
    if (!cnpj) continue;
    if (u.classe.get(symbol) === 'fii') {
      for (const m of dados.fiiMensalPorCnpj.get(cnpj) ?? []) {
        if ((m.fatorDesdobramento ?? 0) > 1)
          out.push({ symbol, ...janelaCotacaoMesFii(m.refMonth) });
      }
      continue;
    }
    const ultima = dataUltimaContagem(dados.contagensPorCnpj.get(cnpj) ?? []);
    if (ultima === null) continue;
    for (const e of deduplicarEventos(porSimbolo.get(symbol) ?? [], p)) {
      if (e.dataEvento > ultima) out.push({ symbol, ...janelaCotacaoEvento(e.dataEvento) });
    }
  }
  return out;
}

/** Função pura: verifica os eventos de todos os símbolos do universo. */
export function verificarUniverso(
  brutos: EventoCorporativoBruto[],
  dados: DadosBase,
  p: ScoringParams,
  /**
   * pregões em torno dos eventos (janelasCotacaoEventos) e rendimentos auditados dos FIIs com
   * desdobramento; sem eles, só contagens/informes
   */
  extras: {
    pregoes?: ReadonlyMap<string, readonly PregaoEvento[]>;
    rendimentos?: ReadonlyMap<string, readonly ProventoEvento[]>;
  } = {},
): Map<string, EventoComCnpj[]> {
  const u = dados.universo;
  const porSimbolo = agrupar(brutos, (b) => b.symbol);
  const out = new Map<string, EventoComCnpj[]>();
  for (const symbol of simbolosDoUniverso(u)) {
    const cnpj = u.cnpjDoSimbolo.get(symbol) ?? null;
    const doSimbolo = porSimbolo.get(symbol) ?? [];
    const ehFii = u.classe.get(symbol) === 'fii';
    const meses = ehFii && cnpj ? (dados.fiiMensalPorCnpj.get(cnpj) ?? []) : [];
    const temDesdobramentoCvm = meses.some((m) => (m.fatorDesdobramento ?? 0) > 1);
    if (doSimbolo.length === 0 && !temDesdobramentoCvm) continue;
    const verificados = ehFii
      ? verificarEventosCorporativos(
          doSimbolo,
          [],
          p,
          meses.map((m) => ({
            refMonth: m.refMonth,
            cotas: m.cotas,
            fatorDesdobramento: m.fatorDesdobramento,
            pl: m.pl,
          })),
          symbol,
          { pregoes: extras.pregoes?.get(symbol), proventos: extras.rendimentos?.get(symbol) },
        )
      : verificarEventosCorporativos(
          doSimbolo,
          cnpj ? (dados.contagensPorCnpj.get(cnpj) ?? []) : [],
          p,
          undefined,
          symbol,
          { pregoes: extras.pregoes?.get(symbol) },
        );
    if (verificados.length > 0)
      out.set(
        symbol,
        verificados.map((e) => ({ ...e, cnpj })),
      );
  }
  return out;
}

export async function recalcularEventos(
  ctx: JobContexto,
  dados: DadosBase,
  opts: { gravar: boolean },
): Promise<ResultadoEventos> {
  const simbolos = simbolosDoUniverso(dados.universo);
  const brutos = await eventosCorporativosBrutos(ctx.prisma, simbolos);
  ctx.contar('linhasLidas', brutos.length);
  const janelas = janelasCotacaoEventos(brutos, dados, ctx.params);
  const pregoes = await pregoesEmJanelas(ctx.prisma, janelas);
  const fiisComDesdobramento = [
    ...new Set(
      janelas.filter((j) => dados.universo.classe.get(j.symbol) === 'fii').map((j) => j.symbol),
    ),
  ];
  const rendimentos = await rendimentosAuditadosValidos(ctx.prisma, fiisComDesdobramento);
  const porSimbolo = verificarUniverso(brutos, dados, ctx.params, { pregoes, rendimentos });

  const gravados = await lerEventosGravados(ctx.prisma);
  const chavesGravadas = new Map<string, string[]>();
  const descartadosAntes = new Set<string>();
  for (const g of gravados) {
    chavesGravadas.set(g.symbol, [...(chavesGravadas.get(g.symbol) ?? []), chaveEvento(g)]);
    if (g.status === 'descartado')
      descartadosAntes.add(`${g.symbol}|${g.dataEvento}|${g.fator.toFixed(8)}`);
  }
  const universo = new Set(simbolos);
  const alterados: string[] = [];
  for (const s of new Set([...simbolos, ...chavesGravadas.keys()])) {
    const novas = (porSimbolo.get(s) ?? []).map(chaveEvento).sort().join('\n');
    const antigas = [...(chavesGravadas.get(s) ?? [])].sort().join('\n');
    if (novas !== antigas || !universo.has(s)) alterados.push(s);
  }

  const descartadosNovos: string[] = [];
  const contagem: Record<string, number> = {};
  for (const evs of porSimbolo.values()) {
    for (const e of evs) {
      contagem[e.status] = (contagem[e.status] ?? 0) + 1;
      if (
        e.status === 'descartado' &&
        !descartadosAntes.has(`${e.symbol}|${e.dataEvento}|${e.fator.toFixed(8)}`)
      ) {
        descartadosNovos.push(`${e.symbol} ${e.dataEvento} ×${e.fator}`);
      }
    }
  }
  if (descartadosNovos.length > 0 && gravados.length > 0) {
    ctx.alertar({
      codigo: 'evento_descartado_novo',
      nivel: 'info',
      mensagem: `${descartadosNovos.length} evento(s) corporativo(s) descartado(s) pela razão de ações da CVM`,
      ref: descartadosNovos.slice(0, 20).join('; '),
    });
  }

  let gravadas = 0;
  if (opts.gravar && ctx.aplicar && alterados.length > 0) {
    const linhas = alterados.flatMap((s) => porSimbolo.get(s) ?? []);
    gravadas = await gravarEventosVerificados(ctx.prisma, alterados, linhas);
    ctx.contar('linhasGravadas', gravadas);
  }
  return { porSimbolo, alterados, descartadosNovos, gravadas, contagem };
}
