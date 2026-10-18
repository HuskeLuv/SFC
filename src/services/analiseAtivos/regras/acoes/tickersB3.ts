/**
 * Completa o cadastro de tickers de ações (FCA) com os tickers NEGOCIADOS na B3 (backtest 18/10/2026,
 * item A9). Função pura.
 *
 * O FCA é preenchido pela própria companhia e vem errado em empresas grandes: BTG (BPAC11) com código
 * "000000", CSN (CSNA3) "4030", CSN Mineração (CMIN3) "25585", MBRF (MBRF3) "ADR", C&A (CEAB3) e
 * Raízen (RAIZ4) com data de fim indevida, Brisanet (BRST3) e Grupo Multi (MLAS3) fora do mercado
 * 'Bolsa', Klabin e Alupar só com a unit. Sem cadastro, a companhia nem tem os balanços baixados.
 *
 * Só entra ticker negociado na B3 (COTAHIST lote padrão, negociado nos últimos 30 pregões, espécie de
 * ação ON/PN/unit) e SEMPRE num CNPJ que o próprio FCA do ano traz — nunca uma companhia nova, nunca
 * um segundo CNPJ para a mesma raiz. Ordem de casamento:
 *   1. fim_indevido — o FCA traz o MESMO código com Data_Fim_Negociacao, mas ele segue negociando;
 *   2. mercado_fca  — o FCA traz o MESMO código, mas com mercado diferente de 'Bolsa' (ou vazio);
 *   3. raiz_fca     — a raiz é de um ticker vigente do FCA (KLBN3/KLBN4 ao lado da KLBN11);
 *   4. mapa         — raiz no mapa EMISSOR_POR_RAIZ_B3 (código do FCA ilegível), e só se o CNPJ do
 *                     mapa está no FCA do ano e a raiz não é de outro CNPJ no FCA.
 * Raiz negociada sem nenhum dos quatro ⇒ alerta 'ticker_b3_sem_emissor' (candidata ao mapa).
 * As demais regras do universo (Quadro só com negociado nos últimos 30 pregões, baixa liquidez,
 * Fiagro, deslistada) continuam valendo depois, como para qualquer ticker do FCA.
 */
import { raizTicker } from '@/services/analiseAtivos/repositorio/conversao';
import {
  classeDoTicker,
  parseComposicaoUnit,
} from '@/services/analiseAtivos/regras/acoes/classeTitulo';
import type {
  CiaFca,
  LinhaFcaRejeitada,
  TituloFca,
} from '@/services/analiseAtivos/acoes/parserFca';
import type { AlertaJob, ClasseTitulo } from '@/services/analiseAtivos/tipos';

export interface EmissorDaRaiz {
  /** CNPJ (14 dígitos) do FCA */
  cnpj: string;
  /** por que o FCA não serve (o que a companhia preencheu) */
  motivo: string;
}

/**
 * Raiz B3 ⇒ CNPJ para companhias cujo FCA 2026 traz o código de negociação ilegível. Conferido no
 * backtest de 18/10/2026: CNPJ e razão social do FCA × nome de pregão do ClassifSetorial/COTAHIST.
 */
export const EMISSOR_POR_RAIZ_B3: Readonly<Record<string, EmissorDaRaiz>> = {
  BPAC: { cnpj: '30306294000145', motivo: 'BCO BTG PACTUAL: unit com código "000000" no FCA' },
  CSNA: { cnpj: '33042730000104', motivo: 'CIA SIDERURGICA NACIONAL: código "4030" no FCA' },
  CMIN: { cnpj: '08902291000115', motivo: 'CSN MINERAÇÃO: código "25585" no FCA' },
  MBRF: { cnpj: '03853896000140', motivo: 'MARFRIG GLOBAL FOODS (MBRF): código "ADR" no FCA' },
  OBTC: { cnpj: '59693110000129', motivo: 'ORANJEBTC: código "OBTC" sem sufixo no FCA' },
  AMAR: { cnpj: '61189288000189', motivo: 'MARISA LOJAS: código "022055" no FCA' },
  EQPA: {
    cnpj: '04895728000180',
    motivo: 'EQUATORIAL PARÁ: FCA ainda traz o código antigo (CELP3/5/6/7)',
  },
  EPAR: { cnpj: '42331462000131', motivo: 'EMBPAR PARTICIPAÇÕES: código "1545-8" no FCA' },
  LUXM: { cnpj: '92660570000126', motivo: 'TREVISA INVESTIMENTOS: código "8192" no FCA' },
  HAGA: { cnpj: '30540991000166', motivo: 'HAGA S.A.: código "2" no FCA (e sem a ON)' },
  NORD: { cnpj: '60884319000159', motivo: 'NORDON INDUSTRIAS METALURGICAS: código "1" no FCA' },
  PLAS: { cnpj: '51928174000150', motivo: 'PLASCAR PARTICIPACOES: código "B3" no FCA' },
  MAPT: { cnpj: '93828986000173', motivo: 'CEMEPE INVESTIMENTOS: código "713854" no FCA' },
};

