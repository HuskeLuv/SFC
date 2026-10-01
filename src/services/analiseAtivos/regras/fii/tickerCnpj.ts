/**
 * Mapa ticker ↔ CNPJ de FIIs (regras 20 e 27; decisão 14). Funções puras.
 *
 * Chave = CNPJ. O universo é a lista pública da B3 (nunca `Mercado_Negociacao_Bolsa = S`: 298 fundos
 * "S" não estão na lista). Ordem de casamento:
 *   1. manual (tickersManuais, com motivo) — conferido;
 *   2. CNPJ informado pela própria B3 no detalhe do fundo (GetDetailFund) — origem 'b3_cnpj'
 *      (extensão desta fatia; ver pendências: a união TickerFii['origem'] da fatia 0 não tem esse
 *      valor);
 *   3. ISIN COMPLETO igual ao Codigo_ISIN do informe, com 1 CNPJ ativo — 'b3_isin';
 *   4. nome normalizado (igual; depois Jaccard ≥ 0,6 com folga ≥ 0,15) — 'b3_nome'.
 * O PREFIXO do ISIN nunca decide nem desempata (25 colisões; BTCI11 tem ISIN BRFEXCCTF007; TRXF11
 * tem o mesmo ISIN completo em 2 CNPJs).
 *
 * Conferência (regra 20): valor de mercado (cotação × cotas) ÷ PL dentro de
 * params.sanidade.fii.conferenciaValorMercadoSobrePl. b3_nome só fica conferido com 'ok'; b3_isin e
 * b3_cnpj sem cotação ficam conferidos (motivo *_sem_cotacao); qualquer um 'divergente' ⇒ não
 * conferido + alerta.
 */
import { normalizarCnpj } from '@/services/analiseAtivos/regras/comum/cnpj';
import type { AlertaJob, ScoringParams, TickerFii } from '@/services/analiseAtivos/tipos';

export type OrigemTickerFii = TickerFii['origem'] | 'b3_cnpj';
export type Conferencia = 'ok' | 'divergente' | 'sem_cotacao';

/** Fundo do Informe Mensal (candidato a casamento). */
export interface FundoCvm {
  cnpj: string;
  /** nomes vistos no informe (o atual primeiro) */
  nomes: string[];
  /** Codigo_ISIN do informe mais recente */
  isin: string | null;
  ultimoMes: string;
  bolsa: boolean;
  pl: number | null;
  cotas: number | null;
}

export interface ItemListaB3 {
  acronym: string;
  fundName: string;
  tradingName: string;
  isin?: string | null;
  /** CNPJ do detalhe da B3 (GetDetailFund), só dígitos ou formatado */
  cnpjB3?: string | null;
  /** 1º código de negociação do detalhe (ex.: 'HGLG11') */
  tradingCode?: string | null;
  /** tipo do fundo segundo a B3 ('FII', 'FIAGRO', …); null quando a lista não informa */
  typeName?: string | null;
}

export interface ResultadoCasamento {
  ticker: string;
  cnpj: string | null;
  origem: OrigemTickerFii | null;
  conferido: boolean;
  conferidoPor: string | null;
  conferencia: Conferencia | null;
  motivo: string;
}

// só palavras inteiras: 'IMOBILIARIO' não pode comer o começo de 'IMOBILIARIOS'
const PALAVRAS_GENERICAS =
  /\b(?:FUNDO DE INVESTIMENTO IMOBILIARIO|FUNDO DE INVESTIMENTO|FI IMOBILIARIO|IMOBILIARIO|RESPONSABILIDADE LIMITADA|RESP\.? LIMITADA|RESP\.? LTDA|FII|FI|RL|IMOB|LTDA|DE|DA|DO)(?![A-Z0-9])/g;

