/**
 * Repositório do societário do FRE (A6, item 6; fatia D): cia_fre_societario,
 * cia_fre_posicao_acionaria e cia_fre_direito_acao. Escritor único = job 'cvm-fre-societario'.
 *
 * Gravação em TRANSAÇÃO por (cnpj, anoFre): o documento novo substitui o anterior inteiro (delete +
 * createMany), então a versão nova do FRE nunca deixa acionista órfão da versão velha. As colunas são
 * escritas uma a uma (lista fechada): nada vindo da fonte entra por espalhamento, e não existe coluna
 * de CPF/CNPJ do acionista (decisão 5).
 */
import type { PrismaClient } from '@prisma/client';
import { deData, paraData } from '@/services/analiseAtivos/repositorio/conversao';
import type {
  AcionistaFre,
  DireitoAcaoFre,
  DistribuicaoFre,
  DocumentoFre,
} from '@/services/analiseAtivos/acoes/parserFreSocietario';
import { ANO_FRE_DIREITOS } from '@/types/analiseAtivosComplementos';

const dataOuNull = (s: string | null): Date | null => (s ? deData(s) : null);

export interface GravacaoSocietario {
  cnpj: string;
  anoFre: number;
  versao: number;
  documento: DocumentoFre | null;
  distribuicao: DistribuicaoFre | null;
  /** null = o zip não trouxe a posição desta companhia (mantém o que já estava) */
  acionistas: AcionistaFre[] | null;
  dataReferenciaPosicao: string | null;
}

/** Linha de cia_fre_posicao_acionaria (lista fechada de colunas). */
export function linhaPosicaoDb(
  cnpj: string,
  anoFre: number,
  versao: number,
  a: AcionistaFre,
  dataReferencia: string | null,
) {
  return {
    cnpj,
    anoFre,
    idAcionista: a.idAcionista,
    versao,
    nome: a.nome,
    tipoPessoa: a.tipoPessoa,
    pctOn: a.pctOn,
    pctPn: a.pctPn,
    pctTotal: a.pctTotal,
    controlador: a.controlador,
    acordoAcionistas: a.acordoAcionistas,
    sintetica: a.sintetica,
    dataReferencia: dataOuNull(dataReferencia),
    dataUltimaAlteracao: dataOuNull(a.dataUltimaAlteracao),
  };
}

/** Grava (cnpj, anoFre) numa transação. Devolve as linhas gravadas. */
export async function gravarSocietario(
  prisma: PrismaClient,
  g: GravacaoSocietario,
): Promise<number> {
  const dados = {
    versao: g.versao,
    dtReceb: dataOuNull(g.documento?.dtReceb ?? null),
    dataReferencia: dataOuNull(
      g.documento?.dataReferencia ?? g.distribuicao?.dataReferencia ?? null,
    ),
    pctCirculacaoOn: g.distribuicao?.pctCirculacaoOn ?? null,
    pctCirculacaoPn: g.distribuicao?.pctCirculacaoPn ?? null,
    pctCirculacaoTotal: g.distribuicao?.pctCirculacaoTotal ?? null,
    nAcionistasPf: g.distribuicao?.nAcionistasPf ?? null,
    nAcionistasPj: g.distribuicao?.nAcionistasPj ?? null,
    nAcionistasInst: g.distribuicao?.nAcionistasInst ?? null,
    linkDocFre: g.documento?.linkDoc ?? null,
  };
  return prisma.$transaction(async (tx) => {
    await tx.ciaFreSocietario.upsert({
      where: { cnpj_anoFre: { cnpj: g.cnpj, anoFre: g.anoFre } },
      create: { cnpj: g.cnpj, anoFre: g.anoFre, ...dados },
      update: dados,
    });
    let n = 1;
    if (g.acionistas) {
      await tx.ciaFrePosicaoAcionaria.deleteMany({ where: { cnpj: g.cnpj, anoFre: g.anoFre } });
      if (g.acionistas.length > 0) {
        const r = await tx.ciaFrePosicaoAcionaria.createMany({
          data: g.acionistas.map((a) =>
            linhaPosicaoDb(g.cnpj, g.anoFre, g.versao, a, g.dataReferenciaPosicao),
          ),
        });
        n += r.count;
      }
    }
    return n;
  });
}

