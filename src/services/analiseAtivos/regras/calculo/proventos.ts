/**
 * Auditoria de proventos (regras 16 e 26 do relatório da Fase A; revisão da spec da Fase 0).
 *
 * Base: asset_dividend_history, só leitura, com os defeitos conhecidos:
 *  - BRAPI grava a data EX no campo `dataCom` (PETR4: ex 03/05/2024 gravada; data-com real 02/05);
 *  - YAHOO grava a data EX na coluna `date` e não tem pagamento (repositorio.proventos já converte
 *    pela convenção de params.sanidade.proventos.camposPorFonte);
 *  - repetição da BRAPI com outra data-com (PETR4 set/2024 2×) e, com o MESMO pagamento, a unique
 *    (symbol, date, tipo) + a soma do dividendService fazem 1 linha com valor em dobro (irreversível:
 *    só sinalizamos `possivel_soma_duplicada`).
 * Data-com real = pregão B3 anterior à data ex. Nunca usa o pagamento como fallback de data-com.
 * Ajuste a hoje POR EVENTO: valor ÷ Π eventos confirmados com data > data-com (MGLU3 2020 teve
 * proventos antes e depois do 4:1 no mesmo ano). Funções puras.
 */
import { pregaoAnterior } from '@/services/analiseAtivos/regras/comum/pregoes';
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type {
  CoberturaProventos,
  EventoCorporativoVerificado,
  ProventoAuditado,
  ProventoBruto,
  ScoringParams,
  Valor,
} from '@/services/analiseAtivos/tipos';

type TipoNormalizado = ProventoAuditado['tipoNormalizado'];
type EventoParaAjuste = Pick<
  EventoCorporativoVerificado,
  'dataEvento' | 'fator' | 'status' | 'anoBase'
>;

/** Provento auditado com o rastro que vai para AssetProventoAuditado. */
export interface ProventoAuditadoCompleto extends ProventoAuditado {
  source: string;
  tipoOriginal: string;
  dataExGravada: string | null;
  dataExOrigem: ProventoBruto['dataExOrigem'];
  valorAjustadoHoje: number;
}

const TIPOS_NORMALIZADOS: readonly TipoNormalizado[] = [
  'DIVIDENDO',
  'JCP',
  'RENDIMENTO',
  'AMORTIZACAO',
  'REST_CAP',
  'OUTRO',
];

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().trim();
}

const DIA_MS = 24 * 60 * 60 * 1000;
function ms(data: string): number {
  return Date.UTC(
    Number(data.slice(0, 4)),
    Number(data.slice(5, 7)) - 1,
    Number(data.slice(8, 10)),
  );
}
function diasEntre(a: string, b: string): number {
  return Math.abs(ms(a) - ms(b)) / DIA_MS;
}

/** Tipo pelo mapa de params (sem diferenciar acento/caixa); desconhecido ⇒ params.tipoDesconhecido. */
export function normalizarTipo(
  tipo: string,
  p: ScoringParams,
): { tipo: TipoNormalizado; conhecido: boolean } {
  const cfg = p.sanidade.proventos;
  const direto = cfg.mapaTipos[tipo];
  const alvo = semAcento(tipo);
  const achado =
    direto ?? Object.entries(cfg.mapaTipos).find(([k]) => semAcento(k) === alvo)?.[1] ?? null;
  if (achado && (TIPOS_NORMALIZADOS as readonly string[]).includes(achado)) {
    return { tipo: achado as TipoNormalizado, conhecido: true };
  }
  const fallback = (TIPOS_NORMALIZADOS as readonly string[]).includes(cfg.tipoDesconhecido)
    ? (cfg.tipoDesconhecido as TipoNormalizado)
    : 'OUTRO';
  return { tipo: fallback, conhecido: false };
}

/** Data-com real pela convenção da fonte ('ex' ⇒ pregão anterior à data gravada). */
export function dataComReal(
  dataExGravada: string | null,
  source: string,
  p: ScoringParams,
): string | null {
  if (!dataExGravada) return null;
  const conv = p.sanidade.proventos.convencaoDataCom[source] ?? 'ex';
  return conv === 'ex' ? pregaoAnterior(dataExGravada) : dataExGravada;
}