export function normalizarNomeFundo(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9. ]+/g, ' ')
    .replace(PALAVRAS_GENERICAS, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** CNPJ da B3/CVM (com ou sem máscara) no formato das tabelas: 14 dígitos. null se inválido. */
export const formatarCnpj = normalizarCnpj;

/**
 * Ticker da cota = sigla + '11'. Recibos/direitos (RTEL15, SPGM16…) que aparecem no tradingCode
 * não são a cota: resolvem para a raiz XXXX11 (relatório fiis-cvm §a).
 */
export function tickerDoItem(item: ItemListaB3): string {
  return `${item.acronym.trim().toUpperCase()}11`;
}

/** FIAGRO/FI-Infra (typeFund diferente de FII) nunca entram no mapa (decisão 14, regra 28). */
export function ehItemFii(item: ItemListaB3): boolean {
  const t = (item.typeName ?? '').trim().toUpperCase();
  return t === '' || t === 'FII';
}

export function conferirPorPlCotacao(
  pl: number | null,
  cotas: number | null,
  cotacao: number | null,
  p: ScoringParams,
): Conferencia {
  if (cotacao === null || !Number.isFinite(cotacao) || cotacao <= 0) return 'sem_cotacao';
  if (pl === null || cotas === null || !(pl > 0) || !(cotas > 0)) return 'divergente';
  const [min, max] = p.sanidade.fii.conferenciaValorMercadoSobrePl;
  const razao = (cotacao * cotas) / pl;
  return razao >= min && razao <= max ? 'ok' : 'divergente';
}

/** Linha do `geral` do Informe Mensal usada no casamento. */
export interface GeralCandidato {
  cnpj: string;
  refMonth: string;
  nome: string;
  isin: string | null;
  bolsa: boolean;
}

const MESES_CANDIDATO = 6;

function somarMeses(ref: string, n: number): string {
  const [a, m] = ref.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
}

/** Candidatos do Informe Mensal: 1 por CNPJ, com o mês mais recente e todos os nomes vistos. */
export function fundosCandidatos(
  geral: Iterable<GeralCandidato>,
  meses: Iterable<{ cnpj: string; refMonth: string; pl: number | null; cotas: number | null }>,
  mesesJanela = MESES_CANDIDATO,
): FundoCvm[] {
  const porCnpj = new Map<string, { g: GeralCandidato; nomes: Set<string> }>();
  for (const g of geral) {
    const atual = porCnpj.get(g.cnpj);
    if (!atual) porCnpj.set(g.cnpj, { g, nomes: new Set([g.nome]) });
    else {
      atual.nomes.add(g.nome);
      if (g.refMonth > atual.g.refMonth) atual.g = g;
    }
  }
  const ultimoComp = new Map<
    string,
    { refMonth: string; pl: number | null; cotas: number | null }
  >();
  for (const m of meses) {
    const a = ultimoComp.get(m.cnpj);
    if (!a || m.refMonth > a.refMonth) ultimoComp.set(m.cnpj, m);
  }
  const maxMes = [...porCnpj.values()].reduce((a, x) => (x.g.refMonth > a ? x.g.refMonth : a), '');
  const corte = maxMes ? somarMeses(maxMes, -(mesesJanela - 1)) : '';
  const out: FundoCvm[] = [];
  for (const { g, nomes } of porCnpj.values()) {
    if (g.refMonth < corte) continue;
    const c = ultimoComp.get(g.cnpj);
    out.push({
      cnpj: g.cnpj,
      nomes: [g.nome, ...[...nomes].filter((n) => n !== g.nome)],
      isin: g.isin,
      ultimoMes: g.refMonth,
      bolsa: g.bolsa,
      pl: c?.pl ?? null,
      cotas: c?.cotas ?? null,
    });
  }
  return out.sort((a, b) => a.cnpj.localeCompare(b.cnpj));
}

const tokens = (s: string) =>
  new Set(
    normalizarNomeFundo(s)
      .split(' ')
      .filter((w) => w.length > 2),
  );

function porNome(
  nomeB3: string,
  candidatos: FundoCvm[],
): { fundo: FundoCvm | null; motivo: string } {
  const alvo = normalizarNomeFundo(nomeB3);
  if (!alvo) return { fundo: null, motivo: 'nome_vazio' };
  const iguais = candidatos.filter((f) => f.nomes.some((n) => normalizarNomeFundo(n) === alvo));
  if (iguais.length === 1) return { fundo: iguais[0], motivo: 'nome_igual' };
  if (iguais.length > 1) return { fundo: null, motivo: 'nome_ambiguo' };

  const tb = tokens(nomeB3);
  if (tb.size === 0) return { fundo: null, motivo: 'nome_vazio' };
  let melhor: FundoCvm | null = null;
  let melhorJ = 0;
  let segundoJ = 0;
  for (const f of candidatos) {
    if (!f.bolsa) continue;
    let jFundo = 0;
    for (const n of f.nomes) {
      const tf = tokens(n);
      const inter = [...tb].filter((w) => tf.has(w)).length;
      jFundo = Math.max(jFundo, inter / (tb.size + tf.size - inter || 1));
    }
    if (jFundo > melhorJ) {
      segundoJ = melhorJ;
      melhorJ = jFundo;
      melhor = f;
    } else if (jFundo > segundoJ) {
      segundoJ = jFundo;
    }
  }
  if (melhor && melhorJ >= 0.6 && melhorJ - segundoJ >= 0.15) {
    return { fundo: melhor, motivo: `nome_parecido(j=${melhorJ.toFixed(2)})` };
  }
  return { fundo: null, motivo: melhorJ >= 0.6 ? 'nome_ambiguo' : 'sem_casamento' };
}

/**
 * Casa um item da lista B3 com um CNPJ do Informe Mensal.
 * @param manuais ticker → CNPJ (tickersManuais vigentes)
 * @param cotacoes ticker → última cotação crua (repositorio.cotacoes.resumoCotacoes)
 */
export function casarTickerCnpj(
  item: ItemListaB3,
  candidatos: FundoCvm[],
  manuais: Map<string, string>,
  p: ScoringParams,
  cotacoes: Map<string, number> = new Map(),
): ResultadoCasamento {
  const ticker = tickerDoItem(item);
  const base = { ticker, conferidoPor: null, conferencia: null };

  const manual = manuais.get(ticker);
  if (manual) {
    return {
      ...base,
      cnpj: manual,
      origem: 'manual',
      conferido: true,
      conferidoPor: 'manual:tickersManuais',
      motivo: 'manual',
    };
  }

  const porCnpj = new Map(candidatos.map((f) => [f.cnpj, f]));
  const cotacao = cotacoes.get(ticker) ?? null;
  const conferir = (
    f: FundoCvm,
    origem: Exclude<OrigemTickerFii, 'manual'>,
    motivo: string,
  ): ResultadoCasamento => {
    const c = conferirPorPlCotacao(f.pl, f.cotas, cotacao, p);
    const semCotacaoConfere = origem !== 'b3_nome';
    const conferido = c === 'ok' || (c === 'sem_cotacao' && semCotacaoConfere);
    return {
      ...base,
      cnpj: f.cnpj,
      origem,
      conferido,
      conferidoPor: c === 'ok' ? 'auto_pl_cotacao' : conferido ? `auto_${origem}` : null,
      conferencia: c,
      motivo: c === 'sem_cotacao' ? `${motivo};${origem.replace('b3_', '')}_sem_cotacao` : motivo,
    };
  };

  // 2. CNPJ do detalhe da B3
  const cnpjB3 = formatarCnpj(item.cnpjB3);
  if (cnpjB3) {
    const f = porCnpj.get(cnpjB3);
    if (f) return conferir(f, 'b3_cnpj', 'cnpj_b3');
    return {
      ...base,
      cnpj: cnpjB3,
      origem: 'b3_cnpj',
      conferido: false,
      motivo: 'cnpj_b3_sem_informe_recente',
    };
  }

  // 3. ISIN completo
  const isin = (item.isin ?? '').trim().toUpperCase();
  let motivoIsin = '';
  if (isin) {
    const mesmos = candidatos.filter((f) => f.isin === isin);
    if (mesmos.length === 1) return conferir(mesmos[0], 'b3_isin', 'isin_completo');
    motivoIsin = mesmos.length > 1 ? 'isin_ambiguo;' : 'isin_sem_candidato;';
  }

  // 4. nome
  const r = porNome(item.fundName, candidatos);
  if (r.fundo) return conferir(r.fundo, 'b3_nome', motivoIsin + r.motivo);
  return {
    ...base,
    cnpj: null,
    origem: null,
    conferido: false,
    motivo: motivoIsin + r.motivo,
  };
}

// ---------------------------------------------------------------------------------------------
// Vigência (FiiTickerMap)
// ---------------------------------------------------------------------------------------------

export interface LinhaMapa {
  id: string;
  ticker: string;
  cnpj: string;
  validFrom: string;
  validTo: string | null;
  origem: string;
  conferido: boolean;
  conferidoPor: string | null;
  motivo: string | null;
  nomeB3: string | null;
}

export interface CasamentoParaMapa extends ResultadoCasamento {
  nomeB3: string | null;
  razaoSocialB3: string | null;
  isin: string | null;
}

export interface TickerHistorico {
  ticker: string;
  cnpj: string;
  validFrom: string | null;
  validTo: string;
  motivo: string;
}

export interface NovaLinhaMapa {
  ticker: string;
  cnpj: string;
  validFrom: string;
  validTo: string | null;
  origem: OrigemTickerFii;
  conferido: boolean;
  conferidoPor: string | null;
  nomeB3: string | null;
  razaoSocialB3: string | null;
  isin: string | null;
  motivo: string;
}

export interface PlanoMapa {
  abrir: NovaLinhaMapa[];
  fechar: Array<{ id: string; ticker: string; validTo: string }>;
  atualizar: Array<{
    id: string;
    conferido: boolean;
    conferidoPor: string | null;
    motivo: string;
    nomeB3: string | null;
    razaoSocialB3: string | null;
    isin: string | null;
    origem: OrigemTickerFii;
    /** só na migração do formato (máscara ⇒ 14 dígitos) do mesmo CNPJ */
    cnpj?: string;
  }>;
  alertas: AlertaJob[];
  semCasamento: string[];
}

function diaAnterior(d: string): string {
  const t = new Date(`${d}T00:00:00Z`).getTime() - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Compara o mapa atual com os casamentos da lista B3 de hoje.
 * - ticker novo ⇒ abre (validFrom = validFromNovo(cnpj) ?? hoje) + alerta 'fii_sigla_nova';
 * - mesmo CNPJ ⇒ atualiza conferência/nome;
 * - CNPJ diferente ⇒ fecha o antigo (validTo = ontem) e abre o novo (validFrom = hoje) + alerta;
 * - ticker vigente fora da lista ⇒ fecha + alerta 'fii_sigla_sumida'; se o CNPJ reaparece com
 *   outra sigla ⇒ alerta 'fii_sigla_trocada' (IRDM11 → IRIM11);
 * - sem casamento: mantém o vigente (se houver) e alerta.
 * - históricos manuais (ticker que saiu da B3, com validTo) entram fechados se o ticker não tem
 *   nenhuma linha.
 * Trava: lista B3 com menos de 80% dos vigentes ⇒ não fecha nada (lista truncada), alerta erro.
 */
export function reconciliarMapa(
  linhas: LinhaMapa[],
  casamentos: CasamentoParaMapa[],
  hoje: string,
  opts: {
    validFromNovo?: (cnpj: string) => string | null;
    historicosManuais?: TickerHistorico[];
  } = {},
): PlanoMapa {
  const plano: PlanoMapa = { abrir: [], fechar: [], atualizar: [], alertas: [], semCasamento: [] };
  const vigentes = new Map(linhas.filter((l) => l.validTo === null).map((l) => [l.ticker, l]));
  const tickersComLinha = new Set(linhas.map((l) => l.ticker));
  const naLista = new Set(casamentos.map((c) => c.ticker));
  const listaTruncada = vigentes.size > 0 && naLista.size < vigentes.size * 0.8;
  if (listaTruncada) {
    plano.alertas.push({
      codigo: 'fii_lista_b3_truncada',
      nivel: 'erro',
      mensagem: `lista B3 com ${naLista.size} FIIs para ${vigentes.size} vigentes; nada foi fechado`,
    });
  }
  const ontem = diaAnterior(hoje);

  const novaLinha = (c: CasamentoParaMapa, validFrom: string): NovaLinhaMapa => ({
    ticker: c.ticker,
    cnpj: c.cnpj!,
    validFrom,
    validTo: null,
    origem: c.origem!,
    conferido: c.conferido,
    conferidoPor: c.conferidoPor,
    nomeB3: c.nomeB3,
    razaoSocialB3: c.razaoSocialB3,
    isin: c.isin,
    motivo: c.motivo,
  });

  for (const c of casamentos) {
    const atual = vigentes.get(c.ticker);
    if (!c.cnpj) {
      plano.semCasamento.push(c.ticker);
      plano.alertas.push({
        codigo: 'fii_sem_casamento',
        nivel: atual ? 'info' : 'aviso',
        mensagem: atual
          ? `${c.ticker} sem casamento hoje (${c.motivo}); mantido o CNPJ ${atual.cnpj}`
          : `${c.ticker} sem casamento com CNPJ da CVM (${c.motivo})`,
        ref: c.ticker,
      });
      continue;
    }
    if (c.conferencia === 'divergente') {
      plano.alertas.push({
        codigo: 'fii_conferencia_divergente',
        nivel: 'aviso',
        mensagem: `${c.ticker} → ${c.cnpj} (${c.origem}): valor de mercado/PL fora da faixa`,
        ref: c.ticker,
      });
    }
    if (!atual) {
      const vf = opts.validFromNovo?.(c.cnpj) ?? hoje;
      plano.abrir.push(novaLinha(c, vf < hoje ? vf : hoje));
      plano.alertas.push({
        codigo: 'fii_sigla_nova',
        nivel: 'info',
        mensagem: `${c.ticker} → ${c.cnpj} (${c.origem})`,
        ref: c.ticker,
      });
      continue;
    }
    if (normalizarCnpj(atual.cnpj) === c.cnpj) {
      // mesmo fundo; CNPJ gravado com máscara (antes do formato único) é migrado no lugar
      const migrarCnpj = atual.cnpj !== c.cnpj;
      // manual nunca é rebaixado por um casamento automático
      const origem = atual.origem === 'manual' ? 'manual' : c.origem!;
      const conferido = atual.origem === 'manual' ? atual.conferido : c.conferido;
      const conferidoPor = atual.origem === 'manual' ? atual.conferidoPor : c.conferidoPor;
      if (
        migrarCnpj ||
        origem !== atual.origem ||
        conferido !== atual.conferido ||
        conferidoPor !== atual.conferidoPor ||
        c.nomeB3 !== atual.nomeB3 ||
        c.motivo !== atual.motivo
      ) {
        plano.atualizar.push({
          id: atual.id,
          origem,
          conferido,
          conferidoPor,
          motivo: c.motivo,
          nomeB3: c.nomeB3,
          razaoSocialB3: c.razaoSocialB3,
          isin: c.isin,
          ...(migrarCnpj ? { cnpj: c.cnpj } : {}),
        });
      }
      continue;
    }
    // CNPJ trocou
    if (atual.validFrom >= hoje) {
      plano.atualizar.push({
        id: atual.id,
        origem: c.origem!,
        conferido: c.conferido,
        conferidoPor: c.conferidoPor,
        motivo: `${c.motivo};cnpj_corrigido_no_dia(${atual.cnpj})`,
        nomeB3: c.nomeB3,
        razaoSocialB3: c.razaoSocialB3,
        isin: c.isin,
      });
    } else {
      plano.fechar.push({ id: atual.id, ticker: atual.ticker, validTo: ontem });
      plano.abrir.push(novaLinha(c, hoje));
    }
    plano.alertas.push({
      codigo: 'fii_cnpj_trocado',
      nivel: 'aviso',
      mensagem: `${c.ticker}: CNPJ ${atual.cnpj} → ${c.cnpj}`,
      ref: c.ticker,
    });
  }

  if (!listaTruncada) {
    const cnpjsNovos = new Map(plano.abrir.map((a) => [a.cnpj, a.ticker]));
    for (const [ticker, l] of vigentes) {
      if (naLista.has(ticker)) continue;
      plano.fechar.push({ id: l.id, ticker, validTo: ontem });
      const sucessor = cnpjsNovos.get(l.cnpj);
      plano.alertas.push(
        sucessor
          ? {
              codigo: 'fii_sigla_trocada',
              nivel: 'aviso',
              mensagem: `${ticker} → ${sucessor} (mesmo CNPJ ${l.cnpj})`,
              ref: ticker,
            }
          : {
              codigo: 'fii_sigla_sumida',
              nivel: 'aviso',
              mensagem: `${ticker} (${l.cnpj}) saiu da lista B3; vigência fechada`,
              ref: ticker,
            },
      );
    }
  }

  for (const h of opts.historicosManuais ?? []) {
    if (tickersComLinha.has(h.ticker) || naLista.has(h.ticker)) continue;
    const vf = h.validFrom ?? opts.validFromNovo?.(h.cnpj) ?? h.validTo;
    plano.abrir.push({
      ticker: h.ticker,
      cnpj: h.cnpj,
      validFrom: vf,
      validTo: h.validTo,
      origem: 'manual',
      conferido: true,
      conferidoPor: 'manual:tickersManuais',
      nomeB3: null,
      razaoSocialB3: null,
      isin: null,
      motivo: h.motivo,
    });
  }

  return plano;
}
