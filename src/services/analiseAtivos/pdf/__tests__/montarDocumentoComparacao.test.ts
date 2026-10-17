import { describe, expect, it, vi } from 'vitest';

/**
 * pdfkit FALSO: registra cada text() na página corrente (para conferir o aviso legal em TODA
 * página) e mede a altura por um modelo simples de linhas. O PDF real é gerado no teste da rota.
 */
const pdf = vi.hoisted(() => {
  const paginas: string[][] = [];
  class FakePdf {
    page = { width: 595.28, height: 841.89 };
    private atual = 0;
    private tam = 10;
    private handlers: Record<string, (x?: unknown) => void> = {};
    constructor(opts: { layout?: string }) {
      if (opts.layout === 'landscape') this.page = { width: 841.89, height: 595.28 };
      paginas.length = 0;
      paginas.push([]);
    }
    registerFont() {
      return this;
    }
    font() {
      return this;
    }
    fontSize(t: number) {
      this.tam = t;
      return this;
    }
    fillColor() {
      return this;
    }
    heightOfString(t: string, o: { width: number }) {
      const porLinha = Math.max(1, Math.floor(o.width / (this.tam * 0.5)));
      return Math.ceil(t.length / porLinha) * (this.tam + 2);
    }
    text(t: string) {
      paginas[this.atual].push(t);
      return this;
    }
    addPage() {
      paginas.push([]);
      this.atual = paginas.length - 1;
      return this;
    }
    switchToPage(i: number) {
      this.atual = i;
      return this;
    }
    bufferedPageRange() {
      return { start: 0, count: paginas.length };
    }
    on(ev: string, fn: (x?: unknown) => void) {
      this.handlers[ev] = fn;
      return this;
    }
    end() {
      this.handlers.data?.(Buffer.from('%PDF-1.3 falso'));
      this.handlers.end?.();
    }
  }
  for (const m of [
    'save',
    'restore',
    'rect',
    'roundedRect',
    'fill',
    'moveTo',
    'lineTo',
    'stroke',
    'lineWidth',
    'strokeColor',
    'lineCap',
    'lineJoin',
  ]) {
    (FakePdf.prototype as unknown as Record<string, () => unknown>)[m] = function (this: unknown) {
      return this;
    };
  }
  return { FakePdf, paginas };
});
vi.mock('pdfkit', () => ({ default: pdf.FakePdf }));

import {
  montarDocumentoComparacao,
  textosDoDocumento,
} from '@/services/analiseAtivos/pdf/montarDocumentoComparacao';
import {
  glifoParaFonte,
  renderizarPdfComparacao,
} from '@/services/analiseAtivos/pdf/renderizarPdfComparacao';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { RODAPE_LEGAL_V2 } from '@/services/analiseAtivos/textosLiterais';
import type { ComparadorResposta, LinhaComparador } from '@/types/analiseAtivosBlocoD';
import type { CriteriosLinhaApi } from '@/types/analiseAtivosCriterios';

const criterios = (n: number, de: number): CriteriosLinhaApi => ({
  janela: 5,
  n,
  de,
  perfil: 'acao',
  marcas: [
    { id: 'rec', estado: 'atende', fato: 'cresceu em 5 de 5 anos · 1 → 2 (R$ mi)' },
    {
      id: 'luc',
      estado: 'sem_dado',
      fato: '',
      obs: ['lucro_sem_descontado'],
    },
    { id: 'div', estado: 'nao_se_aplica', fato: 'financeira' },
  ],
});

function linha(codigo: string, valores: Record<string, number | null>): LinhaComparador {
  return {
    codigo,
    rotulo: `Indicador ${codigo}`,
    sub: codigo === 'a' ? 'anos fechados' : null,
    formato: 'pct',
    fonteCvmAviso: codigo === 'b',
    valores: Object.fromEntries(
      Object.entries(valores).map(([t, v]) => [
        t,
        v === null
          ? { estado: 'nao_se_aplica', motivo: 'financeira', texto: 'n/a' }
          : { estado: 'ok', valor: v },
      ]),
    ),
    conferencia: { WEGE3: null, ITUB4: { exibicao: 'selo', motivo: 'proventos' } },
  } as LinhaComparador;
}

function resposta(nLinhas = 4, tickers = ['WEGE3', 'ITUB4']): ComparadorResposta {
  return {
    classe: 'acao',
    janela: 5,
    tickers,
    ignorados: [],
    misto: false,
    ativos: tickers.map((t, i) => ({
      ticker: t,
      nome: `${t} S.A.`,
      preco:
        i === 0
          ? { estado: 'ok', valor: 50.29 }
          : { estado: 'ausente', motivo: 'sem_preco', texto: '' },
      precoData: i === 0 ? '2026-10-15' : null,
      fiiTipo: null,
      tipoComparacao: 'acao',
      criterios: i === 0 ? criterios(1, 2) : null,
      noQuadro: i === 0,
      foraDoQuadroMotivo: i === 0 ? null : 'sem_negociacao',
      conferencias: [],
      pares: [],
    })),
    criterios: {
      rotulos: { rec: 'Receita crescente', luc: 'Lucro crescente', div: 'Dív. líq./EBITDA ≤ 3×' },
      equivalencias: {},
    },
    grupos: [
      {
        codigo: 'qualidade',
        rotulo: 'Qualidade',
        aplicavelA: ['acao'],
        linhas: Array.from({ length: nLinhas }, (_, i) =>
          linha(i === 0 ? 'a' : i === 1 ? 'b' : `l${i}`, { WEGE3: 33.16, ITUB4: null }),
        ),
      },
    ],
    graficos: null,
    leitura: {
      janela: 5,
      contagens: tickers.map((t, i) => ({
        ticker: t,
        n: i === 0 ? 1 : null,
        de: i === 0 ? 2 : null,
      })),
      texto: 'x',
    },
    versao: 'c2:v',
  } as unknown as ComparadorResposta;
}

