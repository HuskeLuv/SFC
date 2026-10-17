/**
 * Renderiza o DocumentoComparacao num PDF (bloco 1, fatia A) com pdfkit, NO SERVIDOR (JS puro, sem
 * Chromium). A4 retrato; paisagem com 4 ativos (as colunas não cabem em retrato).
 *
 * - Fonte Outfit em TTF estático (Regular e SemiBold, OFL) em src/fonts/pdf/ — o build do deploy
 *   leva o fonte inteiro (tar do repositório), e o caminho sai de process.cwd(). A fonte é passada
 *   já no construtor, então o pdfkit nem carrega a Helvetica (AFM).
 * - 'pdfkit' fica em serverExternalPackages (next.config.ts): o pacote lê arquivos por fs.
 * - Paginação MANUAL (margem inferior 0 no pdfkit): cada linha da tabela mede a altura antes de
 *   desenhar e, se não couber acima do rodapé, abre página nova e repete o cabeçalho da tabela.
 * - Rodapé em TODA página (bufferPages): aviso legal v2 integral + "Gerado pelo My Finance em …"
 *   + "página x de y".
 * - Visual neutro: nenhuma célula com cor ou destaque por valor; só o cabeçalho da tabela em navy
 *   (#314666, brandColors) com texto branco; o resto em cinzas. O ✓ é vetorial.
 * - Glifos que a Outfit não tem (≤, ≥, ≈, ≠, ⇒) viram texto equivalente (glifoParaFonte).
 */
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { MYFINANCE_BRAND, MYFINANCE_TONS } from '@/constants/brandColors';
import type {
  CelulaCriterioPdf,
  DocumentoComparacao,
} from '@/services/analiseAtivos/pdf/montarDocumentoComparacao';

export const DIR_FONTES_PDF = path.join(process.cwd(), 'src', 'fonts', 'pdf');
export const FONTE_REGULAR = path.join(DIR_FONTES_PDF, 'Outfit-Regular.ttf');
export const FONTE_SEMIBOLD = path.join(DIR_FONTES_PDF, 'Outfit-SemiBold.ttf');

const COR = {
  navy: MYFINANCE_BRAND.seguranca,
  texto: MYFINANCE_BRAND.potencia,
  // cinzas do app (gray-500 / gray-600 / gray-200 / gray-100 do Tailwind)
  apagado: '#6B7280',
  medio: '#4B5563',
  linha: '#E5E7EB',
  faixa: MYFINANCE_TONS.fundoSelecionado,
  bordaFaixa: MYFINANCE_TONS.bordaSelecionada,
  branco: '#FFFFFF',
} as const;

const MARGEM = 40;
const PAD_X = 6;
const PAD_Y = 5;

/** Substitutos de glifos que a Outfit não tem (mesmo sentido, em texto). */
const SUBSTITUTOS: Readonly<Record<string, string>> = {
  '≤': 'até',
  '≥': 'a partir de',
  '≈': '~',
  '≠': 'diferente de',
  '⇒': '→',
};
const RE_SEM_GLIFO = new RegExp(`[${Object.keys(SUBSTITUTOS).join('')}]`, 'gu');

export function glifoParaFonte(texto: string): string {
  return texto.replace(RE_SEM_GLIFO, (c) => SUBSTITUTOS[c] ?? '');
}

type Doc = PDFKit.PDFDocument;

/**
 * Sem ligaduras ('fi', 'fl'): com elas o texto extraído do PDF sai "fnanceira" (busca, leitor de
 * tela e cópia quebram). O fontkit aceita o objeto {feature: false}; os tipos do pdfkit só
 * declaram a lista, daí o cast.
 */
const SEM_LIGADURAS = { liga: false, clig: false } as unknown as PDFKit.Mixins.OpenTypeFeatures[];

interface Estilo {
  fonte: 'R' | 'S';
  tam: number;
  cor: string;
}

