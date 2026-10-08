/**
 * Meus cenários (Bloco D, fatia B): o cenário PRIVADO do usuário por ticker (analise_cenarios,
 * único por userId+symbol). Sempre do usuário LOGADO — quem chama passa payload.id, nunca o
 * targetUserId do consultor (a rota responde 403 no PUT/DELETE e não lê o salvo no GET).
 *
 * Gravação:
 *  - premissas (JSON) = o corpo validado pelo CenarioPutSchema (strict);
 *  - dadosEditados (JSON) = { valores, valoresDoAtivoNoSalvamento } — `valores` só com os dados
 *    do ativo que o usuário mudou; `valoresDoAtivoNoSalvamento` = o valor do ativo de cada um
 *    deles no momento (vindo da base do servidor), para a tela avisar quando o ativo mudar depois.
 *  - limite de MAX_CENARIOS_POR_USUARIO: a CRIAÇÃO do 301º responde 409 (contado dentro da
 *    transação); atualizar um existente nunca esbarra no limite.
 *
 * Leitura tolerante: JSON fora do schema (versão antiga, classe trocada) = sem cenário salvo.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import {
  DadosAcaoSchema,
  DadosFiiSchema,
  MAX_CENARIOS_POR_USUARIO,
  PremissasAcaoSchema,
  PremissasFiiSchema,
  VERSAO_SCHEMA_CENARIO,
} from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import type {
  CenarioPutBody,
  CenarioSalvo,
  DadosEditadosAcao,
  DadosEditadosFii,
  PremissasCenarioAcao,
  PremissasCenarioFii,
} from '@/types/analiseAtivosBlocoD';

export type ClasseCenarioSalvo = 'acao' | 'fii';
export type CenarioSalvoAcao = CenarioSalvo<PremissasCenarioAcao, DadosEditadosAcao>;
export type CenarioSalvoFii = CenarioSalvo<PremissasCenarioFii, DadosEditadosFii>;

/** Valores do ativo (base do servidor) por campo, para guardar junto dos editados. */
export type ValoresDoAtivo = Partial<Record<string, number | null>>;

/** Forma gravada em analise_cenarios.dadosEditados. */
interface DadosGravados {
  valores: Record<string, number>;
  valoresDoAtivoNoSalvamento: Record<string, number>;
}

export const MENSAGEM_LIMITE_CENARIOS = formatarTexto(TEXTOS_CENARIOS.salvamento.limiteCenarios, {
  max: MAX_CENARIOS_POR_USUARIO,
});

function lerDadosGravados(json: Prisma.JsonValue | null): {
  valores: unknown;
  noSalvamento: unknown;
} {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { valores: null, noSalvamento: null };
  }
  const o = json as Record<string, unknown>;
  if ('valores' in o) return { valores: o.valores, noSalvamento: o.valoresDoAtivoNoSalvamento };
  // forma simples (só os valores)
  return { valores: o, noSalvamento: null };
}

function vazioParaNull<T extends object>(o: T | null | undefined): T | null {
  return o && Object.keys(o).length > 0 ? o : null;
}

/** Cenário salvo do usuário para o ticker, ou null (sem registro, classe trocada, JSON inválido). */
export async function lerCenario(
  userId: string,
  symbol: string,
  classe: ClasseCenarioSalvo,
): Promise<CenarioSalvoAcao | CenarioSalvoFii | null> {
  const row = await prisma.analiseCenario.findUnique({
    where: { userId_symbol: { userId, symbol } },
    select: { classe: true, premissas: true, dadosEditados: true, updatedAt: true },
  });
  if (!row || row.classe !== classe) return null;
  const { valores, noSalvamento } = lerDadosGravados(row.dadosEditados);
  const schemaP = classe === 'acao' ? PremissasAcaoSchema : PremissasFiiSchema;
  const schemaD = classe === 'acao' ? DadosAcaoSchema : DadosFiiSchema;
  const p = schemaP.safeParse(row.premissas);
  if (!p.success) return null;
  const d = schemaD.safeParse(valores ?? {});
  const base = schemaD.safeParse(noSalvamento ?? {});
  return {
    premissas: p.data,
    dadosEditados: d.success ? vazioParaNull(d.data) : null,
    atualizadoEm: row.updatedAt.toISOString(),
    valoresDoAtivoNoSalvamento: base.success ? vazioParaNull(base.data) : null,
  } as CenarioSalvoAcao | CenarioSalvoFii;
}

/**
 * Grava (cria ou atualiza) o cenário. `valoresDoAtivo` = base do servidor neste momento (os
 * campos editados guardam o valor do ativo para o aviso de "mudou desde que você salvou").
 * Criação acima do limite ⇒ ApiError 409 (limite atômico: pg_advisory_xact_lock por usuário).
 */
export async function salvarCenario(
  userId: string,
  symbol: string,
  corpo: CenarioPutBody,
  valoresDoAtivo: ValoresDoAtivo = {},
): Promise<{ atualizadoEm: string }> {
  const valores: Record<string, number> = {};
  const noSalvamento: Record<string, number> = {};
  for (const [campo, v] of Object.entries(corpo.dados ?? {})) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    valores[campo] = v;
    const b = valoresDoAtivo[campo];
    if (typeof b === 'number' && Number.isFinite(b)) noSalvamento[campo] = b;
  }
  const dados: DadosGravados | null =
    Object.keys(valores).length > 0 ? { valores, valoresDoAtivoNoSalvamento: noSalvamento } : null;
  const premissas = corpo.premissas as unknown as Prisma.InputJsonValue;
  const dadosJson = dados ? (dados as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

  const r = await prisma.$transaction(async (tx) => {
    const existe = await tx.analiseCenario.findUnique({
      where: { userId_symbol: { userId, symbol } },
      select: { id: true },
    });
    if (!existe) {
      // serializa as criações do mesmo usuário até o fim da transação: sem a trava, PUTs
      // simultâneos (READ COMMITTED) liam o mesmo count = 299 e passavam todos do limite
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`analise_cenario:${userId}`}::text))`;
      const total = await tx.analiseCenario.count({ where: { userId } });
      if (total >= MAX_CENARIOS_POR_USUARIO) throw new ApiError(409, MENSAGEM_LIMITE_CENARIOS);
    }
    return tx.analiseCenario.upsert({
      where: { userId_symbol: { userId, symbol } },
      create: {
        userId,
        symbol,
        classe: corpo.classe,
        premissas,
        dadosEditados: dadosJson,
        versaoSchema: VERSAO_SCHEMA_CENARIO,
      },
      update: {
        classe: corpo.classe,
        premissas,
        dadosEditados: dadosJson,
        versaoSchema: VERSAO_SCHEMA_CENARIO,
      },
      select: { updatedAt: true },
    });
  });
  return { atualizadoEm: r.updatedAt.toISOString() };
}

/** "Restaurar valores do ativo": apaga (idempotente, preso ao userId). */
export async function apagarCenario(userId: string, symbol: string): Promise<void> {
  await prisma.analiseCenario.deleteMany({ where: { userId, symbol } });
}

/** Cenários do usuário para a exportação LGPD (Art. 18, V). */
export async function cenariosParaExportacao(userId: string) {
  const rows = await prisma.analiseCenario.findMany({
    where: { userId },
    select: {
      symbol: true,
      classe: true,
      premissas: true,
      dadosEditados: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((r) => ({
    symbol: r.symbol,
    classe: r.classe,
    premissas: r.premissas,
    dadosEditados: lerDadosGravados(r.dadosEditados).valores ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
