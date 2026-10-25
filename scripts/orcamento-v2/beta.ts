/**
 * Lista do beta do Orçamento v2 (tabela feature_beta_users, recurso 'orcamento-v2'), desenho
 * técnico §8. Diferente da Análise de Ativos, admin NÃO entra sem estar na lista.
 *
 * DRY-RUN por padrão; só grava com --aplicar. Usuários por e-mail (ou id).
 *
 *   npx tsx --env-file=.env scripts/orcamento-v2/beta.ts --listar
 *   npx tsx --env-file=.env scripts/orcamento-v2/beta.ts --adicionar a@x.com,b@y.com \
 *       [--motivo "interno"] [--por "wellington"] [--aplicar]
 *   npx tsx --env-file=.env scripts/orcamento-v2/beta.ts --remover a@x.com [--aplicar]
 *
 * Entrar no beta NÃO ativa: a tela v2 só aparece com `liberada && ativado` (ativado =
 * cashflow_orcamento_prefs.estruturaCriadaEm, gravado pelo script de ativação). Remover do beta
 * devolve a tela antiga sem desfazer a ativação (para isso, o script de desativação).
 *
 * Em produção (Lightsail): cd /opt/myfinance/current com o app.env carregado, com OK do Wellington
 * por ação. O servidor guarda o acesso por 60 s por usuário (TTL_ACESSO_MS): a mudança vale em até
 * 1 minuto, sem reiniciar.
 */
import { PrismaClient } from '@prisma/client';

export const RECURSO = 'orcamento-v2';

export type Acao = 'listar' | 'adicionar' | 'remover';

export interface Opcoes {
  acao: Acao;
  alvos: string[];
  motivo: string | null;
  por: string;
  aplicar: boolean;
}

