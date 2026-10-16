/**
 * Documento do PDF do Comparador (bloco 1, fatia A) — PURO e testável. Recebe a MESMA resposta da
 * tela (montarComparador → ComparadorResposta; números idênticos) e devolve só textos prontos, na
 * ordem da tela. renderizarPdfComparacao desenha; aqui não há pdfkit.
 *
 * Regras (desenho.json, arquitetura.pdf; decisão 2 do Wellington, 16/10):
 * - SEM OPÇÕES: nunca posição na Carteira, nunca nome nem e-mail (a entrada nem tem esses campos:
 *   ComparadorResposta não leva dado do usuário). Sem mini-gráficos: só a nota "séries no app".
 * - Isonômico: nenhuma célula com marca de valor; critérios com marca neutra (✓ vetorial / '—' /
 *   'n/a') + a frase factual; "Critérios atendidos: n de k".
 * - Literais da spec (instrução do Comparador, Leitura dos dados, aviso legal v2) vêm de
 *   textosLiterais; o resto da cópia de textosSalvos.pdf.documento / textosComparador /
 *   textosCriterios — tudo varrido pela linguagemV2 (textosDoDocumento, no teste).
 * - O aviso legal vai em TODA página (o renderizador repete `rodape`).
 */
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { textoContagens } from '@/services/analiseAtivos/regras/comparador/resumo';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import {
  TEXTOS_CRITERIOS,
  formatarTexto,
  textoContador,
} from '@/services/analiseAtivos/textosCriterios';
import {
  INSTRUCAO_COMPARADOR_ACOES,
  INSTRUCAO_COMPARADOR_FIIS,
  LEITURA_DOS_DADOS,
  RODAPE_LEGAL_V2,
} from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import type { Estado } from '@/types/analiseAtivosApi';
import type {
  CriteriosLinhaApi,
  IdCriterio,
  MarcaCriterioLinha,
} from '@/types/analiseAtivosCriterios';

const TD = TEXTOS_SALVOS.pdf.documento;
const TC = TEXTOS_COMPARADOR;
const TCR = TEXTOS_CRITERIOS;
const FUSO = 'America/Sao_Paulo';

/** Marca neutra de uma célula de critério (o ✓ é desenhado em vetor pelo renderizador). */
export type MarcaPdf = 'atende' | 'nao_atende' | 'nao_se_aplica' | 'sem_avaliacao';

export interface CelulaCriterioPdf {
  marca: MarcaPdf;
  /** texto da marca quando não é o ✓ ('—', 'n/a') */
  simbolo: string;
  /** a frase factual sob a marca */
  texto: string;
  /** observações do resultado (texto pequeno, itálico) */
  obs: string[];
}

export interface ColunaAtivoPdf {
  ticker: string;
  nome: string;
  preco: string;
  /** 'fechamento de DD/MM · fonte B3' ou 'sem cotação recente' */
  fechamento: string;
  /** 'sem negociação recente' quando o ativo saiu do Quadro */
  selo: string | null;
}

export interface LinhaIndicadorPdf {
  rotulo: string;
  sub: string | null;
  valores: string[];
}

export interface DocumentoComparacao {
  marca: string;
  origem: string;
  titulo: string;
  /** DD/MM/AAAA (horário de Brasília) */
  dataGeracao: string;
  janela: string;
  instrucao: { id: string; texto: string };
  avisoMisto: { titulo: string; texto: string } | null;
  colunaCriterio: string;
  colunas: ColunaAtivoPdf[];
  criterios: {
    titulo: string;
    linhas: Array<{ rotulo: string; celulas: CelulaCriterioPdf[] }>;
    atendidos: { rotulo: string; valores: string[] };
  };
  grupos: Array<{ titulo: string; linhas: LinhaIndicadorPdf[] }>;
  leitura: { titulo: string; contagens: string; texto: string };
  notaSeries: string;
  rodape: {
    avisoTitulo: string;
    avisoTexto: string;
    gerado: string;
    /** 'página {x} de {y}' (o renderizador preenche) */
    paginaModelo: string;
  };
}

/** DD/MM/AAAA no horário de Brasília. */
export function dataLongaBrasilia(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: FUSO });
}

/** 'AAAA-MM-DD' → 'DD/MM' (data civil, sem fuso). */
function dataCurtaCivil(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : null;
}

/** Marca do ativo para a linha `id` (ou a equivalente, no misto) — a mesma regra da tela. */
export function marcaDaLinhaPdf(
  criterios: CriteriosLinhaApi | null,
  id: IdCriterio,
  equivalencias: Partial<Record<IdCriterio, IdCriterio>> = {},
): MarcaCriterioLinha | null {
  if (!criterios) return null;
  const eq = equivalencias[id];
  return criterios.marcas.find((m) => m.id === id || (eq !== undefined && m.id === eq)) ?? null;
}

/** Frase sob a marca — a mesma da tela (BlocoCriteriosComparador.fraseDaMarca). */
export function fraseDaMarcaPdf(m: MarcaCriterioLinha): string {
  if (m.estado === 'nao_se_aplica') return TCR.estados.nao_se_aplica;
  if (m.estado === 'sem_dado') {
    const fato = m.fato || TCR.fatos.semDado;
    return fato.startsWith(TCR.estados.nao_atende)
      ? fato
      : formatarTexto(TC.criterios.naoAtendePrefixo, { fato });
  }
  return m.fato;
}