/** Π dos eventos confirmados com data > `data` (ajuste a hoje de um provento). */
function fatorApos(eventos: EventoParaAjuste[], data: string | null): number {
  if (!data) return 1;
  return eventos
    .filter((e) => e.status === 'confirmado' && e.dataEvento > data)
    .reduce((acc, e) => acc * e.fator, 1);
}

export function auditarProventos(
  brutos: ProventoBruto[],
  eventos: EventoParaAjuste[],
  p: ScoringParams,
  opts?: { classe?: 'acao' | 'fii' },
): ProventoAuditadoCompleto[] {
  const cfg = p.sanidade.proventos;
  const itens: ProventoAuditadoCompleto[] = brutos.map((b) => {
    const { tipo, conhecido } = normalizarTipo(b.tipo, p);
    const com = dataComReal(b.dataExGravada, b.source, p);
    const flags: string[] = [];
    if (!conhecido) flags.push('tipo_desconhecido');
    if (b.dataPagamento === null) flags.push('sem_data_pagamento');
    let status: ProventoAuditado['status'] = 'valido';
    const tiposClasse =
      opts?.classe === 'acao' ? cfg.tiposAcao : opts?.classe === 'fii' ? cfg.tiposFii : null;
    if (
      !conhecido ||
      tipo === 'OUTRO' ||
      cfg.tiposExcluidos.includes(tipo) ||
      (tiposClasse !== null && !tiposClasse.includes(tipo))
    ) {
      status = 'tipo_excluido';
    } else if (com === null) {
      status = 'sem_data_com';
    }
    const fator = fatorApos(eventos, com);
    return {
      origemId: b.id,
      symbol: b.symbol,
      source: b.source,
      tipoOriginal: b.tipo,
      tipoNormalizado: tipo,
      valor: b.valor,
      dataPagamento: b.dataPagamento,
      dataExGravada: b.dataExGravada,
      dataExOrigem: b.dataExOrigem,
      dataComReal: com,
      status,
      duplicataDe: null,
      fatorAjusteHoje: fator,
      valorAjustadoHoje: fator > 0 ? b.valor / fator : b.valor,
      flags,
    };
  });

  // Fonte secundária (YAHOO) só quando não há provento da preferida (BRAPI) do símbolo no ano
  if (cfg.fonteSecundariaSomenteSemPreferidaNoAno) {
    const anosPreferida = new Set(
      itens
        .filter((i) => i.source === cfg.fontePreferida && i.status === 'valido' && i.dataComReal)
        .map((i) => `${i.symbol}|${i.dataComReal!.slice(0, 4)}`),
    );
    for (const i of itens) {
      if (i.status !== 'valido' || i.source === cfg.fontePreferida || !i.dataComReal) continue;
      if (anosPreferida.has(`${i.symbol}|${i.dataComReal.slice(0, 4)}`)) {
        i.status = 'fonte_secundaria_descartada';
      }
    }
  }

  // Duplicatas: mesmo símbolo+tipo+valor, data-com diferente e pagamentos a ≤ N dias
  const validos = itens
    .filter((i) => i.status === 'valido')
    .sort(
      (a, b) =>
        (a.dataComReal ?? '').localeCompare(b.dataComReal ?? '') ||
        a.origemId.localeCompare(b.origemId),
    );
  for (let i = 0; i < validos.length; i++) {
    const a = validos[i];
    if (a.status !== 'valido') continue;
    for (let j = i + 1; j < validos.length; j++) {
      const b = validos[j];
      if (
        b.status !== 'valido' ||
        a.symbol !== b.symbol ||
        a.tipoNormalizado !== b.tipoNormalizado
      ) {
        continue;
      }
      if (Math.abs(a.valor - b.valor) >= 1e-8) continue;
      if (a.dataPagamento === null || b.dataPagamento === null) continue;
      const dias = diasEntre(a.dataPagamento, b.dataPagamento);
      if (a.dataComReal !== b.dataComReal) {
        if (dias <= cfg.duplicataJanelaPagamentoDias) {
          b.status = 'duplicata';
          b.duplicataDe = a.origemId;
          b.flags.push('duplicata_outra_data_com');
        }
      } else if (dias < cfg.trancheMinDiasEntrePagamentos) {
        // mesma data-com, mesmo valor e pagamentos próximos: não dá para separar tranche de repetição
        for (const x of [a, b])
          if (!x.flags.includes('tranche_ambigua')) x.flags.push('tranche_ambigua');
      }
    }
  }

  // Possível soma duplicada (1 linha com valor ≈ 2× outro provento do mesmo tipo no ano)
  const tol = cfg.somaDuplicadaTolPct / 100;
  const vivos = itens.filter((i) => i.status === 'valido' && i.dataComReal);
  for (const a of vivos) {
    const anoA = a.dataComReal!.slice(0, 4);
    const achou = vivos.some(
      (b) =>
        b !== a &&
        b.symbol === a.symbol &&
        b.tipoNormalizado === a.tipoNormalizado &&
        b.dataComReal!.slice(0, 4) === anoA &&
        b.valor > 0 &&
        Math.abs(a.valor / (2 * b.valor) - 1) <= tol,
    );
    if (achou) a.flags.push('possivel_soma_duplicada');
  }
  return itens;
}

