/**
 * Registro dos arquivos de fonte baixados (AnaliseFonteArquivo, escritor = fatia 0 via este módulo,
 * chamado pelos jobs A/B/C/E). ETag/Last-Modified/sha256 permitem pular arquivo inalterado —
 * essencial para caber em 4 min. `processadoEm` só é gravado após a gravação OK: arquivo baixado e
 * não processado é baixado de novo por inteiro (sem condicional).
 */
import type { PrismaClient } from '@prisma/client';
import { paraNumero } from '@/services/analiseAtivos/repositorio/conversao';

export interface FonteArquivo {
  url: string;
  etag: string | null;
  lastModified: string | null;
  bytes: number | null;
  sha256: string | null;
  baixadoEm: Date;
  processadoEm: Date | null;
  jobUltimo: string | null;
}

export async function obterFonteArquivo(
  prisma: PrismaClient,
  url: string,
): Promise<FonteArquivo | null> {
  const l = await prisma.analiseFonteArquivo.findUnique({ where: { url } });
  return l ? { ...l, bytes: paraNumero(l.bytes) } : null;
}

/** Condicional para baixarParaArquivo: só quando o último download foi processado com sucesso. */
export function condicionalDownload(
  f: FonteArquivo | null,
): { etag: string | null; lastModified: string | null; sha256: string | null } | undefined {
  if (!f || !f.processadoEm) return undefined;
  return { etag: f.etag, lastModified: f.lastModified, sha256: f.sha256 };
}

export async function registrarDownload(
  prisma: PrismaClient,
  url: string,
  meta: { etag: string | null; lastModified: string | null; bytes: number; sha256: string | null },
): Promise<void> {
  const dados = {
    etag: meta.etag,
    lastModified: meta.lastModified,
    bytes: BigInt(meta.bytes),
    sha256: meta.sha256,
    baixadoEm: new Date(),
    processadoEm: null,
  };
  await prisma.analiseFonteArquivo.upsert({
    where: { url },
    create: { url, ...dados },
    update: dados,
  });
}

export async function marcarProcessado(
  prisma: PrismaClient,
  url: string,
  job: string,
): Promise<void> {
  await prisma.analiseFonteArquivo.update({
    where: { url },
    data: { processadoEm: new Date(), jobUltimo: job },
  });
}
