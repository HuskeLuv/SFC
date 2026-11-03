import prisma from '@/lib/prisma';
import { CSAT_NOTA_PROMOTOR } from '@/lib/csat/regras';

/**
 * KPI de CSAT para o painel admin (ClickUp 86e3vmyup: data, nota recebida e quantidade de
 * avaliações respondidas). Somente leitura. Conta só respostas (nota 1–5); "Agora não" fica fora.
 * O comentário é dado pessoal (texto livre): uso restrito ao atendimento — ver src/services/csat/csat.ts.
 */

export interface CsatAdminItem {
  id: string;
  data: string;
  nota: number;
  comentario: string | null;
  origem: string;
  cliente: { id: string; nome: string; email: string };
}

export interface CsatResumo {
  respostas: number;
  /** média com 2 casas; null sem respostas */
  media: number | null;
  distribuicao: Record<'1' | '2' | '3' | '4' | '5', number>;
  promotores: number;
  /** % de notas 5, com 1 casa; null sem respostas */
  pctPromotores: number | null;
}

export interface CsatAdmin {
  geradoEm: string;
  periodo: { de: string | null; ate: string | null };
  resumo: CsatResumo;
  /** mais recentes primeiro, até `limite` */
  itens: CsatAdminItem[];
  limite: number;
}

/** Pura: resumo a partir da contagem por nota. */
export function resumirCsat(contagem: Array<{ nota: number; quantidade: number }>): CsatResumo {
  const distribuicao: CsatResumo['distribuicao'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let respostas = 0;
  let soma = 0;
  for (const { nota, quantidade } of contagem) {
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) continue;
    distribuicao[String(nota) as keyof CsatResumo['distribuicao']] += quantidade;
    respostas += quantidade;
    soma += nota * quantidade;
  }
  const promotores = distribuicao[String(CSAT_NOTA_PROMOTOR) as '5'];
  return {
    respostas,
    media: respostas ? Math.round((soma / respostas) * 100) / 100 : null,
    distribuicao,
    promotores,
    pctPromotores: respostas ? Math.round((promotores / respostas) * 1000) / 10 : null,
  };
}

export async function getCsatAdmin(params: {
  de: Date | null;
  ate: Date | null;
  limite: number;
}): Promise<CsatAdmin> {
  const createdAt =
    params.de || params.ate
      ? { ...(params.de ? { gte: params.de } : {}), ...(params.ate ? { lt: params.ate } : {}) }
      : undefined;
  const where = { nota: { not: null }, ...(createdAt ? { createdAt } : {}) };

  const [grupos, linhas] = await Promise.all([
    prisma.csatResposta.groupBy({ by: ['nota'], where, _count: { _all: true } }),
    prisma.csatResposta.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limite,
      select: {
        id: true,
        nota: true,
        comentario: true,
        origem: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return {
    geradoEm: new Date().toISOString(),
    periodo: {
      de: params.de ? params.de.toISOString() : null,
      ate: params.ate ? params.ate.toISOString() : null,
    },
    resumo: resumirCsat(
      grupos
        .filter((g) => g.nota !== null)
        .map((g) => ({ nota: g.nota as number, quantidade: g._count._all })),
    ),
    itens: linhas.map((l) => ({
      id: l.id,
      data: l.createdAt.toISOString(),
      nota: l.nota as number,
      comentario: l.comentario,
      origem: l.origem,
      cliente: { id: l.user.id, nome: l.user.name, email: l.user.email },
    })),
    limite: params.limite,
  };
}
