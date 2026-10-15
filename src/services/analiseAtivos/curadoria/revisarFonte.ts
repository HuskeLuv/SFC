/**
 * Núcleo da casca de CLI scripts/analise-ativos/revisar-fonte.ts (v2.5): aprova ou rejeita o ponto
 * de provedor de um caso 'fonte_externa' passando pela MESMA ação do curador da tela
 * (aplicarAcaoCaso 'decidir' → efeitoFonteExterna na mesma transação) — então o caso fecha junto e
 * fica a trilha de eventos. Só admins (role 'admin', como /admin/curadoria). Dry-run por padrão.
 */
import type { PrismaClient } from '@prisma/client';
import { aplicarAcaoCaso } from '@/services/analiseAtivos/curadoria/acoesCuradoria';
import { casoFechado } from '@/services/analiseAtivos/curadoria/contrato';
import {
  corpoDecisaoFonte,
  ehCasoFonteExterna,
  referenciaDoContexto,
  type DecisaoFonte,
} from '@/services/analiseAtivos/curadoria/efeitoFonteExterna';
import type { ReferenciaPontoFonte } from '@/types/analiseAtivosCuradoria';

export interface PedidoRevisaoFonte {
  casoId: string;
  decisao: DecisaoFonte;
  /** e-mail do admin que decide (vira resolvidoPorId / reviewedBy) */
  revisorEmail: string;
  nota?: string;
  aplicar: boolean;
  agora?: Date;
}

export interface ResultadoRevisaoFonte {
  casoId: string;
  symbol: string;
  campo: string;
  periodo: string | null;
  referencia: ReferenciaPontoFonte;
  decisao: DecisaoFonte;
  revisorId: string;
  aplicado: boolean;
}

export async function revisarCasoFonte(
  prisma: PrismaClient,
  p: PedidoRevisaoFonte,
): Promise<ResultadoRevisaoFonte> {
  const revisor = await prisma.user.findFirst({
    where: { email: p.revisorEmail.trim().toLowerCase() },
    select: { id: true, role: true },
  });
  if (!revisor || revisor.role !== 'admin') {
    throw new Error(`revisor ${p.revisorEmail} não encontrado ou não é admin`);
  }
  const caso = await prisma.analiseCasoDado.findUnique({
    where: { id: p.casoId },
    select: {
      id: true,
      symbol: true,
      campo: true,
      periodo: true,
      grupo: true,
      status: true,
      contexto: true,
      updatedAt: true,
    },
  });
  if (!caso) throw new Error(`caso ${p.casoId} não encontrado`);
  if (!ehCasoFonteExterna(caso.grupo)) {
    throw new Error(`caso ${p.casoId} não é do grupo fonte_externa (grupo: ${caso.grupo})`);
  }
  if (casoFechado(caso.status)) throw new Error(`caso ${p.casoId} já está fechado`);
  const referencia = referenciaDoContexto(caso.contexto);
  if (!referencia) throw new Error(`caso ${p.casoId} sem referência do ponto no contexto`);

  if (p.aplicar) {
    await aplicarAcaoCaso(prisma, {
      casoId: caso.id,
      adminId: revisor.id,
      corpo: corpoDecisaoFonte(p.decisao, caso.updatedAt.toISOString(), p.nota),
      agora: p.agora,
    });
  }
  return {
    casoId: caso.id,
    symbol: caso.symbol,
    campo: caso.campo,
    periodo: caso.periodo,
    referencia,
    decisao: p.decisao,
    revisorId: revisor.id,
    aplicado: p.aplicar,
  };
}