function celulaCriterio(m: MarcaCriterioLinha | null): CelulaCriterioPdf {
  if (!m) {
    return {
      marca: 'sem_avaliacao',
      simbolo: TC.celula.semDado,
      texto: TC.criterios.semAvaliacaoTexto,
      obs: [],
    };
  }
  const obs = (m.obs ?? []).map((o) => TCR.obs[o]);
  if (m.estado === 'atende') return { marca: 'atende', simbolo: TD.atende, texto: m.fato, obs };
  if (m.estado === 'nao_se_aplica') {
    return {
      marca: 'nao_se_aplica',
      simbolo: TC.celula.naoSeAplica,
      texto: fraseDaMarcaPdf(m),
      obs,
    };
  }
  return { marca: 'nao_atende', simbolo: TD.naoAtende, texto: fraseDaMarcaPdf(m), obs };
}

const AUSENTE: Estado<number> = { estado: 'ausente', motivo: 'sem_dado_fonte', texto: '' };

/**
 * Monta o documento. `geradoEm` = agora (a data do rodapé). Nenhum campo do usuário entra: só a
 * resposta pública do Comparador.
 */
export function montarDocumentoComparacao(
  dados: ComparadorResposta,
  opts: { geradoEm: Date },
): DocumentoComparacao {
  const fii = dados.classe === 'fii';
  const instrucao = fii ? INSTRUCAO_COMPARADOR_FIIS : INSTRUCAO_COMPARADOR_ACOES;
  const dataGeracao = dataLongaBrasilia(opts.geradoEm);
  const tickers = dados.ativos.map((a) => a.ticker);

  const colunas: ColunaAtivoPdf[] = dados.ativos.map((a) => {
    const curta = a.precoData ? dataCurtaCivil(a.precoData) : null;
    return {
      ticker: a.ticker,
      nome: a.nome,
      preco: formatarEstado(a.preco, 'moeda'),
      fechamento: curta ? formatarTexto(TD.fechamento, { data: curta }) : TD.semCotacao,
      selo: a.noQuadro ? null : TC.linhas.semNegociacao,
    };
  });

  const linhasCriterios = (Object.entries(dados.criterios.rotulos) as Array<[IdCriterio, string]>)
    .filter(([, rotulo]) => typeof rotulo === 'string')
    .map(([id, rotulo]) => ({
      rotulo,
      celulas: dados.ativos.map((a) =>
        celulaCriterio(marcaDaLinhaPdf(a.criterios, id, dados.criterios.equivalencias)),
      ),
    }));

  const grupos = dados.grupos.map((g) => ({
    titulo: g.rotulo,
    linhas: g.linhas.map((l) => {
      const subs = [l.sub, l.fonteCvmAviso ? TC.celula.fonteCvm : null].filter(
        (s): s is string => typeof s === 'string' && s.length > 0,
      );
      return {
        rotulo: l.rotulo,
        sub: subs.length > 0 ? subs.join(TC.leitura.separador) : null,
        valores: tickers.map((t) => {
          const v = formatarEstado(l.valores[t] ?? AUSENTE, l.formato);
          return l.conferencia[t] ? `${v}${TC.leitura.separador}${TC.celula.emConferencia}` : v;
        }),
      };
    }),
  }));

  return {
    marca: TD.marca,
    origem: TD.origem,
    titulo: fii ? TD.tituloFii : TD.tituloAcao,
    dataGeracao,
    janela: formatarTexto(TD.janela, { n: dados.janela }),
    instrucao: { id: instrucao.id, texto: instrucao.texto },
    avisoMisto: dados.misto ? { titulo: TC.misto.titulo, texto: TC.misto.texto } : null,
    colunaCriterio: TD.colunaCriterio,
    colunas,
    criterios: {
      titulo: formatarTexto(TD.grupoCriterios, { n: dados.janela }),
      linhas: linhasCriterios,
      atendidos: {
        rotulo: TC.criterios.atendidos,
        valores: dados.ativos.map((a) =>
          a.criterios ? textoContador(a.criterios.n, a.criterios.de) : TC.criterios.semAvaliacao,
        ),
      },
    },
    grupos,
    leitura: {
      titulo: TD.leituraTitulo,
      contagens: textoContagens(dados.leitura),
      texto: LEITURA_DOS_DADOS.texto,
    },
    notaSeries: TD.seriesNoApp,
    rodape: {
      avisoTitulo: TD.avisoLegalTitulo,
      avisoTexto: RODAPE_LEGAL_V2.texto,
      gerado: formatarTexto(TD.geradoEm, { data: dataGeracao }),
      paginaModelo: TD.pagina,
    },
  };
}

/** Todas as strings do documento (para a varredura de linguagem e os testes). */
export function textosDoDocumento(doc: DocumentoComparacao): string[] {
  const out: string[] = [
    doc.marca,
    doc.origem,
    doc.titulo,
    doc.dataGeracao,
    doc.janela,
    doc.instrucao.texto,
    doc.colunaCriterio,
    doc.criterios.titulo,
    doc.criterios.atendidos.rotulo,
    ...doc.criterios.atendidos.valores,
    doc.leitura.titulo,
    doc.leitura.contagens,
    doc.leitura.texto,
    doc.notaSeries,
    doc.rodape.avisoTitulo,
    doc.rodape.avisoTexto,
    doc.rodape.gerado,
    doc.rodape.paginaModelo,
  ];
  if (doc.avisoMisto) out.push(doc.avisoMisto.titulo, doc.avisoMisto.texto);
  for (const c of doc.colunas) {
    out.push(c.ticker, c.nome, c.preco, c.fechamento);
    if (c.selo) out.push(c.selo);
  }
  for (const l of doc.criterios.linhas) {
    out.push(l.rotulo);
    for (const c of l.celulas) out.push(c.simbolo, c.texto, ...c.obs);
  }
  for (const g of doc.grupos) {
    out.push(g.titulo);
    for (const l of g.linhas) {
      out.push(l.rotulo, ...l.valores);
      if (l.sub) out.push(l.sub);
    }
  }
  return out;
}
