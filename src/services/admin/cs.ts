/**
 * Painel de CS (ticket 86e3vmyrc, 03/11/2026) — visão por CLIENTE para o time de
 * Customer Success, dentro do /admin (só `role === 'admin'`), SOMENTE LEITURA.
 *
 * Nada de valores financeiros por cliente: só contagens, datas e sim/não.
 * Tudo sai de tabelas que já existem — nenhuma migração, nada gravado.
 *
 * Fontes de "uso" por área (sempre a AÇÃO do próprio cliente; o que o consultor
 * fez agindo por ele fica de fora do engajamento):
 * - Carteira: user_change_logs (carteira) + criação de transações e de renda fixa;
 * - Fluxo: user_change_logs (fluxo-caixa, menos `orcamento.*`) + criação de valores
 *   no Fluxo, EXCETO linhas-espelho geradas pelo sistema (dívidas e sonhos, que o
 *   cron preenche sozinho) e células vindas do banco (o "aplicar" do cliente já
 *   está no log; a importação automática não é uso);
 * - Orçamento: user_change_logs `orcamento.*` + criação de orçados;
 * - Planejamento: user_change_logs (planejamento) + criação de sonhos/aposentadoria;
 * - Assistente: mensagens enviadas;
 * - Conexões: banco conectado ou atualizado à mão (sync automático não conta).
 *
 * ATIVAÇÃO = a PRIMEIRA, entre:
 * - primeiro ativo cadastrado na Carteira (transação ou renda fixa);
 * - primeiro lançamento no Fluxo de Caixa (fora das linhas-espelho);
 * - primeiro banco conectado (Open Finance, fora do sandbox).
 * Vale também quando o consultor fez pelo cliente: a conta passou a ter dado útil.
 */
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { inicioDoMes } from '@/services/assistente/limite';
import {
  AREAS_CS,
  type AcaoAtivacao,
  type AreaCs,
  type ClienteCs,
  type FaixaAtividade,
  type PainelCs,
} from './csTipos';

export * from './csTipos';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Linha crua do SQL (datas como Date, contagens como bigint). */
export interface LinhaCsRaw {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'consultant';
  createdAt: Date;
  accessLevel: number;
  ultimo_login: Date | null;
  ativos: bigint | number | null;
  usa_fluxo: boolean;
  usa_orcamento: boolean;
  msg_mes: bigint | number | null;
  open_finance: boolean | null;
  prim_carteira: Date | null;
  prim_fluxo: Date | null;
  prim_conexao: Date | null;
  ult_carteira: Date | null;
  ult_fluxo: Date | null;
  ult_orcamento: Date | null;
  ult_planejamento: Date | null;
  ult_assistente: Date | null;
  ult_conexoes: Date | null;
}

const num = (v: bigint | number | null | undefined): number =>
  v == null ? 0 : typeof v === 'bigint' ? Number(v) : v;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const maxData = (...ds: (Date | null | undefined)[]): Date | null => {
  let m: Date | null = null;
  for (const d of ds) if (d && (!m || d > m)) m = d;
  return m;
};

const diasEntre = (de: Date, ate: Date) =>
  Math.max(0, Math.floor((ate.getTime() - de.getTime()) / DIA_MS));

export function faixaPorDias(dias: number | null): FaixaAtividade {
  if (dias == null) return 'nunca';
  if (dias > 30) return 'inativo30';
  if (dias > 7) return 'inativo7';
  return 'ativo';
}