/** Ticker do COTAHIST (AssetQuoteResumo) já filtrado: lote padrão e negociado nos últimos 30. */
export interface NegociadoB3 {
  symbol: string;
  /** ESPECI do COTAHIST ('ON NM', 'PN N2', 'UNT N2', 'CI'…) */
  especi: string | null;
}

export type RegraB3 = 'fim_indevido' | 'mercado_fca' | 'raiz_fca' | 'mapa';

export interface TickerCompletado {
  symbol: string;
  cnpj: string;
  regra: RegraB3;
}

export interface EntradaCompletarB3 {
  cias: Map<string, CiaFca>;
  titulos: TituloFca[];
  rejeitadas: LinhaFcaRejeitada[];
  ciasSemTicker: Map<string, CiaFca>;
}

export interface ResultadoCompletarB3 {
  cias: Map<string, CiaFca>;
  titulos: TituloFca[];
  completados: TickerCompletado[];
  alertas: AlertaJob[];
}

// ESPECI do COTAHIST: 'ON NM', 'PN N2', 'PNA N2' (BPAC5), 'PNB', 'UNT N2'
const RE_ESPECIE_ACAO = /^(ON|PN[A-H]?|UNT)\b/;
const MAX_ALERTAS_SEM_EMISSOR = 30;

/** Classe da linha do FCA comparável à classe pelo sufixo (ON/PN/UNIT). */
const classeCompativel = (classeFca: string, classe: ClasseTitulo) => classeFca === classe;

