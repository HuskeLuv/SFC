/**
 * Título e mensagem de cada aviso das listas (bloco 1, fatia D). Toda a cópia vem de
 * textosAlertas.ts (fatia 0) e, no resultado de ações, de eventos/textosEventos.ts
 * (tituloResultado/descricaoResultado, os mesmos textos da Agenda — sem textos paralelos).
 *
 * Regras: nenhum TÍTULO leva R$ (o push manda o título real + o corpo genérico); valores e datas
 * ficam só na mensagem do sino. Datas em DD/MM (horário de Brasília não importa: são datas civis).
 */
import {
  descricaoResultado,
  tituloResultado,
} from '@/services/analiseAtivos/eventos/textosEventos';
import type {
  FatoCriterios,
  FatoFiiTrimestral,
  FatoProvento,
  FatoResultado,
} from '@/services/analiseAtivos/regras/alertas/detectores';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_ALERTAS } from '@/services/analiseAtivos/textosAlertas';
import type { ClasseItemSalvo } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_ALERTAS.aviso;

export interface TextoAviso {
  titulo: string;
  mensagem: string;
}

/** 'AAAA-MM-DD' → 'DD/MM'. */
export function ddmm(dataIso: string): string {
  const [, m, d] = dataIso.split('-');
  return `${d}/${m}`;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
function ddmmaaaa(dataIso: string): string {
  const [a, m, d] = dataIso.split('-');
  return `${d}/${m}/${a}`;
}

/** Tickers da mesma companhia no título ('PETR3/PETR4'), em ordem alfabética. */
export function juntarTickers(tickers: readonly string[]): string {
  return [...tickers].sort().join(T.separadorCompanhia);
}

/** "PETR3/PETR4: resultado do 3T26" — o título da Agenda com o ticker na frente. */
export function textoAvisoResultado(tickers: readonly string[], fato: FatoResultado): TextoAviso {
  const symbol = juntarTickers(tickers);
  const daAgenda = tituloResultado(symbol, fato.periodoRef, false);
  const sufixo = daAgenda.startsWith(`${symbol} · `) ? daAgenda.slice(symbol.length + 3) : daAgenda;
  return {
    titulo: `${symbol}: ${sufixo}`,
    mensagem: `${descricaoResultado(false, fato.periodoRef)} ${T.resultadoComplemento}`,
  };
}

/** "HGLG11: informe trimestral publicado na CVM". */
export function textoAvisoFiiTrimestral(
  tickers: readonly string[],
  fato: FatoFiiTrimestral,
): TextoAviso {
  const [ano, mes] = fato.refQuarter.split('-').map(Number);
  return {
    titulo: formatarTexto(T.fiiTrimestralTitulo, { ticker: juntarTickers(tickers) }),
    mensagem: formatarTexto(T.fiiTrimestralMensagem, {
      trimestre: Math.ceil(mes / 3),
      ano,
      data: ddmmaaaa(fato.publicadoEm),
    }),
  };
}

/** Valor por ação/cota em pt-BR: 2 a 6 casas ("1,10", "0,123456"). */
export function formatarValorProvento(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function unidadeDo(symbol: string, classe: ClasseItemSalvo): string {
  if (classe === 'fii') return T.proventoUnidade.cota;
  return /11$/.test(symbol) ? T.proventoUnidade.unit : T.proventoUnidade.acao;
}

/** "HGLG11: provento anunciado" + "Rendimento de R$ 1,10 por cota · data-com 20/10 · pagamento 27/10." */
export function textoAvisoProvento(fato: FatoProvento, classe: ClasseItemSalvo): TextoAviso {
  // FII: o "dividendo" da fonte é o rendimento do fundo
  const tipo =
    classe === 'fii' && fato.tipoProvento === 'dividendo' ? 'rendimento' : fato.tipoProvento;
  const vars = {
    tipo: T.proventoTipo[tipo],
    valor: formatarValorProvento(fato.valor),
    unidade: unidadeDo(fato.symbol, classe),
    dataCom: ddmm(fato.dataCom),
    pagamento: fato.pagamento ? ddmm(fato.pagamento) : '',
  };
  return {
    titulo: formatarTexto(T.proventoTitulo, { ticker: fato.symbol }),
    mensagem: formatarTexto(
      fato.pagamento ? T.proventoMensagem : T.proventoMensagemSemPagamento,
      vars,
    ),
  };
}

/** "WEGE3: a contagem de critérios mudou" + "De 4 de 6 para 5 de 6 na janela de 5 anos (2021–2025)." */
export function textoAvisoCriterios(fato: FatoCriterios): TextoAviso {
  return {
    titulo: formatarTexto(T.criteriosTitulo, { ticker: fato.symbol }),
    mensagem: formatarTexto(T.criteriosMensagem, {
      de: fato.de.atendidos,
      para: fato.para.atendidos,
      total: fato.para.aplicaveis,
      anoInicio: fato.anoInicio,
      anoFim: fato.anoFim,
    }),
  };
}

/** "Novidades em N ativos dos seus Salvos" (mais de 5 avisos na rodada). */
export function textoAvisoResumo(n: number): TextoAviso {
  return {
    titulo: formatarTexto(T.resumoTitulo, { n }),
    mensagem: T.resumoMensagem,
  };
}