const E = {
  marca: { fonte: 'S', tam: 11, cor: COR.navy },
  origem: { fonte: 'R', tam: 8.5, cor: COR.apagado },
  titulo: { fonte: 'S', tam: 17, cor: COR.texto },
  meta: { fonte: 'R', tam: 9, cor: COR.medio },
  instrucao: { fonte: 'R', tam: 9, cor: COR.medio },
  avisoTitulo: { fonte: 'S', tam: 9, cor: COR.texto },
  avisoTexto: { fonte: 'R', tam: 8.5, cor: COR.medio },
  cabTicker: { fonte: 'S', tam: 10, cor: COR.branco },
  cabTexto: { fonte: 'R', tam: 7.5, cor: COR.branco },
  cabRotulo: { fonte: 'S', tam: 8.5, cor: COR.branco },
  faixa: { fonte: 'S', tam: 9, cor: COR.navy },
  rotulo: { fonte: 'S', tam: 8.5, cor: COR.texto },
  sub: { fonte: 'R', tam: 7, cor: COR.apagado },
  valor: { fonte: 'R', tam: 9, cor: COR.texto },
  simbolo: { fonte: 'S', tam: 10, cor: COR.medio },
  fato: { fonte: 'R', tam: 7, cor: COR.medio },
  obs: { fonte: 'R', tam: 6.5, cor: COR.apagado },
  contagem: { fonte: 'S', tam: 9.5, cor: COR.texto },
  leituraTitulo: { fonte: 'S', tam: 8, cor: COR.medio },
  leituraContagens: { fonte: 'S', tam: 10, cor: COR.texto },
  leituraTexto: { fonte: 'R', tam: 8.5, cor: COR.medio },
  nota: { fonte: 'R', tam: 7.5, cor: COR.apagado },
  rodapeTitulo: { fonte: 'S', tam: 7, cor: COR.medio },
  rodapeTexto: { fonte: 'R', tam: 6.5, cor: COR.apagado },
  rodapeMeta: { fonte: 'R', tam: 7, cor: COR.apagado },
} as const satisfies Record<string, Estilo>;

function usar(doc: Doc, e: Estilo): Doc {
  return doc
    .font(e.fonte === 'S' ? 'Outfit-SemiBold' : 'Outfit')
    .fontSize(e.tam)
    .fillColor(e.cor);
}

function altura(doc: Doc, texto: string, e: Estilo, largura: number): number {
  if (!texto) return 0;
  usar(doc, e);
  return doc.heightOfString(glifoParaFonte(texto), {
    width: largura,
    lineGap: 1,
    features: SEM_LIGADURAS,
  });
}

function escrever(
  doc: Doc,
  texto: string,
  e: Estilo,
  x: number,
  y: number,
  largura: number,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  if (!texto) return 0;
  usar(doc, e);
  const t = glifoParaFonte(texto);
  doc.text(t, x, y, {
    width: largura,
    align,
    lineGap: 1,
    lineBreak: true,
    features: SEM_LIGADURAS,
  });
  return doc.heightOfString(t, { width: largura, lineGap: 1, features: SEM_LIGADURAS });
}

/** ✓ vetorial (traço), centrado em (cx, cy). */
function check(doc: Doc, cx: number, cy: number, tam = 7) {
  doc
    .save()
    .lineWidth(1.4)
    .strokeColor(COR.medio)
    .lineCap('round')
    .lineJoin('round')
    .moveTo(cx - tam / 2, cy)
    .lineTo(cx - tam / 8, cy + tam / 2.6)
    .lineTo(cx + tam / 2, cy - tam / 2.4)
    .stroke()
    .restore();
}

interface Layout {
  larguraPagina: number;
  alturaPagina: number;
  larguraConteudo: number;
  larguraRotulo: number;
  larguraColuna: number;
  limiteY: number;
  alturaRodape: number;
}

function alturaRodape(doc: Doc, d: DocumentoComparacao, largura: number): number {
  return (
    altura(doc, d.rodape.avisoTitulo, E.rodapeTitulo, largura) +
    altura(doc, d.rodape.avisoTexto, E.rodapeTexto, largura) +
    altura(doc, d.rodape.gerado, E.rodapeMeta, largura) +
    18
  );
}

