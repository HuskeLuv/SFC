/**
 * Gravação da lista de imóveis do FII (fii_imovel_trimestral) e dos setores dos locatários
 * (fii_inquilino_setor_trimestral) — A6, fatia A. Única escritora das duas tabelas; chamada pelo
 * job fii-trimestral depois do gravarTrimestral (mesmo zip, mesmo parser, mesma passada).
 *
 * Por (cnpj, refQuarter), na MAIOR Versao da entrada:
 * - nada gravado ⇒ cria; versão gravada MAIOR que a da fonte ⇒ ignora (nunca regride um reenvio);
 * - conteúdo igual ⇒ nada (2ª execução não escreve);
 * - diferente ⇒ delete + createMany do (cnpj, refQuarter) inteiro, em transação (lotes de chaves).
 * O fundo sem linha na entrada (versaoImovel/versaoInquilino null) não toca no que já está gravado.
 * `ordem` = posição da linha no CSV dentro da versão (estável). UF inferida na gravação.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import type { FiiTrimestreBruto } from '@/services/analiseAtivos/fii/parserInformeTrimestral';
import { deData, paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import { ehSetorPlaceholder, inferirUf } from '@/services/analiseAtivos/regras/fii/listaImoveis';

/** chaves (cnpj, refQuarter) por transação */
const LOTE_CHAVES = 50;
/** cnpjs por leitura do que já está gravado */
const LOTE_LEITURA = 200;
/**
 * Percentuais (p.p.) gravados com 6 casas: fração × 100 gera ruído de ponto flutuante
 * (1,2467000000000001) que o Prisma não devolve igual — sem arredondar, a comparação com o gravado
 * nunca bate e a 2ª execução reescreveria tudo.
 */
const CASAS_PCT = 6;

export interface LinhaImovelFii {
  cnpj: string;
  refQuarter: string;
  ordem: number;
  versao: number;
  classe: string | null;
  nome: string | null;
  endereco: string | null;
  ufInferida: string | null;
  area: number | null;
  unidades: number | null;
  vacanciaPct: number | null;
  inadimplenciaPct: number | null;
  receitaPct: number | null;
}

export interface LinhaSetorInquilinoFii {
  cnpj: string;
  refQuarter: string;
  setor: string;
  versao: number;
  pctReceitaFii: number | null;
  nLinhas: number | null;
  placeholder: boolean;
}

export interface ContagemGravacaoImoveis {
  /** chaves (cnpj, refQuarter) */
  criadas: number;
  substituidas: number;
  iguais: number;
  versaoMenor: number;
  /** linhas inseridas (ou que seriam, no dry-run) */
  linhas: number;
}

export interface ResultadoGravacaoImoveis {
  imoveis: ContagemGravacaoImoveis;
  setores: ContagemGravacaoImoveis;
}

const finitoOuNull = (n: number | null | undefined, casas?: number): number | null => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return casas === undefined ? n : Math.round(n * 10 ** casas) / 10 ** casas;
};

/** Núcleo puro: trimestre bruto ⇒ linhas das duas tabelas (vazias quando a entrada não tem). */
export function montarLinhasImoveis(t: FiiTrimestreBruto): {
  imoveis: LinhaImovelFii[];
  setores: LinhaSetorInquilinoFii[];
} {
  const imoveis: LinhaImovelFii[] =
    t.versaoImovel === null
      ? []
      : t.imoveis.map((i, ordem) => ({
          cnpj: t.cnpj,
          refQuarter: t.refQuarter,
          ordem,
          versao: t.versaoImovel as number,
          classe: i.classe || null,
          nome: i.nome ?? null,
          endereco: i.endereco ?? null,
          ufInferida: inferirUf(i.endereco),
          area: finitoOuNull(i.area, 2),
          unidades: finitoOuNull(i.unidades),
          vacanciaPct: finitoOuNull(i.vacanciaPct, CASAS_PCT),
          inadimplenciaPct: finitoOuNull(i.inadimplenciaPct, CASAS_PCT),
          receitaPct: finitoOuNull(i.receitaPct, CASAS_PCT),
        }));
  const setores: LinhaSetorInquilinoFii[] =
    t.versaoInquilino === null || !t.setoresInquilino
      ? []
      : t.setoresInquilino.map((s) => ({
          cnpj: t.cnpj,
          refQuarter: t.refQuarter,
          setor: s.setor,
          versao: t.versaoInquilino as number,
          pctReceitaFii: finitoOuNull(s.pctReceitaFii, CASAS_PCT),
          nLinhas: s.nLinhas,
          placeholder: ehSetorPlaceholder(s.setor),
        }));
  return { imoveis, setores };
}