/** Direitos por espécie do FRE 2022 de uma companhia (substitui os anteriores). */
export async function gravarDireitos(
  prisma: PrismaClient,
  cnpj: string,
  anoFre: number,
  direitos: DireitoAcaoFre[],
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.ciaFreDireitoAcao.deleteMany({ where: { cnpj, anoFre } });
    if (direitos.length === 0) return 0;
    const r = await tx.ciaFreDireitoAcao.createMany({
      data: direitos.map((d) => ({
        cnpj,
        anoFre,
        especie: d.especie,
        classePn: d.classePn,
        pctTagAlong: d.pctTagAlong,
        direitoDividendoTexto: d.direitoDividendoTexto,
        pctDividendoMinimo: d.pctDividendoMinimo,
        direitoVoto: d.direitoVoto,
        conversibilidade: d.conversibilidade,
      })),
    });
    return r.count;
  });
}

// ---------------------------------------------------------------- leitura

export interface SocietarioDb {
  anoFre: number;
  versao: number;
  dtReceb: string | null;
  pctCirculacaoOn: number | null;
  pctCirculacaoPn: number | null;
  pctCirculacaoTotal: number | null;
  nAcionistasPf: number | null;
  nAcionistasPj: number | null;
  nAcionistasInst: number | null;
  linkDocFre: string | null;
}

export interface PosicaoDb {
  idAcionista: string;
  nome: string;
  pctOn: number | null;
  pctPn: number | null;
  pctTotal: number | null;
  controlador: boolean;
  acordoAcionistas: boolean;
  sintetica: boolean;
}

export interface DireitoDb {
  especie: string;
  classePn: string;
  pctTagAlong: number | null;
  direitoDividendoTexto: string | null;
  pctDividendoMinimo: number | null;
}

export interface DadosSocietarioDb {
  /** FRE mais recente da companhia (maior anoFre); null sem FRE */
  societario: SocietarioDb | null;
  posicao: PosicaoDb[];
  /** FRE 2022 (ANO_FRE_DIREITOS) */
  direitos: DireitoDb[];
  /** classes dos tickers vigentes (ON | PN | UNIT) */
  classesTickers: string[];
}

/**
 * Tudo o que o card precisa de uma companhia, em 3 leituras + tickers. Nenhuma coluna de documento
 * do acionista é selecionada (nem existe).
 */
export async function lerSocietarioCnpj(
  prisma: PrismaClient,
  cnpj: string,
): Promise<DadosSocietarioDb> {
  const [soc, direitos, tickers] = await Promise.all([
    prisma.ciaFreSocietario.findFirst({
      where: { cnpj },
      orderBy: { anoFre: 'desc' },
    }),
    prisma.ciaFreDireitoAcao.findMany({
      where: { cnpj, anoFre: ANO_FRE_DIREITOS },
      select: {
        especie: true,
        classePn: true,
        pctTagAlong: true,
        direitoDividendoTexto: true,
        pctDividendoMinimo: true,
      },
    }),
    prisma.cvmCompanyTicker.findMany({
      where: { cnpj, validTo: null },
      select: { classeTitulo: true },
    }),
  ]);
  const posicao = soc
    ? await prisma.ciaFrePosicaoAcionaria.findMany({
        where: { cnpj, anoFre: soc.anoFre },
        select: {
          idAcionista: true,
          nome: true,
          pctOn: true,
          pctPn: true,
          pctTotal: true,
          controlador: true,
          acordoAcionistas: true,
          sintetica: true,
        },
      })
    : [];
  return {
    societario: soc
      ? {
          anoFre: soc.anoFre,
          versao: soc.versao,
          dtReceb: paraData(soc.dtReceb),
          pctCirculacaoOn: soc.pctCirculacaoOn,
          pctCirculacaoPn: soc.pctCirculacaoPn,
          pctCirculacaoTotal: soc.pctCirculacaoTotal,
          nAcionistasPf: soc.nAcionistasPf,
          nAcionistasPj: soc.nAcionistasPj,
          nAcionistasInst: soc.nAcionistasInst,
          linkDocFre: soc.linkDocFre,
        }
      : null,
    posicao,
    direitos,
    classesTickers: tickers.map((t) => t.classeTitulo),
  };
}