export function completarComB3(
  fca: EntradaCompletarB3,
  negociados: readonly NegociadoB3[],
  mapa: Readonly<Record<string, EmissorDaRaiz>> = EMISSOR_POR_RAIZ_B3,
): ResultadoCompletarB3 {
  const alertas: AlertaJob[] = [];
  const completados: TickerCompletado[] = [];
  const cias = new Map(fca.cias);
  const conhecida = (cnpj: string) => cias.has(cnpj) || fca.ciasSemTicker.has(cnpj);

  const abertos = new Map<string, TituloFca>();
  const fechados = new Map<string, TituloFca[]>();
  const cnpjsDaRaiz = new Map<string, Set<string>>();
  for (const t of fca.titulos) {
    if (t.dataFim) {
      fechados.set(t.symbol, [...(fechados.get(t.symbol) ?? []), t]);
      continue;
    }
    abertos.set(t.symbol, t);
    const raiz = raizTicker(t.symbol);
    cnpjsDaRaiz.set(raiz, (cnpjsDaRaiz.get(raiz) ?? new Set()).add(t.cnpj));
  }
  const rejeitadasPorCodigo = new Map<string, LinhaFcaRejeitada[]>();
  const rejeitadasPorCnpj = new Map<string, LinhaFcaRejeitada[]>();
  for (const r of fca.rejeitadas) {
    rejeitadasPorCodigo.set(r.codigo, [...(rejeitadasPorCodigo.get(r.codigo) ?? []), r]);
    rejeitadasPorCnpj.set(r.cnpj, [...(rejeitadasPorCnpj.get(r.cnpj) ?? []), r]);
  }

  /** linha do FCA da mesma companhia e classe (data de início e composição da unit) */
  const linhaDaClasse = (cnpj: string, classe: ClasseTitulo) =>
    (rejeitadasPorCnpj.get(cnpj) ?? []).find((r) => classeCompativel(r.classeFca, classe)) ?? null;

  const novos: TituloFca[] = [];
  const reabertos = new Set<TituloFca>();
  const semEmissor: string[] = [];
  const vistos = new Set<string>();
  for (const n of [...negociados].sort((a, b) => a.symbol.localeCompare(b.symbol))) {
    const symbol = n.symbol.trim().toUpperCase();
    if (vistos.has(symbol) || abertos.has(symbol)) continue;
    vistos.add(symbol);
    if (!RE_ESPECIE_ACAO.test((n.especi ?? '').trim())) continue;
    const classe = classeDoTicker(symbol);
    if (!classe) continue;
    const raiz = raizTicker(symbol);
    const donosDaRaiz = cnpjsDaRaiz.get(raiz);

    // 1. mesmo código no FCA, com fim de negociação, e a B3 segue negociando
    const fechadosDoCodigo = (fechados.get(symbol) ?? []).filter((t) => conhecida(t.cnpj));
    const cnpjsFechados = new Set(fechadosDoCodigo.map((t) => t.cnpj));
    if (cnpjsFechados.size === 1 && (!donosDaRaiz || donosDaRaiz.has(fechadosDoCodigo[0].cnpj))) {
      const t = fechadosDoCodigo.sort((a, b) =>
        (b.dataFim ?? '').localeCompare(a.dataFim ?? ''),
      )[0];
      reabertos.add(t);
      novos.push({ ...t, dataFim: null, origem: 'b3' });
      completados.push({ symbol, cnpj: t.cnpj, regra: 'fim_indevido' });
      continue;
    }

    // 2. mesmo código no FCA, mas fora do mercado 'Bolsa'
    const doCodigo = (rejeitadasPorCodigo.get(symbol) ?? []).filter(
      (r) => r.motivo === 'mercado' && !r.dataFim && conhecida(r.cnpj),
    );
    const cnpjsCodigo = new Set(doCodigo.map((r) => r.cnpj));
    if (cnpjsCodigo.size === 1 && (!donosDaRaiz || donosDaRaiz.has(doCodigo[0].cnpj))) {
      novos.push(titulo(symbol, classe, doCodigo[0].cnpj, doCodigo[0]));
      completados.push({ symbol, cnpj: doCodigo[0].cnpj, regra: 'mercado_fca' });
      continue;
    }

    // 3. raiz de um ticker vigente do FCA (uma companhia só)
    if (donosDaRaiz) {
      if (donosDaRaiz.size !== 1) {
        alertas.push({
          codigo: 'ticker_b3_raiz_ambigua',
          nivel: 'aviso',
          mensagem: `${symbol}: a raiz ${raiz} está em ${donosDaRaiz.size} CNPJs no FCA; não entra`,
          ref: symbol,
        });
        continue;
      }
      const [cnpj] = donosDaRaiz;
      novos.push(titulo(symbol, classe, cnpj, linhaDaClasse(cnpj, classe)));
      completados.push({ symbol, cnpj, regra: 'raiz_fca' });
      continue;
    }

    // 4. mapa curado (código ilegível no FCA)
    const doMapa = mapa[raiz];
    if (doMapa) {
      if (!conhecida(doMapa.cnpj)) {
        alertas.push({
          codigo: 'mapa_b3_sem_fca',
          nivel: 'aviso',
          mensagem: `${symbol}: o CNPJ ${doMapa.cnpj} do mapa não está no FCA do ano; não entra`,
          ref: symbol,
        });
        continue;
      }
      novos.push(titulo(symbol, classe, doMapa.cnpj, linhaDaClasse(doMapa.cnpj, classe)));
      completados.push({ symbol, cnpj: doMapa.cnpj, regra: 'mapa' });
      continue;
    }
    semEmissor.push(symbol);
  }

  for (const t of novos) {
    if (!cias.has(t.cnpj)) {
      const c = fca.ciasSemTicker.get(t.cnpj);
      if (c) cias.set(t.cnpj, c);
    }
    if (t.classeTitulo === 'UNIT' && t.unitQtdOn === null) {
      alertas.push({
        codigo: 'unit_sem_composicao',
        nivel: 'aviso',
        mensagem: `${t.symbol}: composição da unit não reconhecida ("${t.composicaoTexto ?? ''}")`,
        ref: t.symbol,
      });
    }
  }
  for (const c of completados) {
    alertas.push({
      codigo: 'ticker_completado_b3',
      nivel: 'info',
      mensagem: `${c.symbol} → ${c.cnpj} (${c.regra}: FCA errado, negociado na B3)`,
      ref: c.symbol,
    });
  }
  for (const s of semEmissor.slice(0, MAX_ALERTAS_SEM_EMISSOR)) {
    alertas.push({
      codigo: 'ticker_b3_sem_emissor',
      nivel: 'info',
      mensagem: `${s}: negociado na B3 sem companhia correspondente no FCA do ano`,
      ref: s,
    });
  }
  if (semEmissor.length > MAX_ALERTAS_SEM_EMISSOR) {
    alertas.push({
      codigo: 'ticker_b3_sem_emissor',
      nivel: 'info',
      mensagem: `mais ${semEmissor.length - MAX_ALERTAS_SEM_EMISSOR} tickers negociados sem companhia no FCA`,
    });
  }

  const titulos = [...fca.titulos.filter((t) => !reabertos.has(t)), ...novos].sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  );
  return { cias, titulos, completados, alertas };
}

function titulo(
  symbol: string,
  classe: ClasseTitulo,
  cnpj: string,
  linha: LinhaFcaRejeitada | null,
): TituloFca {
  const texto = classe === 'UNIT' ? (linha?.composicaoTexto ?? null) : null;
  const unit = classe === 'UNIT' ? parseComposicaoUnit(texto) : null;
  return {
    cnpj,
    symbol,
    classeTitulo: classe,
    classeFca: linha?.classeFca ?? null,
    unitQtdOn: unit?.on ?? null,
    unitQtdPn: unit?.pn ?? null,
    composicaoTexto: texto,
    dataInicio: linha?.dataInicio ?? null,
    dataFim: null,
    origem: 'b3',
  };
}