// ---------------------------------------------------------------------------
// Comparação com o gravado
// ---------------------------------------------------------------------------

/**
 * Assinatura estável do conteúdo de uma chave (sem gravadoEm), ordenada pelo 1º campo com
 * comparação de código (independe da ordem do banco e da collation).
 */
function assinatura<T extends object>(linhas: T[], campos: Array<keyof T>): string {
  const tuplas = linhas.map((l) => campos.map((c) => l[c] ?? null));
  tuplas.sort((x, y) => (String(x[0]) < String(y[0]) ? -1 : String(x[0]) > String(y[0]) ? 1 : 0));
  return JSON.stringify(tuplas);
}
const CAMPOS_IMOVEL: Array<keyof LinhaImovelFii> = [
  'ordem',
  'versao',
  'classe',
  'nome',
  'endereco',
  'ufInferida',
  'area',
  'unidades',
  'vacanciaPct',
  'inadimplenciaPct',
  'receitaPct',
];
const CAMPOS_SETOR: Array<keyof LinhaSetorInquilinoFii> = [
  'setor',
  'versao',
  'pctReceitaFii',
  'nLinhas',
  'placeholder',
];

type Gravado = { versao: number; assinatura: string };

function agrupar<T extends { cnpj: string; refQuarter: string }>(linhas: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const l of linhas) {
    const k = `${l.cnpj}|${l.refQuarter}`;
    const g = m.get(k);
    if (g) g.push(l);
    else m.set(k, [l]);
  }
  return m;
}

function intervalo(chaves: string[]): { cnpjs: string[]; de: Date; ate: Date } {
  const refs = chaves.map((k) => k.split('|')[1]).sort();
  return {
    cnpjs: [...new Set(chaves.map((k) => k.split('|')[0]))],
    de: deData(refs[0]),
    ate: deData(refs[refs.length - 1]),
  };
}

async function imoveisGravados(
  prisma: PrismaClient,
  chaves: string[],
): Promise<Map<string, Gravado>> {
  const out = new Map<string, Gravado>();
  if (chaves.length === 0) return out;
  const { cnpjs, de, ate } = intervalo(chaves);
  for (let i = 0; i < cnpjs.length; i += LOTE_LEITURA) {
    const rows = await prisma.fiiImovelTrimestral.findMany({
      where: { cnpj: { in: cnpjs.slice(i, i + LOTE_LEITURA) }, refQuarter: { gte: de, lte: ate } },
      orderBy: [{ cnpj: 'asc' }, { refQuarter: 'asc' }, { ordem: 'asc' }],
    });
    const linhas: LinhaImovelFii[] = rows.map((r) => ({
      ...r,
      refQuarter: paraData(r.refQuarter),
      area: paraNumero(r.area),
    }));
    for (const [k, g] of agrupar(linhas)) {
      out.set(k, {
        versao: Math.max(...g.map((x) => x.versao)),
        assinatura: assinatura(g, CAMPOS_IMOVEL),
      });
    }
  }
  return out;
}

async function setoresGravados(
  prisma: PrismaClient,
  chaves: string[],
): Promise<Map<string, Gravado>> {
  const out = new Map<string, Gravado>();
  if (chaves.length === 0) return out;
  const { cnpjs, de, ate } = intervalo(chaves);
  for (let i = 0; i < cnpjs.length; i += LOTE_LEITURA) {
    const rows = await prisma.fiiInquilinoSetorTrimestral.findMany({
      where: { cnpj: { in: cnpjs.slice(i, i + LOTE_LEITURA) }, refQuarter: { gte: de, lte: ate } },
      orderBy: [{ cnpj: 'asc' }, { refQuarter: 'asc' }, { setor: 'asc' }],
    });
    const linhas: LinhaSetorInquilinoFii[] = rows.map((r) => ({
      ...r,
      refQuarter: paraData(r.refQuarter),
    }));
    for (const [k, g] of agrupar(linhas)) {
      out.set(k, {
        versao: Math.max(...g.map((x) => x.versao)),
        assinatura: assinatura(g, CAMPOS_SETOR),
      });
    }
  }
  return out;
}

