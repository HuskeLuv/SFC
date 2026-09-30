/**
 * Etapa "eventos" do job scores: verifica os eventos corporativos de todo o universo (ações pela
 * contagem de ações da CVM; FIIs pelas cotas do Informe Mensal) e regrava por símbolo só o que mudou.
 * Lê asset_corporate_actions só pelo repositório (leitura).
 */
import {
  verificarEventosCorporativos,
  type EventoVerificadoCompleto,
} from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import { eventosCorporativosBrutos } from '@/services/analiseAtivos/repositorio/proventos';
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

/** Função pura: verifica os eventos de todos os símbolos do universo. */
export function verificarUniverso(
  brutos: EventoCorporativoBruto[],
  dados: DadosBase,
  p: ScoringParams,
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
        )
      : verificarEventosCorporativos(
          doSimbolo,
          cnpj ? (dados.contagensPorCnpj.get(cnpj) ?? []) : [],
          p,
          undefined,
          symbol,
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
  const porSimbolo = verificarUniverso(brutos, dados, ctx.params);

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
