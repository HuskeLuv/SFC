import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { executarFreSocietario } from '@/services/analiseAtivos/acoes/sincronizarFreSocietario';
import { urlArquivoFre } from '@/services/analiseAtivos/acoes/freArquivos';
import {
  lerDireitoAcao,
  lerPosicaoAcionaria,
} from '@/services/analiseAtivos/acoes/parserFreSocietario';
import {
  BBSE,
  DIREITO_2022,
  DOC_FALSO_PF,
  DOC_FALSO_PJ,
  ITUB,
  POSICAO_2026,
  WEGE,
  zipFre2022,
  zipFre2026,
} from '@/services/analiseAtivos/acoes/__tests__/freFixtures';
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import { HOSTS_PERMITIDOS } from '@/services/analiseAtivos/fontes/allowlist';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { baixarParaArquivo } from '@/services/analiseAtivos/fontes/download';
import type { AlertaJob, JobContexto } from '@/services/analiseAtivos/tipos';

const dir = mkdtempSync(path.join(os.tmpdir(), 'fre-soc-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function* linhas(texto: string): AsyncIterable<string> {
  for (const l of texto.split('\n')) yield l;
}

type Linha = Record<string, unknown>;

/** Prisma em memória só com o que o job do FRE usa. */
function criarPrisma(tickers: { cnpj: string; symbol: string }[]) {
  const t = {
    societario: new Map<string, Linha>(),
    posicao: [] as Linha[],
    direito: [] as Linha[],
    fonte: new Map<string, Linha>(),
  };
  const prisma = {
    cvmCompanyTicker: {
      findMany: async () =>
        tickers.map((x) => ({
          ...x,
          classeTitulo: 'ON',
          unitQtdOn: null,
          unitQtdPn: null,
          validTo: null,
        })),
    },
    analiseFonteArquivo: {
      findUnique: async ({ where }: { where: { url: string } }) => t.fonte.get(where.url) ?? null,
      upsert: async ({ where, create }: { where: { url: string }; create: Linha }) => {
        t.fonte.set(where.url, { ...create });
      },
      update: async ({ where, data }: { where: { url: string }; data: Linha }) => {
        Object.assign(t.fonte.get(where.url)!, data);
      },
    },
    ciaFreSocietario: {
      upsert: async (a: {
        where: { cnpj_anoFre: { cnpj: string; anoFre: number } };
        create: Linha;
        update: Linha;
      }) => {
        const k = `${a.where.cnpj_anoFre.cnpj}|${a.where.cnpj_anoFre.anoFre}`;
        t.societario.set(k, { ...(t.societario.get(k) ?? a.create), ...a.update });
      },
    },
    ciaFrePosicaoAcionaria: {
      deleteMany: async ({ where }: { where: { cnpj: string; anoFre: number } }) => {
        t.posicao = t.posicao.filter((l) => !(l.cnpj === where.cnpj && l.anoFre === where.anoFre));
      },
      createMany: async ({ data }: { data: Linha[] }) => {
        for (const d of data) {
          const k = `${d.cnpj}|${d.anoFre}|${d.idAcionista}`;
          if (t.posicao.some((l) => `${l.cnpj}|${l.anoFre}|${l.idAcionista}` === k)) {
            throw new Error(`PK duplicada: ${k}`);
          }
          t.posicao.push({ ...d });
        }
        return { count: data.length };
      },
    },
    ciaFreDireitoAcao: {
      deleteMany: async ({ where }: { where: { cnpj: string; anoFre: number } }) => {
        t.direito = t.direito.filter((l) => !(l.cnpj === where.cnpj && l.anoFre === where.anoFre));
      },
      createMany: async ({ data }: { data: Linha[] }) => {
        for (const d of data) {
          const k = `${d.cnpj}|${d.anoFre}|${d.especie}|${d.classePn}`;
          if (t.direito.some((l) => `${l.cnpj}|${l.anoFre}|${l.especie}|${l.classePn}` === k)) {
            throw new Error(`PK duplicada: ${k}`);
          }
          t.direito.push({ ...d });
        }
        return { count: data.length };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma: prisma as unknown as PrismaClient, t };
}

function criarCtx(prisma: PrismaClient, extra: Partial<JobContexto> = {}) {
  const alertas: AlertaJob[] = [];
  const contagem = { linhasLidas: 0, linhasGravadas: 0, rejeitadas: 0 };
  const ctx: JobContexto = {
    prisma,
    prazo: Number.MAX_SAFE_INTEGER,
    restanteMs: () => 1e9,
    estourouPrazo: () => false,
    alertar: (a) => alertas.push(a),
    contar: (c, n = 1) => {
      contagem[c] += n;
    },
    params: SCORING_PARAMS_V1,
    paramsVersion: 1,
    hoje: '2026-10-19',
    origem: 'script',
    aplicar: true,
    ...extra,
  };
  return { ctx, alertas, contagem };
}

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

function baixarMock(zips: Record<string, string>) {
  return vi.fn(async (url: string, opts: Parameters<typeof baixarParaArquivo>[1]) => {
    const caminho = zips[url];
    if (!caminho) throw new ErroFonte('http_erro', `404 ${url}`, 404);
    const s = sha(caminho);
    const base = { bytes: 0, etag: null, lastModified: null, sha256: s, descartar: async () => {} };
    if (opts.condicional?.sha256 === s) {
      return { ...base, status: 'nao_modificado' as const, caminho: null };
    }
    return { ...base, status: 'baixado' as const, caminho, bytes: readFileSync(caminho).length };
  });
}

function zips() {
  return {
    [urlArquivoFre(2026)]: zipFre2026(dir),
    [urlArquivoFre(2025)]: zipFre2026(dir, 2025),
    [urlArquivoFre(2022)]: zipFre2022(dir),
  };
}

const UNIVERSO = [
  { cnpj: ITUB, symbol: 'ITUB4' },
  { cnpj: WEGE, symbol: 'WEGE3' },
  { cnpj: BBSE, symbol: 'BBSE3' },
];

describe('parser do FRE (streaming)', () => {
  it('ITUB: só diretos, controladores marcados, sintéticas com id fixo, sem PK duplicada', async () => {
    const m = await lerPosicaoAcionaria(linhas(POSICAO_2026), 'pos', { cnpjs: new Set([ITUB]) });
    const itub = m.get(ITUB)!;
    expect(itub.versao).toBe(4);
    expect(itub.indiretas).toBe(2);
    expect(itub.acionistas.map((a) => a.idAcionista)).toEqual([
      'TESOURARIA',
      '8236638',
      '8236642',
      '8236732',
      'OUTROS',
    ]);
    const itausa = itub.acionistas.find((a) => a.idAcionista === '8236642')!;
    expect(itausa).toMatchObject({
      nome: 'Itaúsa S.A.',
      tipoPessoa: 'PJ',
      pctOn: 39.205,
      pctPn: 0.004,
      pctTotal: 19.975,
      controlador: true,
      acordoAcionistas: true,
      sintetica: false,
      dataUltimaAlteracao: '2026-05-19',
    });
    expect(itub.acionistas.find((a) => a.idAcionista === 'OUTROS')).toMatchObject({
      sintetica: true,
      pctTotal: 50.038,
    });
    // nenhum indireto (PESSOA FICTICIA UM) e nenhuma linha da versão 3
    expect(itub.acionistas.some((a) => a.nome.includes('FICTICIA'))).toBe(false);
    expect(itub.acionistas.some((a) => a.idAcionista === '8000001')).toBe(false);
    // filtro do universo
    expect(m.has(WEGE)).toBe(false);
  });

  it('direito_acao 2022: classePn vazio = "", certificados fora, % por regex', async () => {
    const m = await lerDireitoAcao(linhas(DIREITO_2022), 'dir');
    expect(m.get(ITUB)!.direitos.map((d) => [d.especie, d.classePn, d.pctTagAlong])).toEqual([
      ['ON', '', 80],
      ['PN', '', 80],
    ]);
    expect(m.get(ITUB)!.direitos[0].pctDividendoMinimo).toBe(25);
    expect(m.get(WEGE)!.direitos[0].pctDividendoMinimo).toBe(25);
    expect(m.get(BBSE)!.direitos).toHaveLength(1);
    expect(m.get(BBSE)!.direitos[0]).toMatchObject({
      especie: 'ON',
      classePn: '',
      pctDividendoMinimo: null,
      direitoDividendoTexto: 'Informações prestadas na seção 18.12.',
    });
  });
});

describe('executarFreSocietario', () => {
  it('grava societário, posição e direitos; nenhum CPF/CNPJ de acionista em nenhuma linha', async () => {
    const { prisma, t } = criarPrisma(UNIVERSO);
    const { ctx } = criarCtx(prisma);
    const baixar = baixarMock(zips());
    const r = await executarFreSocietario(ctx, { baixar });
    expect(r.parcial).toBe(false);
    expect(baixar).toHaveBeenCalledTimes(3);
    // os dois anos da janela (2025 e 2026) + o 2022
    expect([...t.societario.keys()].sort()).toEqual([
      `${ITUB}|2025`,
      `${ITUB}|2026`,
      `${WEGE}|2025`,
      `${WEGE}|2026`,
    ]);
    const itub = t.societario.get(`${ITUB}|2026`)!;
    expect(itub).toMatchObject({
      versao: 4,
      pctCirculacaoOn: 8.119,
      pctCirculacaoPn: 98.683,
      pctCirculacaoTotal: 52.545,
      nAcionistasPf: 653637,
      nAcionistasPj: 12764,
      nAcionistasInst: 1397,
      linkDocFre:
        'https://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?CodigoInstituicao=1&NumeroSequencialDocumento=161558',
    });
    // DT_RECEB da versão usada (nunca a Data_Referencia 31/12/2026)
    expect((itub.dtReceb as Date).toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(t.posicao.filter((l) => l.cnpj === ITUB && l.anoFre === 2026)).toHaveLength(5);
    expect(t.direito.filter((l) => l.anoFre === 2022)).toHaveLength(4);

    const tudo = JSON.stringify([...t.societario.values(), t.posicao, t.direito]);
    expect(tudo).not.toContain(DOC_FALSO_PF);
    expect(tudo).not.toContain(DOC_FALSO_PJ);
    expect(tudo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    for (const l of [...t.posicao, ...t.direito, ...t.societario.values()]) {
      expect(Object.keys(l).filter((k) => /cpf|documento/i.test(k))).toEqual([]);
    }
    expect(r.detalhes).toMatchObject({ universo: 3, filtrado: false });
    expect(typeof (r.detalhes as { rssPicoMb: number }).rssPicoMb).toBe('number');
  });

  it('idempotente: 2ª execução com os arquivos inalterados não regrava (download condicional)', async () => {
    const { prisma, t } = criarPrisma(UNIVERSO);
    const z = zips();
    await executarFreSocietario(criarCtx(prisma).ctx, { baixar: baixarMock(z) });
    const antes = JSON.stringify([...t.societario.entries(), t.posicao, t.direito]);
    const { ctx, contagem } = criarCtx(prisma);
    const r = await executarFreSocietario(ctx, { baixar: baixarMock(z) });
    expect(contagem.linhasGravadas).toBe(0);
    const arquivos = (r.detalhes as { arquivos: { status: string }[] }).arquivos;
    expect(arquivos.map((a) => a.status)).toEqual(['inalterado', 'inalterado', 'inalterado']);
    expect(JSON.stringify([...t.societario.entries(), t.posicao, t.direito])).toBe(antes);
  });

  it('reprocessar regrava sem duplicar (delete + createMany por cnpj+anoFre)', async () => {
    const { prisma, t } = criarPrisma(UNIVERSO);
    const z = zips();
    await executarFreSocietario(criarCtx(prisma).ctx, { baixar: baixarMock(z) });
    const n = t.posicao.length;
    await executarFreSocietario(criarCtx(prisma).ctx, { baixar: baixarMock(z), reprocessar: true });
    expect(t.posicao).toHaveLength(n);
  });

  it('404 do zip do ano corrente = não publicado (aviso, sem falha)', async () => {
    const { prisma } = criarPrisma(UNIVERSO);
    const { ctx, alertas } = criarCtx(prisma);
    const z = zips();
    delete z[urlArquivoFre(2026)];
    const r = await executarFreSocietario(ctx, { baixar: baixarMock(z) });
    const arquivos = (r.detalhes as { arquivos: { ano: number; status: string }[] }).arquivos;
    expect(arquivos.find((a) => a.ano === 2026)?.status).toBe('nao_publicado');
    expect(alertas.map((a) => a.nivel)).toEqual(['aviso']);
  });

  it('universo filtrado (conferência no dev) não registra AnaliseFonteArquivo', async () => {
    const { prisma, t } = criarPrisma(UNIVERSO);
    await executarFreSocietario(criarCtx(prisma).ctx, {
      baixar: baixarMock(zips()),
      cnpjs: [WEGE],
    });
    expect(t.fonte.size).toBe(0);
    expect([...t.societario.keys()].every((k) => k.startsWith(WEGE))).toBe(true);
  });

  it('sem-aplicar (dry-run) lê e conta, sem gravar', async () => {
    const { prisma, t } = criarPrisma(UNIVERSO);
    const { ctx, contagem } = criarCtx(prisma, { aplicar: false });
    await executarFreSocietario(ctx, { baixar: baixarMock(zips()) });
    expect(contagem.linhasLidas).toBeGreaterThan(0);
    expect(t.societario.size + t.posicao.length + t.direito.length + t.fonte.size).toBe(0);
  });

  it('allowlist sem rad.cvm.gov.br (o LINK_DOC é só texto)', () => {
    expect(HOSTS_PERMITIDOS.some((h) => h.includes('rad.cvm'))).toBe(false);
    expect(urlArquivoFre(2026)).toBe(
      'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/fre_cia_aberta_2026.zip',
    );
  });
});