/** Plano por chave: o que criar/substituir (puro, testável). */
export function planejar<T extends { cnpj: string; refQuarter: string; versao: number }>(
  novas: Map<string, T[]>,
  gravados: Map<string, Gravado>,
  assinar: (g: T[]) => string,
): { escrever: Map<string, T[]>; contagem: ContagemGravacaoImoveis } {
  const contagem: ContagemGravacaoImoveis = {
    criadas: 0,
    substituidas: 0,
    iguais: 0,
    versaoMenor: 0,
    linhas: 0,
  };
  const escrever = new Map<string, T[]>();
  for (const [k, g] of novas) {
    const e = gravados.get(k);
    const versao = g[0].versao;
    if (!e) contagem.criadas++;
    else if (versao < e.versao) {
      contagem.versaoMenor++;
      continue;
    } else if (assinar(g) === e.assinatura) {
      contagem.iguais++;
      continue;
    } else contagem.substituidas++;
    contagem.linhas += g.length;
    escrever.set(k, g);
  }
  return { escrever, contagem };
}

function ondeChaves(chaves: string[]): Prisma.FiiImovelTrimestralWhereInput {
  return {
    OR: chaves.map((k) => {
      const [cnpj, ref] = k.split('|');
      return { cnpj, refQuarter: deData(ref) };
    }),
  };
}

export async function gravarImoveisFii(
  prisma: PrismaClient,
  trimestres: FiiTrimestreBruto[],
  aplicar: boolean,
): Promise<ResultadoGravacaoImoveis> {
  const todosImoveis: LinhaImovelFii[] = [];
  const todosSetores: LinhaSetorInquilinoFii[] = [];
  for (const t of trimestres) {
    const m = montarLinhasImoveis(t);
    todosImoveis.push(...m.imoveis);
    todosSetores.push(...m.setores);
  }
  const novasImoveis = agrupar(todosImoveis);
  const novasSetores = agrupar(todosSetores);
  const [gImoveis, gSetores] = await Promise.all([
    imoveisGravados(prisma, [...novasImoveis.keys()]),
    setoresGravados(prisma, [...novasSetores.keys()]),
  ]);
  const pi = planejar(novasImoveis, gImoveis, (g) => assinatura(g, CAMPOS_IMOVEL));
  const ps = planejar(novasSetores, gSetores, (g) => assinatura(g, CAMPOS_SETOR));
  if (!aplicar) return { imoveis: pi.contagem, setores: ps.contagem };

  const agora = new Date();
  const chavesI = [...pi.escrever.keys()];
  for (let i = 0; i < chavesI.length; i += LOTE_CHAVES) {
    const lote = chavesI.slice(i, i + LOTE_CHAVES);
    await prisma.$transaction([
      prisma.fiiImovelTrimestral.deleteMany({ where: ondeChaves(lote) }),
      prisma.fiiImovelTrimestral.createMany({
        data: lote.flatMap((k) =>
          pi.escrever.get(k)!.map((l) => ({
            ...l,
            refQuarter: deData(l.refQuarter),
            gravadoEm: agora,
          })),
        ),
      }),
    ]);
  }
  const chavesS = [...ps.escrever.keys()];
  for (let i = 0; i < chavesS.length; i += LOTE_CHAVES) {
    const lote = chavesS.slice(i, i + LOTE_CHAVES);
    await prisma.$transaction([
      prisma.fiiInquilinoSetorTrimestral.deleteMany({
        where: ondeChaves(lote) as Prisma.FiiInquilinoSetorTrimestralWhereInput,
      }),
      prisma.fiiInquilinoSetorTrimestral.createMany({
        data: lote.flatMap((k) =>
          ps.escrever.get(k)!.map((l) => ({
            ...l,
            refQuarter: deData(l.refQuarter),
            gravadoEm: agora,
          })),
        ),
      }),
    ]);
  }
  return { imoveis: pi.contagem, setores: ps.contagem };
}