type ProventoParaSoma = Pick<
  ProventoAuditado,
  'tipoNormalizado' | 'status' | 'dataComReal' | 'valor'
>;

/**
 * DPA do ano por data-com (só DIVIDENDO+JCP válidos). base 'fim_do_ano': na base de ações do fim do
 * exercício (÷ eventos confirmados após a data-com e já refletidos no fim do ano: anoBase ≤ ano);
 * 'hoje': na base de hoje (÷ todos os eventos confirmados após a data-com).
 */
export function dpaNoAno(
  proventos: ProventoParaSoma[],
  ano: number,
  base: 'fim_do_ano' | 'hoje',
  eventos: EventoParaAjuste[],
  tipos: readonly string[] = ['DIVIDENDO', 'JCP'],
): Valor<number> {
  const prefixo = String(ano);
  let soma = 0;
  for (const pr of proventos) {
    if (pr.status !== 'valido' || !pr.dataComReal || !tipos.includes(pr.tipoNormalizado)) continue;
    if (pr.dataComReal.slice(0, 4) !== prefixo) continue;
    const fator = eventos
      .filter(
        (e) =>
          e.status === 'confirmado' &&
          e.dataEvento > pr.dataComReal! &&
          (base === 'hoje' || e.anoBase <= ano),
      )
      .reduce((acc, e) => acc * e.fator, 1);
    soma += pr.valor / fator;
  }
  return ok(soma);
}

