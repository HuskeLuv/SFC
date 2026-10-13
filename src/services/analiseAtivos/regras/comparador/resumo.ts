/**
 * "Leitura dos dados" do Comparador (v2.4, fatia D) — PURO e isomórfico.
 *
 * Só CONTAGENS factuais, na ORDEM DOS SLOTS ("WEGE3: 5 de 6 critérios em 5 anos · BBAS3: 2 de 3
 * …"), sem ordenar por valor, sem somar, sem dizer quem tem mais, e o texto literal
 * 'leitura-dos-dados' de TEXTOS_LITERAIS_OBRIGATORIOS (a tela o mostra com data-texto-legal).
 * Ativo sem avaliação entra com n/de null ("sem avaliação").
 */
import { LEITURA_DOS_DADOS } from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_CRITERIOS, formatarTexto } from '@/services/analiseAtivos/textosCriterios';
import type { ResumoComparador } from '@/types/analiseAtivosBlocoD';
import type { CriteriosLinhaApi, Janela, LeituraDosDados } from '@/types/analiseAtivosCriterios';

export interface EntradaLeitura {
  ticker: string;
  criterios: Pick<CriteriosLinhaApi, 'n' | 'de'> | null;
}

/** Monta a leitura na ordem recebida (= ordem dos slots). */
export function montarLeitura(janela: Janela, ativos: readonly EntradaLeitura[]): LeituraDosDados {
  return {
    janela,
    contagens: ativos.map((a) => ({
      ticker: a.ticker,
      n: a.criterios ? a.criterios.n : null,
      de: a.criterios ? a.criterios.de : null,
    })),
    texto: LEITURA_DOS_DADOS.texto,
  };
}

/** Uma contagem ('WEGE3: 5 de 6 critérios em 5 anos' | 'HGLG11: sem avaliação'). */
export function textoContagem(c: LeituraDosDados['contagens'][number], janela: Janela): string {
  if (c.n === null || c.de === null) {
    return `${c.ticker}: ${TEXTOS_CRITERIOS.contador.semAvaliacao}`;
  }
  return formatarTexto(TEXTOS_CRITERIOS.contador.porAtivo, {
    ticker: c.ticker,
    n: c.n,
    total: c.de,
    anos: janela,
  });
}

/** Frase das contagens, na ordem dos slots, separadas por ' · '. */
export function textoContagens(l: LeituraDosDados): string {
  return l.contagens
    .map((c) => textoContagem(c, l.janela))
    .join(TEXTOS_COMPARADOR.leitura.separador);
}

// ---------------------------------------------------------------------------
// Legado: só o ResumoNumerico.tsx (removido na fatia F) ainda chama. A tela não o usa mais.
// ---------------------------------------------------------------------------

const TR = TEXTOS_COMPARADOR.resumo;

export interface TextosResumo {
  /** vazio: o Comparador não mostra mais indicador composto */
  indice: string;
  legendaIncompleto: string | null;
  criterios: string | null;
  emConferencia: string | null;
  responsabilidade: string;
}

/** @deprecated a tela usa a "Leitura dos dados"; some com o ResumoNumerico na fatia F. */
export function textosResumo(r: ResumoComparador): TextosResumo {
  const criterios = r.criteriosAtendidos
    .filter((c) => c.atende !== null && c.total !== null)
    .map((c) =>
      formatarTexto(TR.criteriosItem, {
        ticker: c.ticker,
        atendidos: String(c.atende),
        aplicaveis: String(c.total),
      }),
    )
    .join(' · ');
  const conf = r.emConferencia
    .map((c) =>
      formatarTexto(TR.emConferenciaItem, { ticker: c.ticker, campo: c.rotulos.join(', ') }),
    )
    .join(' · ');
  return {
    indice: '',
    legendaIncompleto: null,
    criterios: criterios ? formatarTexto(TR.criterios, { valor: criterios }) : null,
    emConferencia: conf ? formatarTexto(TR.emConferencia, { valor: conf }) : null,
    responsabilidade: TR.responsabilidade,
  };
}
