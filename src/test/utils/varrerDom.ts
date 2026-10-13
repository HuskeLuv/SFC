/**
 * varrerDom — varredura de linguagem e de isonomia de um DOM renderizado (caso 32 da spec v2.4).
 * Dono: fatia 0. Usado por fatia: B no Quadro, C1 nos modais, C2 na página do ativo, D no
 * Comparador; global na F.
 *
 * O que faz:
 *  - junta o texto VISÍVEL e ANUNCIADO do container (nós de texto + aria-label, title, placeholder,
 *    alt) e procura palavras proibidas com linguagemV2;
 *  - IGNORA a subárvore de [data-nome-ativo] (nome vindo do banco, ex.: KNIP11 "Índices de Preços");
 *  - IGNORA a subárvore de [data-texto-legal="<id>"], MAS confere que o textContent do nó (espaços
 *    colapsados) é EXATAMENTE o literal registrado com aquele id em TEXTOS_LITERAIS_OBRIGATORIOS;
 *    id desconhecido ou texto diferente = achado 'literal_invalido' (o teste falha);
 *  - textos de operação (opts.textosOperacao, ex.: TEXTOS_OPERACAO da C1 'Compra'/'Venda'): um nó de
 *    texto EXATAMENTE igual a um deles é varrido com a lista própria (sem compra/venda);
 *  - classes de placar: qualquer elemento com classe cujo segmento (separado por - _ : /) seja
 *    best | star | stars | destaque | winner | vencedor, ou com atributo data-destaque.
 *
 * Uso típico:
 *   const r = varrerDom(container);
 *   expect(r.achados).toEqual([]);
 * ou esperarDomLimpo(container) (mesma coisa, com mensagem legível).
 */
import { expect } from 'vitest';
import {
  encontrarProibidasOperacao,
  encontrarProibidasV2,
} from '@/services/analiseAtivos/regras/comum/linguagemV2';
import {
  TEXTOS_LITERAIS_OBRIGATORIOS,
  normalizarEspacos,
} from '@/services/analiseAtivos/textosLiterais';

export type TipoAchadoDom = 'palavra' | 'classe' | 'literal_invalido';

export interface AchadoDom {
  tipo: TipoAchadoDom;
  /** palavra proibida, classe ou id do literal */
  detalhe: string;
  /** trecho onde apareceu (texto, atributo ou outerHTML curto) */
  onde: string;
}

export interface ResultadoVarreduraDom {
  /** texto juntado (sem os nós ignorados), um trecho por linha */
  texto: string;
  achados: AchadoDom[];
  /** ids de data-texto-legal encontrados (válidos ou não) */
  literais: string[];
}

export interface OpcoesVarrerDom {
  /** textos exatos de tipo de operação ('Compra', 'Venda'): lista própria */
  textosOperacao?: readonly string[];
}

const ATRIBUTOS_TEXTO = ['aria-label', 'title', 'placeholder', 'alt'] as const;
const SEGMENTOS_PLACAR = new Set(['best', 'star', 'stars', 'destaque', 'winner', 'vencedor']);

function classesDe(el: Element): string[] {
  const c = el.getAttribute('class');
  return c ? c.split(/\s+/).filter(Boolean) : [];
}

function classeDePlacar(classe: string): boolean {
  return classe
    .toLowerCase()
    .split(/[-_:/[\]]+/)
    .some((seg) => SEGMENTOS_PLACAR.has(seg));
}

function resumo(el: Element): string {
  return el.outerHTML.slice(0, 160);
}

export function varrerDom(container: Element, opts: OpcoesVarrerDom = {}): ResultadoVarreduraDom {
  const trechos: string[] = [];
  const achados: AchadoDom[] = [];
  const literais: string[] = [];
  const operacao = new Set((opts.textosOperacao ?? []).map(normalizarEspacos));

  const varrerTexto = (t: string, onde: string) => {
    const texto = normalizarEspacos(t);
    if (!texto) return;
    trechos.push(texto);
    const palavras = operacao.has(texto)
      ? encontrarProibidasOperacao(texto)
      : encontrarProibidasV2(texto);
    for (const p of palavras) achados.push({ tipo: 'palavra', detalhe: p, onde });
  };

  const visitar = (no: Node) => {
    if (no.nodeType === 3) {
      varrerTexto(no.textContent ?? '', no.textContent ?? '');
      return;
    }
    if (no.nodeType !== 1) return;
    const el = no as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') return;

    for (const classe of classesDe(el)) {
      if (classeDePlacar(classe))
        achados.push({ tipo: 'classe', detalhe: classe, onde: resumo(el) });
    }
    if (el.hasAttribute('data-destaque')) {
      achados.push({ tipo: 'classe', detalhe: 'data-destaque', onde: resumo(el) });
    }

    if (el.hasAttribute('data-nome-ativo')) return;

    const idLegal = el.getAttribute('data-texto-legal');
    if (idLegal !== null) {
      literais.push(idLegal);
      const registrado = TEXTOS_LITERAIS_OBRIGATORIOS[idLegal];
      const conteudo = normalizarEspacos(el.textContent ?? '');
      if (!registrado || normalizarEspacos(registrado.texto) !== conteudo) {
        achados.push({ tipo: 'literal_invalido', detalhe: idLegal, onde: conteudo.slice(0, 160) });
      }
      return;
    }

    for (const a of ATRIBUTOS_TEXTO) {
      const v = el.getAttribute(a);
      if (v) varrerTexto(v, `[${a}] ${v}`);
    }
    el.childNodes.forEach(visitar);
  };

  visitar(container);
  return { texto: trechos.join('\n'), achados, literais };
}

/** Falha o teste com a lista legível de achados (vazia = DOM limpo). */
export function esperarDomLimpo(container: Element, opts?: OpcoesVarrerDom): ResultadoVarreduraDom {
  const r = varrerDom(container, opts);
  expect(
    r.achados.map((a) => `${a.tipo}: ${a.detalhe} — ${a.onde}`),
    'varrerDom: linguagem ou classe proibida no DOM',
  ).toEqual([]);
  return r;
}