/** Data AAAA-MM-DD menos `meses` meses (dia limitado ao fim do mês). */
export function menosMeses(data: string, meses: number): string {
  const a = Number(data.slice(0, 4));
  const m = Number(data.slice(5, 7)) - 1 - meses;
  const d = Number(data.slice(8, 10));
  const alvoAno = a + Math.floor(m / 12);
  const alvoMes = ((m % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(alvoAno, alvoMes, Math.min(d, ultimoDia))).toISOString().slice(0, 10);
}

/**
 * Rendimento de 12 meses por data-com, janela de CALENDÁRIO (hoje − 12m, hoje] — nunca "os últimos
 * 12 registros" (regra 26). Ações: DIVIDENDO+JCP bruto; FII: RENDIMENTO+DIVIDENDO. Na base de hoje.
 */
export function rendimento12m(
  proventos: ProventoParaSoma[],
  hoje: string,
  classe: 'acao' | 'fii',
  eventos: EventoParaAjuste[],
  p?: ScoringParams,
): Valor<number> {
  const tipos =
    classe === 'acao'
      ? (p?.sanidade.proventos.tiposAcao ?? ['DIVIDENDO', 'JCP'])
      : (p?.sanidade.proventos.tiposFii ?? ['RENDIMENTO', 'DIVIDENDO']);
  const meses = p?.sanidade.proventos.janelaMesesDy ?? 12;
  const de = menosMeses(hoje, meses);
  let soma = 0;
  for (const pr of proventos) {
    if (pr.status !== 'valido' || !pr.dataComReal || !tipos.includes(pr.tipoNormalizado)) continue;
    if (pr.dataComReal <= de || pr.dataComReal > hoje) continue;
    soma += pr.valor / fatorApos(eventos, pr.dataComReal);
  }
  return ok(soma);
}

/**
 * Zero × ausente (regra 1): sem nenhum provento na base, só é zero de verdade se o market_data_coverage
 * diz que a fonte foi consultada (EMPTY = sem provento; OK = consultado). FETCH_FAIL/GAP_QUEUED/sem
 * registro ⇒ ausente.
 */
export function valorProventosComCobertura(
  v: Valor<number>,
  temAlgumProvento: boolean,
  cobertura: CoberturaProventos,
): Valor<number> {
  if (temAlgumProvento || v.estado !== 'ok') return v;
  if (cobertura === 'EMPTY' || cobertura === 'OK') return ok(0);
  return ausente(
    cobertura === 'FETCH_FAIL' ? 'fonte_falhou' : 'sem_dado_fonte',
    cobertura ?? 'sem_cobertura',
  );
}

/** Campos de uma linha auditada que, se mudarem, exigem regravar o símbolo. */
export type ProventoGravadoChave = Pick<
  ProventoAuditadoCompleto,
  | 'origemId'
  | 'symbol'
  | 'source'
  | 'tipoOriginal'
  | 'tipoNormalizado'
  | 'valor'
  | 'dataPagamento'
  | 'dataExGravada'
  | 'dataComReal'
  | 'status'
  | 'duplicataDe'
  | 'fatorAjusteHoje'
  | 'flags'
>;

function chaveLinha(l: ProventoGravadoChave): string {
  return [
    l.origemId,
    l.source,
    l.tipoOriginal,
    l.tipoNormalizado,
    l.valor,
    l.dataPagamento ?? '',
    l.dataExGravada ?? '',
    l.dataComReal ?? '',
    l.status,
    l.duplicataDe ?? '',
    Math.round(l.fatorAjusteHoje * 1e10) / 1e10,
    [...l.flags].sort().join(','),
  ].join('|');
}

/** Impressão digital de um conjunto de linhas auditadas (independe da ordem). */
export function impressaoAuditoria(linhas: ProventoGravadoChave[]): string {
  return linhas.map(chaveLinha).sort().join('\n');
}

/**
 * Compara a auditoria recalculada com o que está gravado, POR SÍMBOLO (auditoria completa a cada
 * run — o Yahoo apaga/reinsere com id novo e o upsert da BRAPI muda valor sem mexer em createdAt, então
 * nada de incremental). `reescrever` = símbolos do universo cuja impressão mudou (inclui símbolo que
 * ficou sem linha); `orfaos` = símbolos gravados que saíram do universo.
 */
export function planejarReescritaProventos(
  novos: ProventoGravadoChave[],
  gravados: ProventoGravadoChave[],
  simbolos: string[],
): { reescrever: string[]; orfaos: string[] } {
  const agrupar = (ls: ProventoGravadoChave[]) => {
    const m = new Map<string, ProventoGravadoChave[]>();
    for (const l of ls) {
      const lista = m.get(l.symbol);
      if (lista) lista.push(l);
      else m.set(l.symbol, [l]);
    }
    return m;
  };
  const porNovo = agrupar(novos);
  const porGravado = agrupar(gravados);
  const universo = new Set(simbolos);
  const reescrever = simbolos.filter(
    (s) => impressaoAuditoria(porNovo.get(s) ?? []) !== impressaoAuditoria(porGravado.get(s) ?? []),
  );
  const orfaos = [...porGravado.keys()].filter((s) => !universo.has(s)).sort();
  return { reescrever: [...reescrever].sort(), orfaos };
}
