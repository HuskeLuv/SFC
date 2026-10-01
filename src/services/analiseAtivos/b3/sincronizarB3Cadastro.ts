/**
 * Job 'b3-cadastro' (cron dom 05:30 UTC): ClassifSetorial.xlsx da B3 (~16 KB) ⇒ AssetSetorB3.
 *
 * - sha256 igual ao último arquivo processado ⇒ não reprocessa; só confirma o frescor das raízes.
 * - Raiz nova ⇒ alerta info; raiz que sumiu ⇒ presenteUltimoArquivo=false + alerta aviso (nunca
 *   apaga: a Fase 1 ainda pode mostrar o setor de uma empresa deslistada).
 * - Arquivo com bem menos raízes que o cadastro atual (< 50%) ⇒ ErroFonte: endpoint não documentado
 *   devolvendo planilha parcial não pode marcar metade do mercado como "sumida".
 */
import * as XLSX from 'xlsx';
import { readFile } from 'fs/promises';
import {
  LIMITES_B3,
  URL_CLASSIF_SETORIAL,
  obterArquivoB3,
} from '@/services/analiseAtivos/b3/b3Arquivos';
import { confirmarSetoresPresentes, gravarSetores } from '@/services/analiseAtivos/b3/gravarB3';
import { ErroFonte, ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';
import {
  conferirTetosDescompressao,
  listarEntradasZip,
  type EntradaZip,
} from '@/services/analiseAtivos/fontes/zipStream';
import {
  diffRaizes,
  parseClassifSetorial,
  type SetorB3,
} from '@/services/analiseAtivos/regras/b3/classifSetorial';
import {
  condicionalDownload,
  marcarProcessado,
  obterFonteArquivo,
  registrarDownload,
} from '@/services/analiseAtivos/repositorio/fontesArquivo';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export const NOME_CLASSIF_SETORIAL = 'ClassifSetorial.xlsx';
/** Fração mínima de raízes do arquivo novo em relação às presentes no cadastro. */
const FRACAO_MINIMA_RAIZES = 0.5;
const MAX_ALERTAS_RAIZ = 30;

/** Planilha (buffer .xlsx) ⇒ linhas cruas da 1ª aba ⇒ setores. */
export function lerClassifSetorial(buf: Buffer, arquivo = NOME_CLASSIF_SETORIAL): SetorB3[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer' });
  } catch {
    throw new ErroLayoutFonte(arquivo, ['planilha .xlsx legível']);
  }
  const aba = wb.SheetNames[0];
  if (!aba) throw new ErroLayoutFonte(arquivo, ['aba com a classificação']);
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, defval: '' });
  return parseClassifSetorial(linhas, arquivo);
}

export interface OpcoesB3Cadastro {
  cacheDir?: string | string[] | null;
}

export async function sincronizarB3Cadastro(
  ctx: JobContexto,
  opts: OpcoesB3Cadastro = {},
): Promise<ResultadoJob> {
  const { prisma } = ctx;
  const url = URL_CLASSIF_SETORIAL;
  const agora = new Date();
  const fonte = await obterFonteArquivo(prisma, url);
  const arq = await obterArquivoB3(url, {
    maxBytes: LIMITES_B3.maxBytesClassifSetorial,
    timeoutMs: Math.min(LIMITES_B3.timeoutMs, Math.max(5_000, ctx.restanteMs())),
    condicional: condicionalDownload(fonte),
    cacheDir: opts.cacheDir,
    nomeCache: NOME_CLASSIF_SETORIAL,
  });

  try {
    if (arq.status === 'nao_modificado') {
      const confirmadas = ctx.aplicar ? await confirmarSetoresPresentes(prisma, agora) : 0;
      return { detalhes: { arquivo: 'inalterado (sha256/ETag)', confirmadas } };
    }
    if (!arq.caminho) throw new ErroFonte('http_erro', 'ClassifSetorial: download sem arquivo');
    if (ctx.aplicar && !arq.doCache) {
      await registrarDownload(prisma, url, {
        etag: arq.etag,
        lastModified: arq.lastModified,
        bytes: arq.bytes,
        sha256: arq.sha256,
      });
    }

    // .xlsx = zip: confere o tamanho descomprimido ANTES do XLSX.read (que infla tudo em memória)
    let entradas: EntradaZip[];
    try {
      entradas = await listarEntradasZip(arq.caminho);
    } catch {
      throw new ErroLayoutFonte(NOME_CLASSIF_SETORIAL, ['planilha .xlsx legível']);
    }
    conferirTetosDescompressao(entradas, NOME_CLASSIF_SETORIAL, {
      maxTotal: LIMITES_B3.maxDescomprimidoClassifSetorial,
    });
    const setores = lerClassifSetorial(await readFile(arq.caminho));
    ctx.contar('linhasLidas', setores.length);

    const existentes = await prisma.assetSetorB3.findMany({
      select: { raiz: true, presenteUltimoArquivo: true },
    });
    const presentesAntes = existentes.filter((e) => e.presenteUltimoArquivo).map((e) => e.raiz);
    if (
      presentesAntes.length > 0 &&
      setores.length < presentesAntes.length * FRACAO_MINIMA_RAIZES
    ) {
      throw new ErroFonte(
        'layout_mudou',
        `ClassifSetorial com ${setores.length} raízes contra ${presentesAntes.length} no cadastro`,
      );
    }
    const { novas, sumidas } = diffRaizes(
      presentesAntes,
      setores.map((s) => s.raiz),
    );
    const primeiraCarga = existentes.length === 0;

    if (!primeiraCarga) {
      for (const r of novas.slice(0, MAX_ALERTAS_RAIZ)) {
        const s = setores.find((x) => x.raiz === r);
        ctx.alertar({
          codigo: 'raiz_nova',
          nivel: 'info',
          mensagem: `raiz nova no ClassifSetorial: ${r} (${s?.nomePregao ?? ''} · ${s?.segmento ?? ''})`,
          ref: r,
        });
      }
    }
    for (const r of sumidas.slice(0, MAX_ALERTAS_RAIZ)) {
      ctx.alertar({
        codigo: 'raiz_sumida',
        nivel: 'aviso',
        mensagem: `raiz ${r} saiu do ClassifSetorial (deslistada?)`,
        ref: r,
      });
    }

    let gravacao = { inseridas: 0, atualizadas: 0, marcadasAusentes: 0 };
    if (ctx.aplicar) {
      gravacao = await gravarSetores(prisma, setores, sumidas, agora);
      ctx.contar('linhasGravadas', gravacao.inseridas + gravacao.atualizadas);
      if (!arq.doCache) await marcarProcessado(prisma, url, 'b3-cadastro');
    }
    return {
      detalhes: {
        raizes: setores.length,
        primeiraCarga,
        novas: novas.length,
        sumidas,
        ...gravacao,
        bytes: arq.bytes,
        doCache: arq.doCache,
      },
    };
  } finally {
    await arq.descartar();
  }
}