function mediana(ns: number[]): number | null {
  if (ns.length === 0) return null;
  const s = [...ns].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/** Ativação: a primeira das três ações (empate fica na ordem carteira → fluxo → conexão). */
function ativacaoDe(l: LinhaCsRaw): { em: Date | null; acao: AcaoAtivacao | null } {
  const candidatos: [AcaoAtivacao, Date | null][] = [
    ['carteira', l.prim_carteira],
    ['fluxo', l.prim_fluxo],
    ['conexao', l.prim_conexao],
  ];
  let em: Date | null = null;
  let acao: AcaoAtivacao | null = null;
  for (const [a, d] of candidatos) {
    if (d && (!em || d < em)) {
      em = d;
      acao = a;
    }
  }
  return { em, acao };
}

/** Monta o painel a partir das linhas do SQL. Pura (testável sem banco). */
export function montarPainelCs(linhas: LinhaCsRaw[], agora: Date): PainelCs {
  const d7 = new Date(agora.getTime() - 7 * DIA_MS);
  const d30 = new Date(agora.getTime() - 30 * DIA_MS);

  const clientes: ClienteCs[] = linhas.map((l) => {
    const porArea: Record<AreaCs, Date | null> = {
      carteira: l.ult_carteira,
      fluxo: l.ult_fluxo,
      orcamento: l.ult_orcamento,
      planejamento: l.ult_planejamento,
      assistente: l.ult_assistente,
      conexoes: l.ult_conexoes,
    };
    const ultimaAtividade = maxData(...Object.values(porArea));
    const ultimoAcesso = maxData(l.ultimo_login, ultimaAtividade);
    const diasSemAcesso = ultimoAcesso ? diasEntre(ultimoAcesso, agora) : null;
    const { em, acao } = ativacaoDe(l);
    return {
      id: l.id,
      nome: l.name,
      email: l.email,
      papel: l.role,
      cadastroEm: l.createdAt.toISOString(),
      nivelAcesso: l.accessLevel,
      ultimoLogin: iso(l.ultimo_login),
      ultimaAtividade: iso(ultimaAtividade),
      ultimoAcesso: iso(ultimoAcesso),
      diasSemAcesso,
      faixa: faixaPorDias(diasSemAcesso),
      openFinanceConectado: !!l.open_finance,
      ativosCarteira: num(l.ativos),
      usaFluxo: !!l.usa_fluxo,
      usaOrcamento: !!l.usa_orcamento,
      mensagensAssistenteMes: num(l.msg_mes),
      ultimoUsoPorArea: Object.fromEntries(AREAS_CS.map((a) => [a, iso(porArea[a])])) as Record<
        AreaCs,
        string | null
      >,
      ativacao: {
        em: iso(em),
        acao,
        diasAteAtivar: em ? diasEntre(l.createdAt, em) : null,
      },
    };
  });

  const ativados = clientes.filter((c) => c.ativacao.em);
  const dias = ativados.map((c) => c.ativacao.diasAteAtivar ?? 0);
  const porAcao: Record<AcaoAtivacao, number> = { carteira: 0, fluxo: 0, conexao: 0 };
  for (const c of ativados) if (c.ativacao.acao) porAcao[c.ativacao.acao] += 1;

  const porArea = AREAS_CS.map((area) => {
    let usuarios30d = 0;
    let usuarios7d = 0;
    for (const c of clientes) {
      const u = c.ultimoUsoPorArea[area];
      if (!u) continue;
      const d = new Date(u);
      if (d >= d30) usuarios30d += 1;
      if (d >= d7) usuarios7d += 1;
    }
    return { area, usuarios30d, usuarios7d };
  });

  const contaFaixa = (f: FaixaAtividade) => clientes.filter((c) => c.faixa === f).length;

  return {
    geradoEm: agora.toISOString(),
    inicioMes: inicioDoMes(agora).toISOString(),
    clientes,
    ativacao: {
      total: clientes.length,
      ativados: ativados.length,
      pctAtivados:
        clientes.length > 0 ? Math.round((ativados.length / clientes.length) * 1000) / 10 : 0,
      medianaDias: mediana(dias),
      mediaDias:
        dias.length > 0
          ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10
          : null,
      ativados7d: ativados.filter((c) => new Date(c.ativacao.em as string) >= d7).length,
      porAcao,
    },
    engajamento: {
      ativos7d: contaFaixa('ativo'),
      inativos7a30: contaFaixa('inativo7'),
      inativos30: contaFaixa('inativo30'),
      nuncaAcessaram: contaFaixa('nunca'),
      porArea,
    },
    csat: null,
  };
}

/**
 * Uma consulta só, agregada por usuário (CTEs com GROUP BY + LEFT JOIN). Admins
 * ficam de fora (não são clientes). Lê apenas datas e contagens.
 */
export async function carregarLinhasCs(agora: Date): Promise<LinhaCsRaw[]> {
  const inicioMes = inicioDoMes(agora);
  return prisma.$queryRaw<LinhaCsRaw[]>(Prisma.sql`
    WITH
    login AS (
      SELECT "userId" AS uid, max("createdAt") AS ultimo
      FROM login_events WHERE success AND "userId" IS NOT NULL GROUP BY 1
    ),
    logs AS (
      SELECT "userId" AS uid,
        max("createdAt") FILTER (WHERE section = 'carteira') AS carteira,
        max("createdAt") FILTER (WHERE section = 'fluxo-caixa' AND action NOT LIKE 'orcamento.%') AS fluxo,
        max("createdAt") FILTER (WHERE section = 'fluxo-caixa' AND action LIKE 'orcamento.%') AS orcamento,
        max("createdAt") FILTER (WHERE section = 'planejamento') AS planejamento
      FROM user_change_logs WHERE NOT "viaConsultant" GROUP BY 1
    ),
    tx AS (
      SELECT "userId" AS uid, min("createdAt") AS primeiro, max("createdAt") AS ultimo
      FROM stock_transactions GROUP BY 1
    ),
    rf AS (
      SELECT "userId" AS uid, min("createdAt") AS primeiro, max("createdAt") AS ultimo
      FROM fixed_income_assets GROUP BY 1
    ),
    port AS (
      SELECT "userId" AS uid, count(*) FILTER (WHERE quantity > 0) AS ativos
      FROM portfolios GROUP BY 1
    ),
    fluxo AS (
      SELECT v."userId" AS uid, min(v."createdAt") AS primeiro, max(v."createdAt") AS ultimo
      FROM "CashflowValue" v
      JOIN "CashflowItem" i ON i.id = v."itemId"
      WHERE i."dividaId" IS NULL AND i."objetivoId" IS NULL AND v."valorBanco" = 0
      GROUP BY 1
    ),
    orc AS (
      SELECT uid, max(c) AS ultimo FROM (
        SELECT "userId" AS uid, "createdAt" AS c FROM cashflow_orcamento_itens
        UNION ALL SELECT "userId", "createdAt" FROM cashflow_orcamentos
      ) o GROUP BY 1
    ),
    plan AS (
      SELECT uid, max(c) AS ultimo FROM (
        SELECT "userId" AS uid, "createdAt" AS c FROM planejamento_objetivos
        UNION ALL SELECT "userId", "createdAt" FROM aposentadoria_planos
      ) p GROUP BY 1
    ),
    assist AS (
      SELECT "userId" AS uid,
        max("createdAt") FILTER (WHERE NOT "viaConsultant") AS ultimo,
        count(*) FILTER (WHERE ok AND "createdAt" >= ${inicioMes}) AS mes
      FROM assistente_mensagens GROUP BY 1
    ),
    banco AS (
      SELECT "userId" AS uid, min("createdAt") AS primeiro,
        max(greatest("createdAt", "lastManualUpdateAt")) AS ultimo,
        bool_or(status <> 'DELETED') AS conectado
      FROM bank_connections WHERE NOT "isSandbox" GROUP BY 1
    )
    SELECT u.id, u.name, u.email, u.role::text AS role, u."createdAt", u."accessLevel",
      login.ultimo AS ultimo_login,
      coalesce(port.ativos, 0) AS ativos,
      (fluxo.uid IS NOT NULL OR logs.fluxo IS NOT NULL) AS usa_fluxo,
      (orc.uid IS NOT NULL OR logs.orcamento IS NOT NULL) AS usa_orcamento,
      coalesce(assist.mes, 0) AS msg_mes,
      coalesce(banco.conectado, false) AS open_finance,
      least(tx.primeiro, rf.primeiro) AS prim_carteira,
      fluxo.primeiro AS prim_fluxo,
      banco.primeiro AS prim_conexao,
      greatest(logs.carteira, tx.ultimo, rf.ultimo) AS ult_carteira,
      greatest(logs.fluxo, fluxo.ultimo) AS ult_fluxo,
      greatest(logs.orcamento, orc.ultimo) AS ult_orcamento,
      greatest(logs.planejamento, plan.ultimo) AS ult_planejamento,
      assist.ultimo AS ult_assistente,
      banco.ultimo AS ult_conexoes
    FROM "User" u
    LEFT JOIN login ON login.uid = u.id
    LEFT JOIN logs ON logs.uid = u.id
    LEFT JOIN tx ON tx.uid = u.id
    LEFT JOIN rf ON rf.uid = u.id
    LEFT JOIN port ON port.uid = u.id
    LEFT JOIN fluxo ON fluxo.uid = u.id
    LEFT JOIN orc ON orc.uid = u.id
    LEFT JOIN plan ON plan.uid = u.id
    LEFT JOIN assist ON assist.uid = u.id
    LEFT JOIN banco ON banco.uid = u.id
    WHERE u.role <> 'admin'
    ORDER BY u."createdAt" DESC
  `);
}

export async function getPainelCs(agora = new Date()): Promise<PainelCs> {
  const linhas = await carregarLinhasCs(agora);
  return montarPainelCs(linhas, agora);
}