function desenharRodape(doc: Doc, d: DocumentoComparacao, l: Layout, x: number, y: number) {
  const top = l.alturaPagina - MARGEM - l.alturaRodape + 6;
  doc
    .save()
    .moveTo(MARGEM, top - 4)
    .lineTo(MARGEM + l.larguraConteudo, top - 4)
    .lineWidth(0.5)
    .strokeColor(COR.linha)
    .stroke()
    .restore();
  let yy = top + 2;
  yy += escrever(doc, d.rodape.avisoTitulo, E.rodapeTitulo, MARGEM, yy, l.larguraConteudo);
  yy += escrever(doc, d.rodape.avisoTexto, E.rodapeTexto, MARGEM, yy, l.larguraConteudo) + 4;
  escrever(doc, d.rodape.gerado, E.rodapeMeta, MARGEM, yy, l.larguraConteudo / 2);
  const pag = d.rodape.paginaModelo.replace('{x}', String(x)).replace('{y}', String(y));
  escrever(
    doc,
    pag,
    E.rodapeMeta,
    MARGEM + l.larguraConteudo / 2,
    yy,
    l.larguraConteudo / 2,
    'right',
  );
}

/** Cabeçalho da tabela (navy): 'Critério' + uma coluna por ativo. */
function alturaCabecalhoTabela(doc: Doc, d: DocumentoComparacao, l: Layout): number {
  const w = l.larguraColuna - 2 * PAD_X;
  const hs = d.colunas.map(
    (c) =>
      altura(doc, c.ticker, E.cabTicker, w) +
      altura(doc, c.nome, E.cabTexto, w) +
      altura(doc, c.preco, E.cabTicker, w) +
      altura(doc, c.fechamento, E.cabTexto, w) +
      altura(doc, c.selo ?? '', E.cabTexto, w),
  );
  return Math.max(altura(doc, d.colunaCriterio, E.cabRotulo, l.larguraRotulo), ...hs) + 2 * PAD_Y;
}

function desenharCabecalhoTabela(doc: Doc, d: DocumentoComparacao, l: Layout, y: number): number {
  const h = alturaCabecalhoTabela(doc, d, l);
  doc.save().rect(MARGEM, y, l.larguraConteudo, h).fill(COR.navy).restore();
  escrever(doc, d.colunaCriterio, E.cabRotulo, MARGEM + PAD_X, y + PAD_Y, l.larguraRotulo - PAD_X);
  d.colunas.forEach((c, i) => {
    const x = MARGEM + l.larguraRotulo + i * l.larguraColuna + PAD_X;
    const w = l.larguraColuna - 2 * PAD_X;
    let yy = y + PAD_Y;
    yy += escrever(doc, c.ticker, E.cabTicker, x, yy, w);
    yy += escrever(doc, c.nome, E.cabTexto, x, yy, w);
    yy += escrever(doc, c.preco, E.cabTicker, x, yy, w);
    yy += escrever(doc, c.fechamento, E.cabTexto, x, yy, w);
    if (c.selo) escrever(doc, c.selo, E.cabTexto, x, yy, w);
  });
  return h;
}

class Cursor {
  y: number;
  constructor(
    private readonly doc: Doc,
    private readonly d: DocumentoComparacao,
    private readonly l: Layout,
  ) {
    this.y = MARGEM;
  }

  /** Garante `h` de espaço; senão página nova (com o cabeçalho da tabela, se pedido). */
  reservar(h: number, repetirCabecalho: boolean): void {
    if (this.y + h <= this.l.limiteY) return;
    this.doc.addPage();
    this.y = MARGEM;
    if (repetirCabecalho) this.y += desenharCabecalhoTabela(this.doc, this.d, this.l, this.y);
  }
}

function faixa(doc: Doc, c: Cursor, l: Layout, titulo: string) {
  const h = altura(doc, titulo, E.faixa, l.larguraConteudo - 2 * PAD_X) + 2 * PAD_Y;
  c.reservar(h + 24, true);
  doc.save().rect(MARGEM, c.y, l.larguraConteudo, h).fill(COR.faixa).restore();
  escrever(doc, titulo, E.faixa, MARGEM + PAD_X, c.y + PAD_Y, l.larguraConteudo - 2 * PAD_X);
  c.y += h;
}

function linhaSeparadora(doc: Doc, l: Layout, y: number) {
  doc
    .save()
    .moveTo(MARGEM, y)
    .lineTo(MARGEM + l.larguraConteudo, y)
    .lineWidth(0.5)
    .strokeColor(COR.linha)
    .stroke()
    .restore();
}

function alturaCelulaCriterio(doc: Doc, cel: CelulaCriterioPdf, w: number): number {
  return (
    11 +
    altura(doc, cel.texto, E.fato, w) +
    cel.obs.reduce((s, o) => s + altura(doc, o, E.obs, w), 0)
  );
}