const GERADO = new Date('2026-10-16T15:00:00Z');

describe('montarDocumentoComparacao', () => {
  it('na ordem da tela: título, instrução literal, colunas, critérios, indicadores, leitura, rodapé', () => {
    const d = montarDocumentoComparacao(resposta(), { geradoEm: GERADO });
    expect(d.titulo).toBe('Comparação · Ações');
    expect(d.dataGeracao).toBe('16/10/2026');
    expect(d.instrucao.id).toBe('instrucao-comparador-acoes');
    expect(d.colunas[0]).toMatchObject({
      ticker: 'WEGE3',
      preco: 'R$ 50,29',
      fechamento: 'fechamento de 15/10 · fonte B3',
      selo: null,
    });
    expect(d.colunas[1]).toMatchObject({ preco: '—', fechamento: 'sem cotação recente' });
    expect(d.colunas[1].selo).toBe('sem negociação recente');
    expect(d.criterios.titulo).toBe('Critérios de fundamentos · 5 anos');
    expect(d.criterios.linhas.map((l) => l.celulas.map((c) => c.marca))).toEqual([
      ['atende', 'sem_avaliacao'],
      ['nao_atende', 'sem_avaliacao'],
      ['nao_se_aplica', 'sem_avaliacao'],
    ]);
    expect(d.criterios.linhas[1].celulas[0].texto).toBe('não atende · sem dado nas demonstrações');
    expect(d.criterios.linhas[1].celulas[0].obs).toHaveLength(1);
    expect(d.criterios.atendidos.valores).toEqual(['1 de 2', 'sem avaliação']);
    expect(d.grupos[0].linhas[0]).toMatchObject({
      sub: 'anos fechados',
      valores: ['33,16%', 'n/a · em conferência'],
    });
    expect(d.grupos[0].linhas[1].sub).toBe('fonte CVM');
    expect(d.leitura.texto).toMatch(/^Os critérios são verificações factuais/);
    expect(d.rodape.avisoTexto).toBe(RODAPE_LEGAL_V2.texto);
    expect(d.rodape.gerado).toBe('Gerado pelo My Finance em 16/10/2026');
  });

  it('linguagemV2: nenhuma palavra proibida fora dos literais registrados', () => {
    const d = montarDocumentoComparacao(resposta(), { geradoEm: GERADO });
    const nomes = new Set(d.colunas.map((c) => c.nome));
    const achados = textosDoDocumento(d)
      .filter((t) => !nomes.has(t))
      .flatMap((t) => encontrarProibidasV2(t, { ignorarLiterais: true }).map((p) => `${t}: ${p}`));
    expect(achados).toEqual([]);
  });

  it('sem posição, sem nome nem e-mail do usuário, sem marca de valor', () => {
    const entrada = {
      ...resposta(),
      // mesmo que algo pessoal viesse grudado na resposta, o documento só lê campos conhecidos
      usuario: { nome: 'Ana Ribeiro', email: 'ana@exemplo.com' },
      posicao: { quantidade: 120 },
    } as unknown as ComparadorResposta;
    const d = montarDocumentoComparacao(entrada, { geradoEm: GERADO });
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/Ana Ribeiro|@|posi[cç][aã]o|quantidade|Na minha carteira/i);
    expect(json).not.toMatch(/"(email|usuario|posicao|destaque|nota|score|indice)"/i);
  });

  it('FII misto leva o aviso do misto e o título de FIIs', () => {
    const r = { ...resposta(), classe: 'fii', misto: true } as ComparadorResposta;
    const d = montarDocumentoComparacao(r, { geradoEm: GERADO });
    expect(d.titulo).toBe('Comparação · FIIs');
    expect(d.instrucao.id).toBe('instrucao-comparador-fiis');
    expect(d.avisoMisto?.titulo).toMatch(/tijolo com FIIs de papel/);
  });
});

describe('renderizarPdfComparacao', () => {
  it('aviso legal integral e "página x de y" em TODA página (várias páginas)', async () => {
    const d = montarDocumentoComparacao(resposta(60), { geradoEm: GERADO });
    const buf = await renderizarPdfComparacao(d);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    const n = pdf.paginas.length;
    expect(n).toBeGreaterThan(2);
    pdf.paginas.forEach((textos, i) => {
      expect(textos).toContain(RODAPE_LEGAL_V2.texto);
      expect(textos).toContain('Aviso importante.');
      expect(textos).toContain(`página ${i + 1} de ${n}`);
      expect(textos).toContain('Gerado pelo My Finance em 16/10/2026');
    });
    // o cabeçalho da tabela se repete nas páginas seguintes
    expect(pdf.paginas[1]).toContain('Critério');
  });

  it('glifos que a Outfit não tem viram texto (≤ → até)', () => {
    expect(glifoParaFonte('Dív. líq./EBITDA ≤ 3×')).toBe('Dív. líq./EBITDA até 3×');
    expect(glifoParaFonte('a ≥ b ≈ c ⇒ d')).toBe('a a partir de b ~ c → d');
  });
});