function valorDe(argv: string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  if (i < 0) return null;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

const lista = (s: string | null) =>
  (s ?? '')
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export function lerOpcoes(argv: string[]): Opcoes {
  const aplicar = argv.includes('--aplicar');
  const motivo = valorDe(argv, '--motivo');
  const por = valorDe(argv, '--por') ?? process.env.USER ?? 'script';
  if (argv.includes('--listar')) return { acao: 'listar', alvos: [], motivo, por, aplicar };
  if (argv.includes('--adicionar')) {
    return { acao: 'adicionar', alvos: lista(valorDe(argv, '--adicionar')), motivo, por, aplicar };
  }
  if (argv.includes('--remover')) {
    return { acao: 'remover', alvos: lista(valorDe(argv, '--remover')), motivo, por, aplicar };
  }
  throw new Error('Use --listar, --adicionar <e-mails> ou --remover <e-mails>');
}

const ehUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export interface UsuarioAlvo {
  id: string;
  email: string;
}

export interface Plano {
  mudar: UsuarioAlvo[];
  semMudanca: UsuarioAlvo[];
  naoEncontrados: string[];
}

/**
 * Puro: casa os alvos (e-mail sem diferenciar maiúsculas, ou id) com os usuários encontrados e
 * separa quem muda de quem já está no estado pedido. Duplicados contam uma vez.
 */
export function planejar(
  acao: 'adicionar' | 'remover',
  alvos: string[],
  usuarios: UsuarioAlvo[],
  idsNaLista: Set<string>,
): Plano {
  const porChave = new Map<string, UsuarioAlvo>();
  for (const u of usuarios) {
    porChave.set(u.email.toLowerCase(), u);
    porChave.set(u.id, u);
  }
  const encontrados: UsuarioAlvo[] = [];
  const naoEncontrados: string[] = [];
  for (const a of alvos) {
    const u = porChave.get(ehUuid(a) ? a : a.toLowerCase());
    if (!u) naoEncontrados.push(a);
    else if (!encontrados.some((x) => x.id === u.id)) encontrados.push(u);
  }
  const muda = (u: UsuarioAlvo) =>
    acao === 'adicionar' ? !idsNaLista.has(u.id) : idsNaLista.has(u.id);
  return {
    mudar: encontrados.filter(muda),
    semMudanca: encontrados.filter((u) => !muda(u)),
    naoEncontrados,
  };
}

/**
 * Grava a mudança na lista (idempotente: adicionar ignora quem já está; remover ignora quem não
 * está). Devolve quantas linhas mudaram. Também usada por `ativar.ts --beta`, que inclui o
 * usuário no beta no mesmo comando, depois de ativar e verificar.
 */
export async function gravarBeta(
  prisma: Pick<PrismaClient, 'featureBetaUser'>,
  acao: 'adicionar' | 'remover',
  usuarios: UsuarioAlvo[],
  por: string,
  motivo: string | null,
): Promise<number> {
  if (usuarios.length === 0) return 0;
  if (acao === 'adicionar') {
    const r = await prisma.featureBetaUser.createMany({
      data: usuarios.map((u) => ({ recurso: RECURSO, userId: u.id, adicionadoPor: por, motivo })),
      skipDuplicates: true,
    });
    return r.count;
  }
  const r = await prisma.featureBetaUser.deleteMany({
    where: { recurso: RECURSO, userId: { in: usuarios.map((u) => u.id) } },
  });
  return r.count;
}

async function listar(prisma: PrismaClient) {
  const beta = await prisma.featureBetaUser.findMany({
    where: { recurso: RECURSO },
    select: {
      createdAt: true,
      adicionadoPor: true,
      motivo: true,
      user: {
        select: {
          email: true,
          role: true,
          cashflowOrcamentoPrefs: { select: { estruturaCriadaEm: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`=== Beta '${RECURSO}': ${beta.length} na lista (admin não entra sem a lista) ===`);
  for (const b of beta) {
    const ativadoEm = b.user.cashflowOrcamentoPrefs?.estruturaCriadaEm;
    const ativacao = ativadoEm
      ? `ativado em ${ativadoEm.toISOString().slice(0, 10)}`
      : 'não ativado';
    console.log(
      `  ${b.user.email} · ${b.user.role} · ${ativacao} · desde ${b.createdAt.toISOString().slice(0, 10)} · por ${b.adicionadoPor}${b.motivo ? ` · ${b.motivo}` : ''}`,
    );
  }
}

async function main() {
  const op = lerOpcoes(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    if (op.acao === 'listar') {
      await listar(prisma);
      return;
    }
    if (op.alvos.length === 0) throw new Error('Nenhum e-mail/id informado');
    const emails = op.alvos.filter((a) => !ehUuid(a)).map((a) => a.toLowerCase());
    const ids = op.alvos.filter(ehUuid);
    const usuarios = await prisma.user.findMany({
      where: { OR: [{ email: { in: emails, mode: 'insensitive' } }, { id: { in: ids } }] },
      select: { id: true, email: true },
    });
    const atuais = await prisma.featureBetaUser.findMany({
      where: { recurso: RECURSO, userId: { in: usuarios.map((u) => u.id) } },
      select: { userId: true },
    });
    const { mudar, semMudanca, naoEncontrados } = planejar(
      op.acao,
      op.alvos,
      usuarios,
      new Set(atuais.map((a) => a.userId)),
    );

    console.log(`=== ${op.acao} '${RECURSO}' (${op.aplicar ? 'APLICAR' : 'dry-run'}) ===`);
    for (const u of mudar) console.log(`  ${op.acao === 'adicionar' ? '+' : '-'} ${u.email}`);
    for (const u of semMudanca) {
      console.log(`  = ${u.email} (${op.acao === 'adicionar' ? 'já está' : 'não está'} na lista)`);
    }
    for (const a of naoEncontrados) console.log(`  ? ${a} (usuário não encontrado)`);

    if (!op.aplicar) {
      console.log(
        `\nDry-run: nada gravado (${mudar.length} mudança(s)). Use --aplicar para gravar.`,
      );
      return;
    }
    if (mudar.length === 0) {
      console.log('\nNada a gravar.');
      return;
    }
    const n = await gravarBeta(prisma, op.acao, mudar, op.por, op.motivo);
    console.log(
      `\nGravado: ${n} ${op.acao === 'adicionar' ? 'adicionado' : 'removido'}(s). Vale em até 60 s (cache do acesso).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