function desenharCelulaCriterio(doc: Doc, cel: CelulaCriterioPdf, x: number, y: number, w: number) {
  if (cel.marca === 'atende') check(doc, x + w / 2, y + 5);
  else escrever(doc, cel.simbolo, E.simbolo, x, y - 1, w, 'center');
  let yy = y + 12;
  yy += escrever(doc, cel.texto, E.fato, x, yy, w, 'center');
  for (const o of cel.obs) yy += escrever(doc, o, E.obs, x, yy, w, 'center');
}

function rotuloComSub(doc: Doc, rotulo: string, sub: string | null, w: number) {
  return altura(doc, rotulo, E.rotulo, w) + (sub ? altura(doc, sub, E.sub, w) : 0);
}

function desenharRotulo(
  doc: Doc,
  rotulo: string,
  sub: string | null,
  x: number,
  y: number,
  w: number,
) {
  const h = escrever(doc, rotulo, E.rotulo, x, y, w);
  if (sub) escrever(doc, sub, E.sub, x, y + h, w);
}

/** Desenha o documento inteiro e devolve o PDF. */
export async function renderizarPdfComparacao(d: DocumentoComparacao): Promise<Buffer> {
  const paisagem = d.colunas.length >= 4;
  const doc = new PDFDocument({
    size: 'A4',
    layout: paisagem ? 'landscape' : 'portrait',
    margins: { top: MARGEM, bottom: 0, left: MARGEM, right: MARGEM },
    bufferPages: true,
    autoFirstPage: true,
    font: FONTE_REGULAR,
    info: {
      Title: `${d.titulo} · ${d.colunas.map((c) => c.ticker).join(' · ')}`,
      Author: d.marca,
      Creator: d.marca,
      Producer: d.marca,
    },
    lang: 'pt-BR',
  });
  doc.registerFont('Outfit', FONTE_REGULAR);
  doc.registerFont('Outfit-SemiBold', FONTE_SEMIBOLD);

  const partes: Buffer[] = [];
  const pronto = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const larguraPagina = doc.page.width;
  const alturaPagina = doc.page.height;
  const larguraConteudo = larguraPagina - 2 * MARGEM;
  const larguraRotulo = Math.min(170, Math.round(larguraConteudo * 0.26));
  const n = Math.max(1, d.colunas.length);
  const larguraColuna = (larguraConteudo - larguraRotulo) / n;
  const hRodape = alturaRodape(doc, d, larguraConteudo);
  const l: Layout = {
    larguraPagina,
    alturaPagina,
    larguraConteudo,
    larguraRotulo,
    larguraColuna,
    alturaRodape: hRodape,
    limiteY: alturaPagina - MARGEM - hRodape,
  };
  const c = new Cursor(doc, d, l);

  // --- topo -------------------------------------------------------------------------------
  escrever(doc, d.marca, E.marca, MARGEM, c.y, larguraConteudo / 2);
  escrever(
    doc,
    d.origem,
    E.origem,
    MARGEM + larguraConteudo / 2,
    c.y + 2,
    larguraConteudo / 2,
    'right',
  );
  c.y += 20;
  c.y += escrever(doc, d.titulo, E.titulo, MARGEM, c.y, larguraConteudo) + 2;
  c.y += escrever(doc, `${d.dataGeracao} · ${d.janela}`, E.meta, MARGEM, c.y, larguraConteudo) + 6;
  c.y += escrever(doc, d.instrucao.texto, E.instrucao, MARGEM, c.y, larguraConteudo) + 10;

  if (d.avisoMisto) {
    const w = larguraConteudo - 2 * PAD_X - 3;
    const h =
      altura(doc, d.avisoMisto.titulo, E.avisoTitulo, w) +
      altura(doc, d.avisoMisto.texto, E.avisoTexto, w) +
      2 * PAD_Y;
    c.reservar(h, false);
    doc.save().rect(MARGEM, c.y, larguraConteudo, h).fill(COR.faixa).restore();
    doc.save().rect(MARGEM, c.y, 3, h).fill(COR.bordaFaixa).restore();
    let yy = c.y + PAD_Y;
    yy += escrever(doc, d.avisoMisto.titulo, E.avisoTitulo, MARGEM + 3 + PAD_X, yy, w);
    escrever(doc, d.avisoMisto.texto, E.avisoTexto, MARGEM + 3 + PAD_X, yy, w);
    c.y += h + 10;
  }

  // --- tabela -----------------------------------------------------------------------------
  c.reservar(alturaCabecalhoTabela(doc, d, l) + 60, false);
  c.y += desenharCabecalhoTabela(doc, d, l, c.y);
  const wRot = larguraRotulo - 2 * PAD_X;
  const wCol = larguraColuna - 2 * PAD_X;
  const xCol = (i: number) => MARGEM + larguraRotulo + i * larguraColuna + PAD_X;

  faixa(doc, c, l, d.criterios.titulo);
  for (const linha of d.criterios.linhas) {
    const h =
      Math.max(
        rotuloComSub(doc, linha.rotulo, null, wRot),
        ...linha.celulas.map((cel) => alturaCelulaCriterio(doc, cel, wCol)),
      ) +
      2 * PAD_Y;
    c.reservar(h, true);
    desenharRotulo(doc, linha.rotulo, null, MARGEM + PAD_X, c.y + PAD_Y, wRot);
    linha.celulas.forEach((cel, i) => desenharCelulaCriterio(doc, cel, xCol(i), c.y + PAD_Y, wCol));
    c.y += h;
    linhaSeparadora(doc, l, c.y);
  }
  {
    const a = d.criterios.atendidos;
    const h =
      Math.max(
        altura(doc, a.rotulo, E.rotulo, wRot),
        ...a.valores.map((v) => altura(doc, v, E.contagem, wCol)),
      ) +
      2 * PAD_Y;
    c.reservar(h, true);
    escrever(doc, a.rotulo, E.rotulo, MARGEM + PAD_X, c.y + PAD_Y, wRot);
    a.valores.forEach((v, i) => escrever(doc, v, E.contagem, xCol(i), c.y + PAD_Y, wCol, 'center'));
    c.y += h;
    doc
      .save()
      .moveTo(MARGEM, c.y)
      .lineTo(MARGEM + larguraConteudo, c.y)
      .lineWidth(1.2)
      .strokeColor(COR.bordaFaixa)
      .stroke()
      .restore();
  }

  for (const g of d.grupos) {
    if (g.linhas.length === 0) continue;
    faixa(doc, c, l, g.titulo);
    for (const linha of g.linhas) {
      const h =
        Math.max(
          rotuloComSub(doc, linha.rotulo, linha.sub, wRot),
          ...linha.valores.map((v) => altura(doc, v, E.valor, wCol)),
        ) +
        2 * PAD_Y;
      c.reservar(h, true);
      desenharRotulo(doc, linha.rotulo, linha.sub, MARGEM + PAD_X, c.y + PAD_Y, wRot);
      linha.valores.forEach((v, i) =>
        escrever(doc, v, E.valor, xCol(i), c.y + PAD_Y, wCol, 'center'),
      );
      c.y += h;
      linhaSeparadora(doc, l, c.y);
    }
  }

  // --- Leitura dos dados + nota ------------------------------------------------------------
  c.y += 12;
  {
    const w = larguraConteudo - 2 * 10;
    const h =
      altura(doc, d.leitura.titulo.toUpperCase(), E.leituraTitulo, w) +
      altura(doc, d.leitura.contagens, E.leituraContagens, w) +
      altura(doc, d.leitura.texto, E.leituraTexto, w) +
      26;
    c.reservar(h, false);
    doc.save().roundedRect(MARGEM, c.y, larguraConteudo, h, 6).fill(COR.faixa).restore();
    let yy = c.y + 9;
    yy += escrever(doc, d.leitura.titulo.toUpperCase(), E.leituraTitulo, MARGEM + 10, yy, w) + 2;
    yy += escrever(doc, d.leitura.contagens, E.leituraContagens, MARGEM + 10, yy, w) + 3;
    escrever(doc, d.leitura.texto, E.leituraTexto, MARGEM + 10, yy, w);
    c.y += h + 8;
  }
  {
    const h = altura(doc, d.notaSeries, E.nota, larguraConteudo);
    c.reservar(h, false);
    c.y += escrever(doc, d.notaSeries, E.nota, MARGEM, c.y, larguraConteudo);
  }

  // --- rodapé em toda página ------------------------------------------------------------------
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i += 1) {
    doc.switchToPage(i);
    desenharRodape(doc, d, l, i - start + 1, count);
  }
  doc.end();
  return pronto;
}
